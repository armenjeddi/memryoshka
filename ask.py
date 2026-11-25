"""Answer a multiple-choice question from a saved memory.

    python ask.py MEMORY --question "What does the girl carry?" --options "A dragon" "A sword" "A lamp" "A rabbit"
                  [--readout 1000] [--recent 0]

Only the memory file is read; the video is not needed. --readout is the number of reader positions the question may use
(visual tokens plus each frame's timestamp and delimiters); --recent 4 always adds the four newest stored frames.
"""
import argparse

from memryoshka import Memory
from memryoshka.readout import DEFAULT_READOUT


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("memory")
    ap.add_argument("--question", required=True)
    ap.add_argument("--options", nargs="+", required=True)
    ap.add_argument("--readout", type=int, default=DEFAULT_READOUT)
    ap.add_argument("--recent", type=int, default=0)
    ap.add_argument("--device", default="cuda")
    args = ap.parse_args()

    from memryoshka.pipeline import Memryoshka
    system = Memryoshka(device=args.device)
    memory = Memory.load(args.memory, system.code)
    r = system.ask(memory, args.question, args.options, readout=args.readout, recent=args.recent)
    print(f"Read {r['frames_read']} of {len(memory.frames)} stored frames, {r['tokens_read']} tokens, "
          f"{r['positions']} of {args.readout} positions")
    print("Frames read (seconds): " + ", ".join(f"{t:.0f}" for t in r["times"]))
    for letter, option, lp in zip("ABCDEFGHIJ", args.options, r["logp"]):
        mark = "  <- answer" if letter == r["answer"] else ""
        print(f"  ({letter}) {option}: log-probability {lp:.2f}{mark}")


if __name__ == "__main__":
    main()
