"""Putting the parts together: video in, memory out, questions answered from memory."""
from __future__ import annotations

import time

import numpy as np

from .codec import NestedCode
from .features import FrameEncoder, Projector, sample_frames
from .longclip import LongCLIP
from .reader import Reader
from .readout import DEFAULT_READOUT, SHARE, frame_overhead, question_text, read
from .writer import DEFAULT_BUDGET, Memory

BATCH = 64   # frames encoded together (LongCLIP runs on the whole batch, as in the paper's runs)


class Memryoshka:
    """Loads the frozen models once (Qwen2.5-VL-7B and LongCLIP-B/16, about 17 GB of GPU memory in bfloat16)."""

    def __init__(self, device: str = "cuda", qwen: str | None = None, longclip: str | None = None,
                 code: NestedCode | None = None):
        self.code = code or NestedCode()
        self.reader = Reader(qwen, device=device)
        self.longclip = LongCLIP(longclip, device=self.reader.device)
        self.encoder = FrameEncoder(self.reader, self.longclip)
        self.projector = Projector(self.code, self.reader.device)
        self.overhead = frame_overhead(self.reader.tokenizer)

    def memory(self, budget_bytes: int = DEFAULT_BUDGET, **kwargs) -> Memory:
        return Memory(budget_bytes, self.code, **kwargs)

    # ------------------------------------------------------------------ writing
    def encode(self, samples) -> list[dict]:
        """Writer inputs for a batch of (image, timestamp, requested_time) samples."""
        out = []
        for (image, t, req), f in zip(samples, self.encoder([s[0] for s in samples])):
            out.append({"timestamp": t, "requested": req, "grid": f.grid, "coefficients": self.projector(f.tokens),
                        "attention": f.attention, "tag": f.tag})
        return out

    def write(self, memory: Memory, inputs: list[dict], first_id: int) -> None:
        for i, x in enumerate(inputs):
            memory.write(first_id + i, x["timestamp"], x["grid"], self.code.encode(x["coefficients"]), x["attention"], x["tag"])

    def stream(self, video, memory: Memory, *, fps: float = 1.0, keep_inputs: bool = False, log_every: int = 0):
        """Write a whole video into memory. Returns the writer inputs if keep_inputs (to re-run the writer later)."""
        kept, pending, frame_id, t0 = [], [], 0, time.time()
        next_log = log_every
        for sample in sample_frames(video, fps):
            pending.append(sample)
            if len(pending) == BATCH:
                inputs = self.encode(pending)
                self.write(memory, inputs, frame_id)
                frame_id += len(pending)
                kept += inputs if keep_inputs else []
                pending = []
                if log_every and frame_id >= next_log:
                    _log(memory, frame_id, t0)
                    next_log += log_every
        if pending:
            inputs = self.encode(pending)
            self.write(memory, inputs, frame_id)
            frame_id += len(pending)
            kept += inputs if keep_inputs else []
        if log_every:
            _log(memory, frame_id, t0)
        return kept if keep_inputs else None

    # ------------------------------------------------------------------ reading
    def ask(self, memory: Memory, question: str, options, *, readout: int = DEFAULT_READOUT, share: float = SHARE,
            recent: int = 0) -> dict:
        tag = self.longclip.text_tag(question_text(question, options))
        chosen, used = read(memory, tag, self.overhead, readout, share, recent)
        result = self.reader.answer(self.reader.decode(self.code, chosen), question, options)
        result.update(frames_read=len(chosen), tokens_read=sum(len(t) for _, t in chosen), positions=used,
                      times=[round(float(f.timestamp), 2) for f, _ in chosen])
        return result


def save_inputs(path, inputs: list[dict]) -> None:
    """Writer inputs of a whole video in one .npz file (the PCA coefficients in float16, as the writer uses them)."""
    offsets = np.cumsum([0] + [len(x["attention"]) for x in inputs])
    np.savez(path, offsets=offsets, timestamps=np.array([x["timestamp"] for x in inputs], dtype=np.float64),
             requested=np.array([x["requested"] for x in inputs], dtype=np.float64),
             grids=np.array([x["grid"] for x in inputs], dtype=np.int64),
             coefficients=np.concatenate([x["coefficients"] for x in inputs]).astype(np.float16),
             attention=np.concatenate([x["attention"] for x in inputs]).astype(np.float32),
             tags=np.stack([x["tag"] for x in inputs]).astype(np.float32))


def load_inputs(path) -> list[dict]:
    with np.load(path) as z:   # read every array once (indexing an .npz file reads the whole array again)
        d = {k: z[k] for k in z.files}
    off = d["offsets"]
    return [{"timestamp": float(d["timestamps"][i]), "requested": float(d["requested"][i]),
             "grid": tuple(int(g) for g in d["grids"][i]), "coefficients": d["coefficients"][off[i]:off[i + 1]],
             "attention": d["attention"][off[i]:off[i + 1]], "tag": d["tags"][i]} for i in range(len(off) - 1)]


def write_inputs(memory: Memory, inputs: list[dict], log_every: int = 0) -> None:
    """Run the writer on saved inputs (CPU only)."""
    t0 = time.time()
    for i, x in enumerate(inputs):
        memory.write(i, x["timestamp"], x["grid"], memory.code.encode(x["coefficients"]), x["attention"], x["tag"])
        if log_every and (i + 1) % log_every == 0:
            _log(memory, i + 1, t0)


def _log(memory: Memory, frames_seen: int, t0: float) -> None:
    s = memory.summary()
    print(f"{frames_seen:6d} frames seen | {s['frames']:5d} kept, {s['tokens']:7d} tokens, {s['mean_bits']:6.0f} bits "
          f"per token | {s['bytes'] / 1e6:5.2f} MB | {time.time() - t0:5.0f} s", flush=True)
