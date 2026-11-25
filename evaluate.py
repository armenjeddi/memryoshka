"""Evaluate Memryoshka on multiple-choice video questions (see docs/evaluation.md for the data format).

    python evaluate.py --questions data/lvbench.jsonl --videos /data/lvbench/videos --out results/lvbench_7mb.jsonl
                       [--budget-mb 7.168 --readout 1000 --recent 0]

Each video is streamed once at one frame per second. A question with a time is answered from the memory as it was at that
moment (streaming questions); a question without one is answered after the whole video. The memory never sees a
question before it is asked. Finished questions are skipped when the same --out file is used again.
"""
import argparse
import collections
import json
import os
import time

from memryoshka.features import sample_frames
from memryoshka.pipeline import BATCH, Memryoshka
from memryoshka.readout import DEFAULT_READOUT
from memryoshka.writer import DEFAULT_BUDGET


def load_questions(path):
    rows = [json.loads(line) for line in open(path) if line.strip()]
    for i, r in enumerate(rows):
        r.setdefault("id", str(i))
        r.setdefault("time", None)
        r.setdefault("benchmark", os.path.splitext(os.path.basename(path))[0])
    return rows


def run_video(system, video, questions, args, out):
    """Stream one video and answer its questions at their times."""
    streaming = sorted((q for q in questions if q["time"] is not None), key=lambda q: q["time"])
    offline = [q for q in questions if q["time"] is None]
    memory = system.memory(int(round(args.budget_mb * 1e6)))
    pending, frame_id, cursor = [], 0, 0

    def flush():
        nonlocal pending, frame_id
        if pending:
            system.write(memory, system.encode(pending), frame_id)
            frame_id += len(pending)
            pending = []

    def answer(q):
        r = system.ask(memory, q["question"], q["options"], readout=args.readout, recent=args.recent)
        row = {"id": q["id"], "benchmark": q["benchmark"], "task": q.get("task"), "video": q["video"], "time": q["time"],
               "gold": q["answer"], "prediction": r["answer"], "correct": r["answer"] == q["answer"], "logp": r["logp"],
               "frames_read": r["frames_read"], "tokens_read": r["tokens_read"], "positions": r["positions"],
               "frames_written": frame_id, "frames_stored": len(memory.frames), "memory_bytes": memory.nbytes}
        out.write(json.dumps(row) + "\n")
        out.flush()
        return row["correct"]

    for sample in sample_frames(os.path.join(args.videos, video), 1.0):
        requested = sample[2]
        while cursor < len(streaming) and streaming[cursor]["time"] < requested:
            flush()
            answer(streaming[cursor])
            cursor += 1
        if cursor == len(streaming) and not offline:
            break   # nothing left to ask about this video
        pending.append(sample)
        if len(pending) == BATCH:
            flush()
    flush()
    for q in streaming[cursor:] + offline:
        answer(q)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--questions", required=True, help="JSONL file, one question per line")
    ap.add_argument("--videos", default=".", help="folder the 'video' paths are relative to")
    ap.add_argument("--out", required=True, help="JSONL file for the answers")
    ap.add_argument("--budget-mb", type=float, default=DEFAULT_BUDGET / 1e6, help="memory size (default 7.168 MB)")
    ap.add_argument("--readout", type=int, default=DEFAULT_READOUT, help="reader positions per question (default 1,000)")
    ap.add_argument("--recent", type=int, default=0, help="always read this many newest frames (the paper's variant: 4)")
    ap.add_argument("--device", default="cuda")
    args = ap.parse_args()

    questions = load_questions(args.questions)
    done = set()
    if os.path.exists(args.out):
        done = {json.loads(line)["id"] for line in open(args.out) if line.strip()}
    todo = collections.defaultdict(list)
    for q in questions:
        if q["id"] not in done:
            todo[q["video"]].append(q)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    system = Memryoshka(device=args.device)
    t0 = time.time()
    with open(args.out, "a") as out:
        for i, (video, qs) in enumerate(todo.items()):
            run_video(system, video, qs, args, out)
            print(f"[{i + 1}/{len(todo)}] {video}: {len(qs)} questions, {time.time() - t0:.0f} s", flush=True)

    rows = [json.loads(line) for line in open(args.out) if line.strip()]
    by = collections.defaultdict(list)
    for r in rows:
        by[r["benchmark"]].append(r["correct"])
    for name, values in sorted(by.items()):
        print(f"{name}: {100 * sum(values) / len(values):.1f}% of {len(values)} questions")


if __name__ == "__main__":
    main()
