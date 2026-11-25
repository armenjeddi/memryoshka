"""Reading the memory when a question arrives (Section 3.4 of the paper).

The question and its answer options are embedded with LongCLIP's text encoder. Stored frames are ranked by the cosine
similarity between their stored search tag and the question. Going down the ranking, each frame contributes its most
important stored tokens, the fewest whose importance adds up to a share rho = 0.8 of the importance still stored for
that frame, until the readout budget L is used. The budget counts every position the reader sees: visual tokens, the
timestamp text of each frame and two delimiters. The chosen frames are given to the reader in time order, and each token
keeps its original place in its frame.
"""
from __future__ import annotations

import numpy as np

SHARE = 0.8                 # rho in the paper
DEFAULT_READOUT = 1000      # L in the paper's 7.2 MB setting (1,000 / 2,000 / 4,000 in the main table)


def question_text(question: str, options) -> str:
    """The text given to LongCLIP (and to the reader): the question followed by the lettered options."""
    return question + "\n" + "\n".join(f"({chr(65 + i)}) {o}" for i, o in enumerate(options))


def timestamp_text(t: float) -> str:
    """Timestamp shown to the reader before each frame (nearest second; Python's round-half-even)."""
    s = int(round(float(t)))
    return f"[{s // 60:02d}:{s % 60:02d}]" if s < 3600 else f"[{s // 3600}:{s // 60 % 60:02d}:{s % 60:02d}]"


def frame_overhead(tokenizer, delimiters: int = 2):
    """Positions a frame costs besides its visual tokens: its timestamp text plus the vision start and end tokens."""
    cache = {}

    def cost(t):
        key = round(float(t), 3)
        if key not in cache:
            cache[key] = len(tokenizer.encode(timestamp_text(t), add_special_tokens=False)) + delimiters
        return cache[key]
    return cost


def rank_frames(frames, query_tag) -> list[int]:
    """Indices of the stored frames by cosine similarity to the question, highest first; ties by frame id."""
    if not frames:
        return []
    q = np.asarray(query_tag, dtype=np.float64)
    q = q / np.linalg.norm(q)
    tags = np.asarray([f.unit_tag for f in frames], dtype=np.float64)
    similarity = tags @ q
    return sorted(range(len(frames)), key=lambda i: (-float(similarity[i]), frames[i].frame_id))


def newest_first(frames, ranked, k: int) -> list[int]:
    """The '+ k recent frames' variant: the k newest stored frames go first, then the rest of the ranking."""
    if k <= 0:
        return list(ranked)
    newest = sorted(range(len(frames)), key=lambda i: (-frames[i].timestamp, -frames[i].frame_id))[:k]
    return newest + [i for i in ranked if i not in newest]


def select(frames, ranked, overhead, budget: int = DEFAULT_READOUT, share: float = SHARE):
    """Walk the ranking and take tokens from each frame until the readout budget is used.

    Returns ([(frame, token indices)], positions used). Token indices refer to the frame's stored token arrays.
    """
    chosen, used = [], 0
    for i in ranked:
        frame = frames[i]
        if len(frame.bits) == 0:
            continue
        cost = overhead(frame.timestamp)
        if budget - used - cost < 1:
            break
        order = sorted(range(len(frame.bits)), key=lambda j: (-int(frame.importance_u8[j]), int(frame.positions[j])))
        u8 = np.asarray([frame.importance_u8[j] for j in order], dtype=np.float64)
        importance = 2. ** (-8. + u8 * 16. / 255.)
        n = int(np.searchsorted(np.cumsum(importance) / importance.sum(), share) + 1)
        take = order[:min(n, budget - used - cost)]
        chosen.append((frame, take))
        used += cost + len(take)
    return chosen, used


def in_reading_order(chosen):
    """Chosen frames in time order, each frame's tokens in grid order."""
    out = []
    for frame, take in sorted(chosen, key=lambda x: (x[0].timestamp, x[0].frame_id)):
        out.append((frame, sorted(take, key=lambda j: int(frame.positions[j]))))
    return out


def read(memory, query_tag, overhead, budget: int = DEFAULT_READOUT, share: float = SHARE, recent: int = 0):
    """Choose what the reader sees for one question: [(frame, token indices)] in reading order, and positions used."""
    frames = memory.frames
    ranked = newest_first(frames, rank_frames(frames, query_tag), recent)
    chosen, used = select(frames, ranked, overhead, budget, share)
    return in_reading_order(chosen), used


__all__ = ["SHARE", "DEFAULT_READOUT", "question_text", "timestamp_text", "frame_overhead", "rank_frames",
           "newest_first", "select", "in_reading_order", "read"]
