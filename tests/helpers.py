"""A small synthetic stream with the layout of real writer inputs (no models needed)."""
import numpy as np

from memryoshka import NestedCode


def synthetic_stream(frames=120, seed=0, code=None):
    code = code or NestedCode()
    rng = np.random.default_rng(seed)
    tag = rng.standard_normal(512)
    out = []
    for i in range(frames):
        gh, gw = [(16, 16), (16, 20), (12, 12)][i % 3]
        n = (gh // 2) * (gw // 2)
        coefficients = (rng.standard_normal((n, 512)) * code.sigma).astype(np.float16)
        tag = rng.standard_normal(512) if rng.random() < 0.05 else tag + 0.35 * rng.standard_normal(512)
        out.append({"timestamp": float(i), "grid": (1, gh, gw), "codes": code.encode(coefficients),
                    "attention": np.exp(rng.normal(0, 1.5, n)).astype(np.float32),
                    "tag": (tag / np.linalg.norm(tag)).astype(np.float32)})
    return out


def write_stream(memory, stream):
    for i, x in enumerate(stream):
        memory.write(i, x["timestamp"], x["grid"], x["codes"], x["attention"], x["tag"])
    return memory
