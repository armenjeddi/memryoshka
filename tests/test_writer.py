import numpy as np
import pytest

from helpers import synthetic_stream, write_stream
from memryoshka import LENGTHS, Memory, NestedCode


@pytest.fixture(scope="module")
def code():
    return NestedCode()


@pytest.fixture(scope="module")
def stream(code):
    return synthetic_stream(150, seed=0, code=code)


def test_budget_price_and_prefixes(code, stream):
    memory = Memory(400_000, code)
    seen, prices = {}, []
    for i, x in enumerate(stream):
        memory.write(i, x["timestamp"], x["grid"], x["codes"], x["attention"], x["tag"])
        assert memory.nbytes <= memory.budget_bytes
        prices.append(memory.price)
        for f in memory.frames:
            original = stream[f.frame_id]["codes"]
            for p, b, c in zip(f.positions, f.bits, f.codes):
                assert b in LENGTHS and b >= 128                      # 32 and 64 bits are below the quality floor
                assert np.array_equal(c[: b // 8], original[p][: b // 8])   # a stored code is a prefix of the full code
                assert not c[b // 8:].any()                           # removed bits are gone
                assert b <= seen.get((f.frame_id, int(p)), 4096)      # codes only get shorter
                seen[(f.frame_id, int(p))] = b
    assert all(a <= b for a, b in zip(prices, prices[1:])) and prices[-1] > 0
    assert memory.frames and memory.nbytes > 0.5 * memory.budget_bytes


def test_save_and_load(tmp_path, code, stream):
    memory = write_stream(Memory(300_000, code), stream)
    path = tmp_path / "memory.mryk"
    memory.save(path)
    assert path.stat().st_size == memory.nbytes
    loaded = Memory.load(path, code)
    assert loaded.content_hash() == memory.content_hash()
    # the loaded memory keeps working exactly like the original
    extra = synthetic_stream(10, seed=1, code=code)
    for i, x in enumerate(extra):
        for m in (memory, loaded):
            m.write(len(stream) + i, len(stream) + x["timestamp"], x["grid"], x["codes"], x["attention"], x["tag"])
    assert loaded.content_hash() == memory.content_hash()


def test_fixed_length_control(code, stream):
    memory = write_stream(Memory(300_000, code, fixed_bits=512), stream)
    bits = np.concatenate([f.bits for f in memory.frames])
    assert set(bits.tolist()) == {512}


def test_same_inputs_same_memory(code, stream):
    a = write_stream(Memory(250_000, code), stream)
    b = write_stream(Memory(250_000, code), stream)
    assert a.content_hash() == b.content_hash()
