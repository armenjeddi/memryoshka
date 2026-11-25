"""Pick the reference cut and settings that make the clone closest to the real voice (scored against stretches of the
sample that are not used as references). usage: ~/scratch/envs/chatterbox/bin/python video/voice_sweep.py <sample>"""
import json, subprocess, sys
from pathlib import Path
import numpy as np, torch
from chatterbox.tts import ChatterboxTTS

ROOT = Path(__file__).resolve().parent
sample = sys.argv[1]
torch.set_num_threads(4)
out = ROOT / "voice" / "sweep"; out.mkdir(parents=True, exist_ok=True)

def cut(spans, path, clean):
    filt = "highpass=f=70," + ("afftdn=nr=8:nf=-45," if clean else "") + "loudnorm=I=-20:TP=-2:LRA=7"
    parts = []
    for k, (s, d) in enumerate(spans):
        pp = out / f"_part{k}.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(s), "-t", str(d), "-i", sample, "-ac", "1", "-ar", "24000", str(pp)], check=True)
        parts.append(pp)
    lst = out / "_list.txt"; lst.write_text("".join(f"file '{p}'\n" for p in parts))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-af", filt, "-ar", "24000", str(path)], check=True)

def load16(path, s=None, d=None):
    cmd = ["ffmpeg", "-v", "error"] + (["-ss", str(s), "-t", str(d)] if s is not None else []) + ["-i", str(path), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32)

refs = {
    "a_clean": ([(9.6, 10.8)], True), "a_raw": ([(9.6, 10.8)], False), "b_raw": ([(26.5, 11.0)], False),
    "ab_raw": ([(9.7, 5.1), (26.6, 6.0)], False), "e_raw": ([(52.5, 6.5), (61.7, 1.9), (20.4, 3.2)], False),
}
settings = {"default": dict(exaggeration=0.45, cfg_weight=0.5, temperature=0.75),
            "slow": dict(exaggeration=0.5, cfg_weight=0.3, temperature=0.8)}
m = ChatterboxTTS.from_pretrained(device="cpu")
emb = lambda w: (lambda e: e / np.linalg.norm(e))(np.asarray(m.ve.embeds_from_wavs([w], sample_rate=16000)).reshape(-1))
held = [emb(load16(sample, 39.2, 12.2)), emb(load16(sample, 66.1, 13.1))]
texts = [l["text"] for l in json.load(open(ROOT / "intro_lines.json"))]
probe = [texts[0], texts[3]]
for rname, (spans, clean) in refs.items():
    rp = out / f"ref_{rname}.wav"; cut(spans, rp, clean)
    for sname, kw in settings.items():
        if sname == "slow" and rname not in ("a_raw", "ab_raw"):
            continue
        sims = []
        for i, txt in enumerate(probe):
            torch.manual_seed(7 + i)
            w = m.generate(txt, audio_prompt_path=str(rp), **kw)
            fp = out / f"{rname}_{sname}_{i}.wav"
            import torchaudio as ta; ta.save(str(fp), w, m.sr)
            e = emb(load16(fp)); sims.append(np.mean([e @ h for h in held]))
        print(f"{rname:8s} {sname:8s} similarity {np.mean(sims):.3f}  ({', '.join(f'{s:.3f}' for s in sims)})", flush=True)
