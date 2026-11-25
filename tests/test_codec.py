import numpy as np
import pytest

from memryoshka import LENGTHS, NestedCode


@pytest.fixture(scope="module")
def code():
    return NestedCode()


def test_full_code_round_trip(code):
    rng = np.random.default_rng(0)
    levels = code.quantize(rng.standard_normal((50, 512)) * code.sigma)
    codes = code.pack(levels)
    assert codes.shape == (50, 512)
    unpacked, depths = code.unpack(codes, 4096)
    assert np.array_equal(unpacked, levels) and (depths == 8).all()


def test_a_prefix_is_a_shorter_code(code):
    """Cutting the stored bytes of a code gives the same token as decoding the full code at that length."""
    rng = np.random.default_rng(1)
    codes = code.encode(rng.standard_normal((20, 512)) * code.sigma)
    for r in LENGTHS:
        cut = [row[: r // 8].tobytes() for row in codes]
        assert np.array_equal(code.decode(cut, r), code.decode(codes, r))


def test_longer_prefixes_are_closer(code):
    rng = np.random.default_rng(2)
    coefficients = rng.standard_normal((200, 512)) * code.sigma
    x = code.mu + coefficients @ code.components.T
    codes = code.encode(code.project(x))
    errors = [np.square(code.decode(codes, r) - x).sum() for r in LENGTHS]
    assert all(a > b for a, b in zip(errors, errors[1:]))


def test_value_of_a_prefix_matches_measured_variance(code):
    """e(r) is the share of PCA variance a prefix keeps; on Gaussian coefficients it matches what decoding keeps."""
    rng = np.random.default_rng(3)
    coefficients = rng.standard_normal((2000, 512)) * code.sigma
    codes = code.encode(coefficients)
    total = np.square(coefficients).sum()
    for r in (128, 512, 2048):
        kept = 1 - np.square(code.decode_coefficients(codes, r) - coefficients).sum() / total
        assert abs(kept - code.e(r)) < 0.02
    values = [code.e(r) for r in LENGTHS]
    assert all(a < b for a, b in zip(values, values[1:])) and values[-1] > 0.999
    assert code.e(64) < 0.5 < code.e(128)    # with e0 = 0.5, codes of 32 and 64 bits are never stored
