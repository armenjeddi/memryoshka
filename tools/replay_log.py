"""Replay the paper's Memryoshka writer (pcasm PCA code, powers-of-two lengths, e0 0.5, 7,168,000 bytes) on one
Video-MME long video from its saved writer inputs, and log the memory state every EVERY frames. CPU only.
usage: python replay_log.py <video_id> <out.json> [every=30] [budget_bytes]"""
import os, sys, json, time, collections
os.environ.setdefault("MH_PREFIX_SET", "pow2")
os.environ.setdefault("MH_REPLAY_DEVICE", "cpu")
sys.path.insert(0, "/project/6101803/armen/research_projects/memryoshka_tuning/harness")
import torch
torch.set_num_threads(4)
import mh, replay
from memryoshka.fast.device_memory import DeviceMemoryStore

vid, out = sys.argv[1], sys.argv[2]
every = int(sys.argv[3]) if len(sys.argv) > 3 else 30
budget = int(sys.argv[4]) if len(sys.argv) > 4 else mh.BUDGET_BYTES
dev = torch.device("cpu")
codec, energies, tag = mh.load_codec(dev)
print("codec", tag, "budget", budget, "energies", {k: round(v, 3) for k, v in energies.items()}, flush=True)
dump_root = mh.WORK / "dump" / mh.pca_tag().replace(":", "_")
d = torch.load(dump_root / os.environ.get("MH_BENCH", "vmmelong") / f"{vid}.pt", map_location="cpu", weights_only=False)
store = DeviceMemoryStore(budget, energies, tag_dim=mh.TAG_DIM, device=dev, memory_format_version=3)
off, coeffs, att, tags = d["offsets"].tolist(), d["coeffs"], d["attention"], d["tags"].numpy()
ts = d["timestamps"].tolist()
n = d["frames"]
LENS = [32, 64, 128, 256, 512, 1024, 2048, 4096]
snaps, arrivals, t0 = [], [], time.time()
for i in range(n):
    c = coeffs[off[i]:off[i + 1]].to(dtype=torch.float32)
    packed = replay.encode_from_coefficients(codec, c)
    a = att[off[i]:off[i + 1]].tolist()
    ntok_in = int(off[i + 1] - off[i])
    r = store.write(i, ts[i], d["grids"][i], packed.payloads, a, tags[i])
    # what the newest frame got on arrival
    fr_now = {f.frame_id: f for f in store.frames()} if (i + 1) % every == 0 or i == n - 1 else None
    if fr_now is not None:
        frames = []
        hist = collections.Counter()
        for f in sorted(fr_now.values(), key=lambda f: f.frame_id):
            bits = [t.prefix_bits for t in f.tokens]
            h = collections.Counter(bits)
            hist.update(h)
            frames.append([f.frame_id, len(bits), round(sum(bits) / max(1, len(bits)), 1), [h.get(L, 0) for L in LENS]])
        u = store.usage()
        snaps.append({"frame": i + 1, "time": ts[i], "price": store.price, "bytes": u["physical_serialized_bytes"],
                      "frames_kept": len(frames), "tokens_kept": u["tokens"], "hist": [hist.get(L, 0) for L in LENS],
                      "frames": frames})
        print(f"{i + 1}/{n} t={ts[i]:.0f}s kept {len(frames)} frames {u['tokens']} tokens {u['physical_serialized_bytes']} B "
              f"price {store.price:.3g} ({time.time() - t0:.0f} s)", flush=True)
    arrivals.append(ntok_in)
data = store.serialize()
h = mh.sha_bytes(data)[:16]
print("final serialized sha16", h, "bytes", len(data), flush=True)
json.dump({"video_id": vid, "budget": budget, "every": every, "lengths": LENS, "energies": energies, "n_frames": n,
           "timestamps": ts, "tokens_in": arrivals, "final_sha16": h, "snapshots": snaps}, open(out, "w"))
