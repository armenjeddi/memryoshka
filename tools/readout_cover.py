"""Tokens the paper's readout takes per frame (fewest most-important stored tokens covering 80% of the frame's stored
importance), with every token stored (uncapped) vs Memryoshka's end-of-video memory; frames that fit in 1,000 positions."""
import json, sys
import numpy as np, torch
dump, replay = sys.argv[1], sys.argv[2]
d = torch.load(dump, map_location="cpu", weights_only=False)
off, att = d["offsets"].numpy(), d["attention"].numpy()
R = json.load(open(replay)); last = R["snapshots"][-1]
stored = {f[0]: f[1] for f in last["frames"]}

def alpha(a):
    a = a / a.mean()
    b = np.clip(np.round((np.log2(np.maximum(a, 1e-12)) + 8) / 16 * 255), 0, 255)
    return 2.0 ** (-8 + 16 * b / 255)

def k80(al):
    s = np.sort(al)[::-1]; c = np.cumsum(s)
    return int(np.searchsorted(c, 0.8 * c[-1]) + 1)

full_k, ours_k = [], []
for i in range(len(off) - 1):
    al = alpha(att[off[i]:off[i + 1]].astype(np.float64))
    full_k.append(k80(al))
    n = stored.get(i, 0)
    if n:
        ours_k.append(k80(np.sort(al)[::-1][:n]))
OVER = 9  # timestamp text plus two delimiters per frame, under one hour
for name, ks in (("every token stored", full_k), ("Memryoshka memory", ours_k)):
    m = float(np.mean(ks))
    print(f"{name}: {len(ks)} frames, mean tokens read per frame {m:.1f}, frames per 1,000-position readout about {1000 / (m + OVER):.0f}")
