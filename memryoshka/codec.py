"""Nested token codes (Section 3.2 of the paper).

A visual token x (3,584 numbers for Qwen2.5-VL-7B) becomes 512 PCA coefficients c = (x - mu) @ W. Each coefficient is
divided by its standard deviation and quantized to 8 bits over [-3, 3] standard deviations; the two outer steps also
take the tails. The 4,096 bits of a token are then put in one fixed order: bit p of coefficient k is ranked by
sigma_k^2 * g(p), the variance that bit removes for a Gaussian coefficient, and within a coefficient a more significant
bit always comes first. Any prefix of r bits decodes on its own, so shortening a stored code means dropping the end of
it; nothing is re-encoded.

The basis (mu, W, sigma) is the only fitted part. It ships with the package (assets/pca_basis.npz) together with the
bit order, the Gaussian tables used for decoding and e(r), the share of the PCA variance kept by the first r bits.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

FULL_BITS = 4096          # 512 coefficients x 8 bits
NUM_COEFFICIENTS = 512
RANGE_STD = 3.0           # quantization range in standard deviations
DEFAULT_BASIS = Path(__file__).with_name("assets") / "pca_basis.npz"


class NestedCode:
    """Encode visual tokens into nested codes and decode any prefix.

    Codes are stored as packed bytes: the bits of a token in ranking order, big-endian, so an r-bit code is r / 8 bytes
    (all code lengths used by the writer are multiples of 8).
    """

    def __init__(self, path: str | Path = DEFAULT_BASIS):
        z = np.load(path)
        self.mu = z["mu"].astype(np.float32)                   # (3584,)
        self.components = z["components"].astype(np.float32)   # (3584, 512), orthonormal columns
        self.sigma = z["sigma"].astype(np.float32)             # (512,) standard deviation of each coefficient
        self.bit_order = z["bit_order"].astype(np.int64)       # (4096, 2): (coefficient, bit plane); plane 0 = most significant
        self.cell_means = z["cell_means"]                      # (9, 256): mean of a unit Gaussian in each cell, per number of bits
        self.er_curve = z["er_curve"]                          # (4097,): e(r) for r = 0 ... 4096
        k, p = self.bit_order[:, 0], self.bit_order[:, 1]
        self._shift = (7 - p).astype(np.uint8)
        self._coef = k
        # position of bit (coefficient k, plane p) in the ranking, used to unpack codes of any length
        self._rank = np.empty((NUM_COEFFICIENTS, 8), dtype=np.int64)
        self._rank[k, p] = np.arange(FULL_BITS)

    @property
    def dim(self) -> int:
        return self.mu.shape[0]

    # ------------------------------------------------------------------ encoding
    def project(self, tokens) -> np.ndarray:
        """(N, 3584) visual tokens -> (N, 512) PCA coefficients (float32)."""
        return (np.asarray(tokens, dtype=np.float32) - self.mu) @ self.components

    def quantize(self, coefficients) -> np.ndarray:
        """(N, 512) PCA coefficients -> (N, 512) 8-bit levels.

        In the paper's runs the coefficients were stored in float16 before quantization; pass them as they are and they
        are quantized from their float32 value.
        """
        z = np.asarray(coefficients, dtype=np.float32) / self.sigma
        steps = np.float32(256.0 / (2 * RANGE_STD))
        return np.clip(np.floor((z + np.float32(RANGE_STD)) * steps), 0, 255).astype(np.uint8)

    def pack(self, levels) -> np.ndarray:
        """(N, 512) levels -> (N, 512) bytes: each row is a full 4,096-bit code in ranking order."""
        levels = np.asarray(levels, dtype=np.uint8)
        bits = (levels[:, self._coef] >> self._shift) & 1
        return np.packbits(bits, axis=1, bitorder="big")

    def encode(self, coefficients) -> np.ndarray:
        """(N, 512) PCA coefficients -> (N, 512) bytes of full codes."""
        return self.pack(self.quantize(coefficients))

    # ------------------------------------------------------------------ decoding
    def unpack(self, codes, bits) -> tuple[np.ndarray, np.ndarray]:
        """Codes (N rows of bytes, each at least bits / 8 long) and their lengths in bits -> (levels, depths).

        levels holds only the stored bits (the rest are zero); depths[i, k] is how many bits coefficient k keeps.
        """
        bits = np.broadcast_to(np.asarray(bits, dtype=np.int64), (len(codes),))
        width = FULL_BITS // 8
        packed = np.zeros((len(codes), width), dtype=np.uint8)
        for i, code in enumerate(codes):
            row = np.frombuffer(bytes(code), dtype=np.uint8)[: bits[i] // 8]
            packed[i, : row.size] = row
        plain = np.unpackbits(packed, axis=1, bitorder="big")                   # (N, 4096) in ranking order
        kept = self._rank[None, :, :] < bits[:, None, None]                      # (N, 512, 8)
        planes = plain[:, self._rank] & kept                                     # (N, 512, 8)
        levels = (planes.astype(np.int64) << (7 - np.arange(8))).sum(axis=2)
        depths = kept.sum(axis=2)
        return levels, depths

    def decode_coefficients(self, codes, bits) -> np.ndarray:
        """Codes and lengths -> (N, 512) decoded PCA coefficients (float32).

        A coefficient with b stored bits becomes the Gaussian mean of its cell times sigma; with no stored bits it is 0,
        the PCA mean.
        """
        levels, depths = self.unpack(codes, bits)
        prefix = levels >> (8 - depths)
        value = self.cell_means[depths, prefix].astype(np.float32)
        value = np.where(depths > 0, value, np.float32(0.0))
        return self.sigma * value

    def decode(self, codes, bits) -> np.ndarray:
        """Codes and lengths -> (N, 3584) approximate visual tokens (float32)."""
        return self.mu + self.decode_coefficients(codes, bits) @ self.components.T

    # ------------------------------------------------------------------ value of a prefix
    def e(self, r: int) -> float:
        """Share of the PCA variance kept by the first r bits (equation 3 of the paper)."""
        return float(self.er_curve[int(r)])
