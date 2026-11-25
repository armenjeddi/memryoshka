"""Online memory writer with one price per bit (Section 3.3 of the paper).

Every stored token can be dropped or kept with a prefix of its nested code. For a token with importance a and a frame
with novelty v, keeping r bits is worth a * v * (e(r) - e0) and costs price * (r + 24) bits. Each token takes the option
with the largest value minus cost, and a frame is kept only if its tokens' combined surplus pays for the frame's own
4,152 bits (search tag, timestamp, novelty). The price starts at 0. When a new frame would make the memory larger than
the budget, the price is raised by bisection until the memory fits in 90% of the budget. A higher price can only shorten
codes or remove them, so stored codes are never re-encoded and removed bits are gone.

Sizes are the exact serialized sizes of the format below (the same accounting as the paper's runs):
  memory header                84 bytes
  last 8 frame tags            514 bytes each (int8 values and a float16 scale; used for novelty)
  each stored frame            4 + 30 + 514 bytes (record length, frame fields, search tag)
  each stored token            3 bytes (12-bit position, 8-bit importance, 4-bit code length) + r / 8 bytes of code
"""
from __future__ import annotations

import hashlib
import json
import math
import struct
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .codec import FULL_BITS, NestedCode

LENGTHS = (32, 64, 128, 256, 512, 1024, 2048, 4096)   # code lengths a token may keep, in bits
TOKEN_META_BITS = 24        # b_tok in the paper: position, importance and code length of a stored token
TAG_DIM = 512               # LongCLIP-B/16 embedding size
TAG_BYTES = TAG_DIM + 2     # int8 values plus a float16 scale
FRAME_META_BITS = 8 * (TAG_BYTES + 5)   # beta in the paper: 4,152 bits for the search tag, timestamp and novelty
NOVELTY_WINDOW = 8          # novelty compares a frame with the previous 8 frames seen
NOVELTY_MIN = 0.05
DEFAULT_BUDGET = 7_168_000  # bytes; the size of 1,000 visual tokens of Qwen2.5-VL-7B at 16 bits

_HEADER = struct.Struct("<4sBBHQddQdI32s")   # 84 bytes
_FRAME = struct.Struct("<QfIIIBBI")          # 30 bytes: id, timestamp, grid (3), novelty, position width, token count
_SIZE = struct.Struct("<I")
_MAGIC, _VERSION = b"MRYK", 1

# importance and novelty are stored as one byte each; the writer uses the decoded values
_IMPORTANCE = np.array([2.0 ** (-8 + v * 16 / 255) for v in range(256)])
_NOVELTY = np.array([max(.05, v * 2 / 255) for v in range(256)])


def encode_importance(alpha: float) -> int:
    """Attention a token receives divided by its frame's mean -> one byte on a log2 scale over [-8, 8]."""
    log = math.log2(max(2.0 ** -8, min(2.0 ** 8, alpha)))
    return max(0, min(255, round((log + 8) * 255 / 16)))


def encode_novelty(novelty: float) -> int:
    return max(0, min(255, round(novelty * 255 / 2)))


def _unit(values) -> tuple:
    values = tuple(float(x) for x in values)
    norm = math.sqrt(math.fsum(x * x for x in values))
    if not (math.isfinite(norm) and norm > 0):
        raise ValueError("search tag has zero or non-finite norm")
    return tuple(x / norm for x in values)


def pack_tag(tag) -> bytes:
    """Unit search tag -> 2-byte float16 scale + one int8 per value."""
    values = _unit(tag)
    scale = struct.unpack("<e", struct.pack("<e", max(abs(x) for x in values) / 127))[0]
    quantized = (max(-127, min(127, round(x / scale))) for x in values)
    return struct.pack("<e", scale) + bytes(q & 255 for q in quantized)


def unpack_tag(data: bytes) -> tuple:
    scale = struct.unpack_from("<e", data)[0]
    return _unit((x if x < 128 else x - 256) * scale for x in data[2:])


