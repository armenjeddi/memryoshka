"""Make the cloned narration closer to the real voice. Compares conditioning and settings on two probe lines with:
speaker similarity by Chatterbox's encoder and by an independent verifier (Microsoft WavLM, base-plus-sv), both
against stretches of the sample never used for conditioning, and speaking rate (the real reading is about 131 words
per minute). usage: ~/scratch/envs/chatterbox/bin/python video/voice_lab.py <sample>"""
import json, subprocess, sys, time
from pathlib import Path
import numpy as np, torch, torchaudio as ta
from chatterbox.tts import ChatterboxTTS
from transformers import AutoFeatureExtractor, WavLMForXVector

ROOT = Path(__file__).resolve().parent
sample = sys.argv[1]
torch.set_num_threads(4)
out = ROOT / "voice" / "lab"; out.mkdir(parents=True, exist_ok=True)

def load(s=None, d=None, sr=16000, path=None):
    cmd = ["ffmpeg", "-v", "error"] + (["-ss", str(s), "-t", str(d)] if s is not None else []) + ["-i", str(path or sample), "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).copy()

# speech stretches of the sample; held-out ones (39.2-51.4 s, 66.1-79.2 s) are only used to score
POOL = [(1.3, 5.8), (6.8, 9.4), (9.7, 14.8), (15.5, 20.4), (21.7, 25.7), (26.6, 32.6), (33.9, 36.7), (54.6, 56.1),
        (57.8, 59.0), (61.7, 63.6), (80.6, 86.0)]
HELD = [(39.2, 12.2), (66.1, 13.1)]

m = ChatterboxTTS.from_pretrained(device="cpu")
fe = AutoFeatureExtractor.from_pretrained("microsoft/wavlm-base-plus-sv")
sv = WavLMForXVector.from_pretrained("microsoft/wavlm-base-plus-sv").eval()
def sv_emb(w):
    with torch.no_grad():
        e = sv(**fe(w, sampling_rate=16000, return_tensors="pt")).embeddings[0]
    return torch.nn.functional.normalize(e, dim=-1).numpy()
def ve_emb(w):
    e = np.asarray(m.ve.embeds_from_wavs([w], sample_rate=16000)).reshape(-1); return e / np.linalg.norm(e)
held = [load(s, d) for s, d in HELD]
H_sv, H_ve = [sv_emb(w) for w in held], [ve_emb(w) for w in held]
refs = [load(9.6, 10.8), load(26.5, 11.0)]
print(f"scale: real vs real  WavLM {np.mean([sv_emb(r) @ h for r in refs for h in H_sv]):.3f}  Chatterbox {np.mean([ve_emb(r) @ h for r in refs for h in H_ve]):.3f}", flush=True)

def averaged_conds(ex):
    m.prepare_conditionals(str(ROOT / "voice" / "armen_reference.wav"), exaggeration=ex)
    segs = [load(s, e - s) for s, e in POOL]
    pool16 = np.concatenate(segs)
    ve = torch.from_numpy(np.asarray(m.ve.embeds_from_wavs([pool16], sample_rate=16000))).float().mean(0, keepdim=True)
    m.conds.t3.speaker_emb = ve.to(m.conds.t3.speaker_emb.dtype)
    xs = [m.s3gen.speaker_encoder.inference(torch.from_numpy(s)[None].float()) for s in segs if len(s) >= 2.5 * 16000]
    m.conds.gen["embedding"] = torch.stack(xs).mean(0).to(m.conds.gen["embedding"].dtype)

lines = {l["id"]: l["text"] for l in json.load(open(ROOT / "intro_lines.json"))}
probe = [lines["watch"], lines["numbers"]]
configs = {
    "current (one reference, default pace)": dict(avg=False, ex=0.45, cfg=0.5, temp=0.75),
    "one reference, slower (cfg 0.3)": dict(avg=False, ex=0.4, cfg=0.3, temp=0.7),
    "averaged voice, default pace": dict(avg=True, ex=0.45, cfg=0.5, temp=0.75),
    "averaged voice, slower (cfg 0.3)": dict(avg=True, ex=0.4, cfg=0.3, temp=0.7),
    "averaged voice, calmer and slower": dict(avg=True, ex=0.3, cfg=0.3, temp=0.6),
}
for name, c in configs.items():
    if c["avg"]: averaged_conds(c["ex"])
    else: m.prepare_conditionals(str(ROOT / "voice" / "armen_reference.wav"), exaggeration=c["ex"])
    s_sv, s_ve, wpm = [], [], []
    for i, txt in enumerate(probe):
        torch.manual_seed(11 + i)
        w = m.generate(txt, audio_prompt_path=None, exaggeration=c["ex"], cfg_weight=c["cfg"], temperature=c["temp"])
        fp = out / f"{name.split(' (')[0].replace(' ', '_').replace(',', '')}_{c['cfg']}_{c['ex']}_{i}.wav"
        ta.save(str(fp), w, m.sr)
        w16 = load(path=fp)
        s_sv.append(np.mean([sv_emb(w16) @ h for h in H_sv])); s_ve.append(np.mean([ve_emb(w16) @ h for h in H_ve]))
        wpm.append(len(txt.split()) / (len(w16) / 16000) * 60)
    print(f"{name:40s} WavLM {np.mean(s_sv):.3f}  Chatterbox {np.mean(s_ve):.3f}  pace {np.mean(wpm):.0f} words/min", flush=True)
