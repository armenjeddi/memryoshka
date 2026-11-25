import numpy as np
import pytest

from helpers import synthetic_stream, write_stream
from memryoshka import Memory, NestedCode, read
from memryoshka.readout import SHARE


@pytest.fixture(scope="module")
def memory():
    code = NestedCode()
    return write_stream(Memory(500_000, code), synthetic_stream(150, seed=0, code=code))


def overhead(_t):
    return 9   # "[mm:ss]" in the Qwen tokenizer (7 positions) plus the vision start and end tokens


def test_budget_order_and_share(memory):
    query = memory.frames[len(memory.frames) // 2].unit_tag
    for budget in (100, 400, 1000):
        chosen, used = read(memory, query, overhead, budget)
        assert used <= budget and used == sum(overhead(0) + len(t) for _, t in chosen)
        times = [f.timestamp for f, _ in chosen]
        assert times == sorted(times)
        short = 0
        for frame, take in chosen:
            assert take == sorted(take, key=lambda j: int(frame.positions[j]))
            alpha = frame.importance
            # the tokens taken are the most important ones ...
            assert alpha[take].min() >= np.sort(alpha)[::-1][len(take) - 1]
            # ... and hold at least rho of the frame's stored importance, except in the frame where the budget ran out
            short += alpha[take].sum() < SHARE * alpha.sum() - 1e-12
        assert short <= 1


def test_the_most_similar_frame_is_read(memory):
    target = memory.frames[10]
    chosen, _ = read(memory, target.unit_tag, overhead, 1000)
    assert target.frame_id in [f.frame_id for f, _ in chosen]


def test_recent_frames_variant(memory):
    query = memory.frames[0].unit_tag
    chosen, _ = read(memory, query, overhead, 1000, recent=4)
    newest = sorted(memory.frames, key=lambda f: -f.timestamp)[:4]
    assert {f.frame_id for f in newest} <= {f.frame_id for f, _ in chosen}
