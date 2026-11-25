"""Stream one video into a Memryoshka memory and print what it keeps.

    python demo.py VIDEO [--budget-mb 7.168] [--save memory.mryk] [--save-inputs inputs.npz]
    python demo.py --inputs inputs.npz [--budget-mb 1.8]      # re-run only the writer on saved inputs (CPU)

The memory is written as if the video were a live stream: one frame per second, in order, without knowing any question.
"""
import argparse
import sys

from memryoshka import LENGTHS, Memory, NestedCode
from memryoshka.writer import DEFAULT_BUDGET

TOKEN_BYTES = 3584 * 2   # one Qwen2.5-VL-7B visual token at 16 bits


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video", nargs="?", help="video file")
    ap.add_argument("--inputs", help="writer inputs saved by --save-inputs (skips the GPU)")
    ap.add_argument("--budget-mb", type=float, default=DEFAULT_BUDGET / 1e6, help="memory size in MB (default 7.168)")
    ap.add_argument("--fixed-bits", type=int, choices=LENGTHS, help="the fixed-length comparison in the paper's Table 2: keep every token at this length or drop it")
    ap.add_argument("--save", help="write the memory to this file")
    ap.add_argument("--save-inputs", help="also save the writer inputs (.npz) to re-run the writer later")
    ap.add_argument("--every", type=int, default=300, help="print a line every this many frames")
    ap.add_argument("--device", default="cuda")
    args = ap.parse_args()
    if not args.video and not args.inputs:
        ap.error("give a video or --inputs")

    budget = int(round(args.budget_mb * 1e6))
    if args.inputs:
        from memryoshka.pipeline import load_inputs, write_inputs
        memory = Memory(budget, NestedCode(), fixed_bits=args.fixed_bits)
        inputs = load_inputs(args.inputs)
        write_inputs(memory, inputs, log_every=args.every)
        seen, tokens_per_frame = len(inputs), sum(len(x["attention"]) for x in inputs) / max(1, len(inputs))
        last_time = inputs[-1]["timestamp"] if inputs else 0.0
    else:
        from memryoshka.pipeline import Memryoshka, save_inputs
        system = Memryoshka(device=args.device)
        memory = system.memory(budget, fixed_bits=args.fixed_bits)
        inputs = system.stream(args.video, memory, keep_inputs=True, log_every=args.every)
        if args.save_inputs:
            save_inputs(args.save_inputs, inputs)
        seen, tokens_per_frame = len(inputs), sum(len(x["attention"]) for x in inputs) / max(1, len(inputs))
        last_time = inputs[-1]["timestamp"] if inputs else 0.0

    s = memory.summary()
    full = seen * tokens_per_frame * TOKEN_BYTES
    print()
    print(f"Video seen: {seen} frames, the last at {int(last_time) // 60}:{int(last_time) % 60:02d}; "
          f"about {tokens_per_frame:.0f} visual tokens per frame")
    print(f"Memory: {s['bytes'] / 1e6:.2f} MB of {budget / 1e6:.2f} MB")
    if seen:
        print(f"Frames still in memory: {s['frames']} of {seen} ({100 * s['frames'] / seen:.0f}%), "
              f"{s['tokens'] / max(1, s['frames']):.0f} tokens per kept frame on average")
    print(f"Bits per kept token: {s['mean_bits']:.0f} on average (a 16-bit token is 57,344 bits)")
    print("Code lengths in memory: " + ", ".join(f"{r} bits: {n}" for r, n in s["lengths"].items() if n))
    print(f"Every visual token at 16 bits would take {full / 1e9:.2f} GB, {full / max(1, s['bytes']):.0f} times more; "
          f"at 16 bits the same memory would hold {int(budget // (tokens_per_frame * TOKEN_BYTES))} whole frames")
    if args.save:
        memory.save(args.save)
        print(f"Saved to {args.save}")


if __name__ == "__main__":
    sys.exit(main())