@dataclass
class StoredFrame:
    """One frame in memory. Token arrays are in the order of the frame's grid (row by row)."""
    frame_id: int
    timestamp: float                 # stored as float32
    grid: tuple                      # (1, height, width) in vision-encoder patches, before 2 x 2 merging
    novelty_u8: int
    tag: bytes                       # packed search tag
    positions: np.ndarray            # index of each stored token in the merged grid
    importance_u8: np.ndarray
    bits: np.ndarray                 # stored code length of each token
    codes: np.ndarray                # (tokens, 512) bytes; bytes past each token's length are zero
    _unit_tag: tuple | None = field(default=None, repr=False)
    _nbytes: int | None = field(default=None, repr=False)

    @property
    def novelty(self) -> float:
        return float(_NOVELTY[self.novelty_u8])

    @property
    def importance(self) -> np.ndarray:
        return _IMPORTANCE[self.importance_u8]

    @property
    def unit_tag(self) -> tuple:
        if self._unit_tag is None:
            self._unit_tag = unpack_tag(self.tag)
        return self._unit_tag

    @property
    def nbytes(self) -> int:
        if self._nbytes is None:   # frames are never changed in place, so the size is computed once
            self._nbytes = _SIZE.size + _FRAME.size + TAG_BYTES + 3 * len(self.bits) + int(self.bits.sum()) // 8
        return self._nbytes

    def shortened(self, bits: np.ndarray) -> "StoredFrame | None":
        """The frame with each token cut to `bits` (0 = dropped), or None if no token is left."""
        keep = bits > 0
        if not keep.any():
            return None
        codes = self.codes[keep].copy()
        new_bits = bits[keep].astype(np.int64)
        for length in np.unique(new_bits):
            codes[new_bits == length, length // 8:] = 0
        return StoredFrame(self.frame_id, self.timestamp, self.grid, self.novelty_u8, self.tag, self.positions[keep],
                           self.importance_u8[keep], new_bits, codes, self._unit_tag)


class Memory:
    """A bounded streaming memory.

    write() takes one frame at a time: its visual tokens as full nested codes, the attention each token receives in the
    vision encoder, and the frame's search tag. Nothing is kept outside the serialized state except decoded copies of
    the 8 recent tags used for novelty.
    """

    def __init__(self, budget_bytes: int = DEFAULT_BUDGET, code: NestedCode | None = None, *, e0: float = 0.5,
                 headroom: float = 0.9, fixed_bits: int | None = None):
        self.code = code or NestedCode()
        self.budget_bytes, self.e0, self.headroom = int(budget_bytes), float(e0), float(headroom)
        values = {r: self.code.e(r) for r in LENGTHS}
        if fixed_bits:  # the fixed-length comparison in the paper's Table 2: keep exactly `fixed_bits` bits or drop
            if fixed_bits not in LENGTHS:
                raise ValueError(f"fixed_bits must be one of {LENGTHS}")
            values = {r: (0.0 if r < fixed_bits else values[fixed_bits]) for r in LENGTHS}
        self.values = tuple((r, values[r]) for r in LENGTHS)
        self.fixed_bits = fixed_bits
        if math.floor(self.headroom * self.budget_bytes) < _HEADER.size + NOVELTY_WINDOW * TAG_BYTES:
            raise ValueError("budget too small")
        self.price = 0.0
        self.frames: list[StoredFrame] = []
        self._ring: deque = deque(maxlen=NOVELTY_WINDOW)    # (packed tag, unit tag) of the last frames seen
        self.last_frame_id: int | None = None
        self.last_timestamp = 0.0

    # ------------------------------------------------------------------ sizes and decisions
    def _settings(self) -> bytes:
        info = {"format": _VERSION, "lengths": LENGTHS, "values": self.values, "e0": self.e0,
                "token_meta_bits": TOKEN_META_BITS, "frame_meta_bits": FRAME_META_BITS, "headroom": self.headroom,
                "novelty": [NOVELTY_WINDOW, NOVELTY_MIN], "tag_dim": TAG_DIM}
        return hashlib.sha256(json.dumps(info, sort_keys=True, separators=(",", ":")).encode()).digest()

    def _size(self, frames, ring_len=None) -> int:
        ring = len(self._ring) if ring_len is None else ring_len
        return _HEADER.size + ring * TAG_BYTES + sum(f.nbytes for f in frames)

    @property
    def nbytes(self) -> int:
        """Serialized size of the memory in bytes."""
        return self._size(self.frames)

    def _choices(self, weights: np.ndarray, limits: np.ndarray, price: float):
        """Best option of every token at this price: (surplus, code length; 0 = drop). Ties keep the shorter option."""
        best = np.zeros(len(weights))
        lengths = np.zeros(len(weights), dtype=np.int64)
        with np.errstate(over="ignore", invalid="ignore"):
            for bits, value in self.values:
                gains = weights * (value - self.e0)
                gains -= price * (TOKEN_META_BITS + bits)
                choose = (limits >= bits) & (gains > best)
                np.copyto(best, gains, where=choose)
                np.copyto(lengths, bits, where=choose)
        return best, lengths

    def _prepare(self, frames):
        """Arrays over all tokens of `frames`, in memory order."""
        counts = np.array([len(f.bits) for f in frames], dtype=np.int64)
        weights = np.concatenate([f.importance * f.novelty for f in frames]) if frames else np.zeros(0)
        limits = np.concatenate([f.bits for f in frames]) if frames else np.zeros(0, dtype=np.int64)
        starts = np.concatenate([[0], np.cumsum(counts)[:-1]]) if frames else np.zeros(0, dtype=np.int64)
        rows = np.repeat(np.arange(len(frames)), counts)
        cols = np.arange(len(weights)) - np.repeat(starts, counts)
        return frames, counts, weights, limits, rows, cols

    def _decide(self, prepared, price: float):
        """Code length of every token and whether each frame stays, at this price."""
        frames, counts, weights, limits, rows, cols = prepared
        best, lengths = self._choices(weights, limits, price)
        # Each frame's surplus is summed token by token in grid order (np.add.accumulate is sequential).
        table = np.zeros((len(frames), int(counts.max()) if len(frames) else 0))
        table[rows, cols] = best
        surplus = np.add.accumulate(table, axis=1)[:, -1] if table.size else np.zeros(len(frames))
        stored = np.bincount(rows, weights=lengths > 0, minlength=len(frames))
        keep = (stored > 0) & (surplus > price * FRAME_META_BITS)
        return lengths, keep

    def _candidate_size(self, prepared, price: float, ring_len: int) -> int:
        frames, counts, *_ , rows, cols = prepared
        lengths, keep = self._decide(prepared, price)
        per_frame = np.bincount(rows, weights=np.where(lengths > 0, 3 + lengths // 8, 0), minlength=len(frames))
        fixed = _SIZE.size + _FRAME.size + TAG_BYTES
        return _HEADER.size + ring_len * TAG_BYTES + int(((fixed + per_frame.astype(np.int64)) * keep).sum())

    def _materialize(self, prepared, price: float):
        frames, counts, *_ = prepared
        lengths, keep = self._decide(prepared, price)
        out, start = [], 0
        for frame, n, k in zip(frames, counts, keep):
            if k:
                kept = frame.shortened(lengths[start:start + n])
                if kept is not None:
                    out.append(kept)
            start += n
        return out

    # ------------------------------------------------------------------ writing
    def write(self, frame_id: int, timestamp: float, grid, codes, attention, tag) -> dict:
        """Add one frame. codes: (N, 512) bytes of full 4,096-bit codes (NestedCode.encode); attention: (N,) values."""
        if self.last_frame_id is not None and frame_id <= self.last_frame_id:
            raise ValueError("frame ids must increase")
        if timestamp < self.last_timestamp:
            raise ValueError("timestamps must not decrease")
        codes = np.asarray(codes, dtype=np.uint8)
        values = [float(x) for x in attention]
        if codes.shape != (len(values), FULL_BITS // 8) or not values:
            raise ValueError("expected one full code per token")
        if len(values) > 4096:
            raise ValueError("at most 4,096 tokens per frame")
        mean = math.fsum(values) / len(values)
        if not (mean > 0 and math.isfinite(mean)):
            raise ValueError("attention must have a positive finite mean")
        importance = np.array([encode_importance(a / mean) for a in values], dtype=np.uint8)
        packed = pack_tag(tag)
        unit = unpack_tag(packed)
        if self._ring:
            similarity = max(math.fsum(a * b for a, b in zip(unit, old)) for _, old in self._ring)
            novelty = max(NOVELTY_MIN, min(2.0, 1 - similarity))
        else:
            novelty = 1.0
        stored_time = struct.unpack("<f", struct.pack("<f", float(timestamp)))[0]
        incoming = StoredFrame(int(frame_id), stored_time, tuple(int(g) for g in grid), encode_novelty(novelty), packed,
                               np.arange(len(values), dtype=np.int64), importance,
                               np.full(len(values), FULL_BITS, dtype=np.int64), codes.copy(), unit)

        # the new frame is first decided at the current price
        lengths, keep = self._decide(self._prepare([incoming]), self.price)
        kept = incoming.shortened(lengths) if keep[0] else None
        before, previous_price = self.nbytes, self.price
        self._ring.append((packed, unit))
        self.last_frame_id, self.last_timestamp = int(frame_id), float(timestamp)
        candidate = self.frames + ([kept] if kept is not None else [])

        repriced = self._size(candidate) > self.budget_bytes
        if repriced:  # raise the price until the memory fits in headroom x budget
            target = math.floor(self.headroom * self.budget_bytes)
            prepared = self._prepare(candidate)
            ring = len(self._ring)
            low = max(self.price, 1e-300)
            high = max(self.price * 2, 1e-12)
            while self._candidate_size(prepared, high, ring) > target:
                high *= 2
                if not math.isfinite(high):
                    raise RuntimeError("could not bracket the price")
            if self._candidate_size(prepared, low, ring) <= target:
                high = low
            else:
                for _ in range(60):
                    middle = math.exp((math.log(low) + math.log(high)) / 2)
                    if self._candidate_size(prepared, middle, ring) <= target:
                        high = middle
                    else:
                        low = middle
            candidate = self._materialize(prepared, high)
            self.price = high
        self.frames = candidate
        if self.nbytes > self.budget_bytes:
            raise RuntimeError("memory exceeds its budget")
        stored = bool(self.frames) and self.frames[-1].frame_id == frame_id
        return {"frame_id": int(frame_id), "kept": stored,
                "repriced": repriced, "before_bytes": before, "previous_price": previous_price, "price": self.price,
                "bytes": self.nbytes, "frames": len(self.frames), "tokens": sum(len(f.bits) for f in self.frames)}

    # ------------------------------------------------------------------ inspection
    def summary(self) -> dict:
        bits = np.concatenate([f.bits for f in self.frames]) if self.frames else np.zeros(0, dtype=np.int64)
        return {"bytes": self.nbytes, "budget_bytes": self.budget_bytes, "price": self.price,
                "frames": len(self.frames), "tokens": int(bits.size),
                "mean_bits": float(bits.mean()) if bits.size else 0.0,
                "lengths": {int(r): int((bits == r).sum()) for r in LENGTHS}}

    def content_hash(self) -> str:
        """Hash of everything the memory stores (frames, tokens, codes, novelty tags and price)."""
        h = hashlib.sha256()
        h.update(struct.pack("<d", self.price))
        for packed, _ in self._ring:
            h.update(packed)
        for f in self.frames:
            h.update(struct.pack("<QfIIIB", f.frame_id, f.timestamp, *f.grid, f.novelty_u8))
            h.update(f.tag)
            for p, a, b, c in zip(f.positions, f.importance_u8, f.bits, f.codes):
                h.update(struct.pack("<HBH", int(p), int(a), int(b)))
                h.update(c[: int(b) // 8].tobytes())
        return h.hexdigest()

    # ------------------------------------------------------------------ saving and loading
    def to_bytes(self) -> bytes:
        index = {r: i for i, r in enumerate(LENGTHS)}
        out = bytearray(_HEADER.pack(_MAGIC, _VERSION, len(self._ring), TAG_DIM, self.budget_bytes, self.price,
                                     self.headroom, 2 ** 64 - 1 if self.last_frame_id is None else self.last_frame_id,
                                     self.last_timestamp, len(self.frames), self._settings()))
        for packed, _ in self._ring:
            out += packed
        for f in self.frames:
            width = 1 if int(f.positions.max()) <= 255 else 2
            record = bytearray(_FRAME.pack(f.frame_id, f.timestamp, *f.grid, f.novelty_u8, width, len(f.bits)))
            record += f.tag
            for p, a, b, c in zip(f.positions, f.importance_u8, f.bits, f.codes):
                record += (int(p) | (int(a) << 12) | (index[int(b)] << 20)).to_bytes(3, "little")
                record += c[: int(b) // 8].tobytes()
            out += _SIZE.pack(len(record)) + record
        if len(out) != self.nbytes:
            raise RuntimeError("serialized size differs from the accounted size")
        return bytes(out)

    def save(self, path: str | Path) -> None:
        Path(path).write_bytes(self.to_bytes())

    @classmethod
    def load(cls, path: str | Path, code: NestedCode | None = None, **kwargs) -> "Memory":
        data = Path(path).read_bytes()
        magic, version, ring, tag_dim, budget, price, headroom, last_id, last_time, count, digest = \
            _HEADER.unpack_from(data)
        if magic != _MAGIC or version != _VERSION or tag_dim != TAG_DIM:
            raise ValueError("not a Memryoshka memory file of this version")
        memory = cls(budget, code, headroom=headroom, **kwargs)
        if memory._settings() != digest:
            raise ValueError("the memory was written with different settings (e0, fixed length or basis)")
        cursor = _HEADER.size
        for _ in range(ring):
            packed = data[cursor:cursor + TAG_BYTES]
            memory._ring.append((packed, unpack_tag(packed)))
            cursor += TAG_BYTES
        for _ in range(count):
            (length,) = _SIZE.unpack_from(data, cursor)
            cursor += _SIZE.size
            fid, t, g0, g1, g2, novelty, _width, n = _FRAME.unpack_from(data, cursor)
            at = cursor + _FRAME.size
            tag = data[at:at + TAG_BYTES]
            at += TAG_BYTES
            positions, importance, bits = np.zeros(n, np.int64), np.zeros(n, np.uint8), np.zeros(n, np.int64)
            codes = np.zeros((n, FULL_BITS // 8), np.uint8)
            for i in range(n):
                header = int.from_bytes(data[at:at + 3], "little")
                positions[i], importance[i], bits[i] = header & 4095, (header >> 12) & 255, LENGTHS[header >> 20]
                at += 3
                size = int(bits[i]) // 8
                codes[i, :size] = np.frombuffer(data[at:at + size], dtype=np.uint8)
                at += size
            if at != cursor + length:
                raise ValueError("corrupt frame record")
            memory.frames.append(StoredFrame(fid, t, (g0, g1, g2), novelty, tag, positions, importance, bits, codes))
            cursor = at
        if cursor != len(data):
            raise ValueError("trailing bytes in memory file")
        memory.price = price
        memory.last_frame_id = None if last_id == 2 ** 64 - 1 else last_id
        memory.last_timestamp = last_time
        return memory
