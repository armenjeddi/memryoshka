"""Checks for cloned narration that do not need anyone to listen:
(1) speaker similarity to the real voice (Chatterbox's speaker encoder, cosine), with real-vs-real and a different
    speaker for scale; (2) a transcript of each clip with Whisper, compared word by word with the script.
usage: ~/scratch/envs/chatterbox/bin/python video/voice_check.py <sample.m4a> <name> <clip folder> [other speaker wav]"""
import json, re, subprocess, sys
from pathlib import Path
import numpy as np, torch, librosa

ROOT = Path(__file__).resolve().parent
sample, name, folder = sys.argv[1], sys.argv[2], Path(sys.argv[3])
other = sys.argv[4] if len(sys.argv) > 4 else None
torch.set_num_threads(4)

def load(path, start=None, dur=None):
    cmd = ["ffmpeg", "-v", "error"] + (["-ss", str(start), "-t", str(dur)] if start is not None else []) + ["-i", str(path), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32)

from chatterbox.tts import ChatterboxTTS  # reuse the pretrained encoder weights
ve = ChatterboxTTS.from_pretrained(device="cpu").ve
def emb(w):
    e = ve.embeds_from_wavs([w], sample_rate=16000)
    e = np.asarray(e).reshape(-1); return e / np.linalg.norm(e)
real = {"real 9.6-20.4 s (reference a)": load(sample, 9.6, 10.8), "real 26.5-37.5 s (reference b)": load(sample, 26.5, 11.0),
        "real 39.2-51.4 s": load(sample, 39.2, 12.2), "real 66.1-79.2 s": load(sample, 66.1, 13.1)}
E = {k: emb(v) for k, v in real.items()}
keys = list(E)
print("real vs real:", ", ".join(f"{keys[i][5:14]} / {keys[j][5:14]} {E[keys[i]] @ E[keys[j]]:.3f}" for i in range(4) for j in range(i + 1, 4)))
held = [E[keys[2]], E[keys[3]]]
if other:
    eo = emb(load(other)); print(f"different speaker (placeholder voice) vs real: {np.mean([eo @ h for h in held]):.3f}")
lines = {l["id"]: l["text"] for l in json.load(open(ROOT / f"{name}_lines.json"))}
import whisper
asr = whisper.load_model("small.en", device="cpu")
norm = lambda s: re.sub(r"[^a-z0-9 ]", " ", s.lower().replace("-", " ")).split()
def wer(ref, hyp):
    r, h = norm(ref), norm(hyp); d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1])); prev, d[j] = d[j], cur
    return d[len(h)] / max(1, len(r))
for f in sorted(folder.glob("*.wav")):
    w = load(f); e = emb(w)
    text = asr.transcribe(str(f), language="en", fp16=False)["text"].strip()
    ref = lines.get(f.stem, "")
    print(f"{f.stem:8s} {len(w)/16000:5.1f} s  similarity to held-out real {np.mean([e @ h for h in held]):.3f}  word error {wer(ref, text):.2f}  | {text}")
