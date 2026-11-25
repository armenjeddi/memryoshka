"""Pick spellings that make the clone pronounce "Memryoshka" and "fade, don't forget" clearly. For each candidate text
(what the voice model reads; captions keep the normal spelling), a few takes are generated and scored with Whisper:
 - clarity: average log-probability of the intended caption text given the audio (higher is clearer);
 - fade margin: log P(text with "fade") - log P(same text with "fate"); above 0 means "fade" is heard.
The real recording of the same line is scored the same way, as a yardstick.
usage: ~/scratch/envs/chatterbox/bin/python video/pron_lab.py <sample> <avg 0|1> <exaggeration> <cfg> <temperature>"""
import json, subprocess, sys
from pathlib import Path
import numpy as np, torch, torchaudio as ta, whisper
from chatterbox.tts import ChatterboxTTS

ROOT = Path(__file__).resolve().parent
sample, avg, ex, cfg, temp = sys.argv[1], sys.argv[2] == "1", float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
torch.set_num_threads(4)
out = ROOT / "voice" / "pron"; out.mkdir(parents=True, exist_ok=True)
POOL = [(1.3, 5.8), (6.8, 9.4), (9.7, 14.8), (15.5, 20.4), (21.7, 25.7), (26.6, 32.6), (33.9, 36.7), (54.6, 56.1),
        (57.8, 59.0), (61.7, 63.6), (80.6, 86.0)]

def load(s=None, d=None, path=None, sr=16000):
    cmd = ["ffmpeg", "-v", "error"] + (["-ss", str(s), "-t", str(d)] if s is not None else []) + ["-i", str(path or sample), "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).copy()

m = ChatterboxTTS.from_pretrained(device="cpu")
m.prepare_conditionals(str(ROOT / "voice" / "armen_reference.wav"), exaggeration=ex)
if avg:
    segs = [load(s, e - s) for s, e in POOL]
    ve = torch.from_numpy(np.asarray(m.ve.embeds_from_wavs([np.concatenate(segs)], sample_rate=16000))).float().mean(0, keepdim=True)
    m.conds.t3.speaker_emb = ve.to(m.conds.t3.speaker_emb.dtype)
    xs = [m.s3gen.speaker_encoder.inference(torch.from_numpy(s)[None].float()) for s in segs if len(s) >= 2.5 * 16000]
    m.conds.gen["embedding"] = torch.stack(xs).mean(0).to(m.conds.gen["embedding"].dtype)

asr = whisper.load_model("small.en", device="cpu")
tok = whisper.tokenizer.get_tokenizer(multilingual=False)
def logp(wav16, text):
    mel = whisper.log_mel_spectrogram(whisper.pad_or_trim(torch.from_numpy(wav16))).unsqueeze(0)
    pre = list(tok.sot_sequence_including_notimestamps)
    ids = pre + tok.encode(" " + text) + [tok.eot]
    t = torch.tensor([ids])
    with torch.no_grad():
        lp = torch.log_softmax(asr(mel, t[:, :-1]), -1).gather(-1, t[:, 1:, None])[0, :, 0]
    body = lp[len(pre) - 1:]
    return float(body.sum()), float(body.mean())

TESTS = {
  "end": ("No training needed. Memryoshka. Fade, don't forget.", "fade", "fate", (81.0, 5.2), [
      "No training needed. Memryoshka: fade, don't forget.",
      "No training needed. Memryoshka. Fade... don't forget.",
      "No training needed. Mem-ree-oshka. Fade... don't forget.",
      "No training needed. Memree-oshka. Fade, don't forget.",
      "No training needed. Mem ree osh ka. Fade. Don't forget."]),
  "nested": ("Memryoshka stores each token as a nested code, a shorter code inside a longer one, just like Russian Matryoshka dolls.", None, None, (26.6, 9.6), [
      "Memryoshka stores each token as a nested code, a shorter code inside a longer one, just like Russian Matryoshka dolls.",
      "Mem-ree-oshka stores each token as a nested code, a shorter code inside a longer one, just like Russian Matryoshka dolls.",
      "Memree-oshka stores each token as a nested code, a shorter code inside a longer one, just like Russian Mat-ree-oshka dolls."]),
}
res = {}
for key, (canon, good, bad, real_span, cands) in TESTS.items():
    real = load(*real_span)
    s_real, c_real = logp(real, canon)
    msg = f"[{key}] your recording: clarity {c_real:.2f}"
    if good: msg += f", fade margin {s_real - logp(real, canon.replace(good, bad).replace(good.capitalize(), bad.capitalize()))[0]:+.2f}"
    print(msg + f"  | {asr.transcribe(real, language='en', fp16=False)['text'].strip()}", flush=True)
    for ci, say in enumerate(cands):
        for seed in range(3):
            torch.manual_seed(500 + 10 * ci + seed)
            w = m.generate(say, audio_prompt_path=None, exaggeration=ex, cfg_weight=cfg, temperature=temp)
            fp = out / f"{key}_{ci}_{seed}.wav"; ta.save(str(fp), w, m.sr)
            w16 = load(path=fp)
            s, c = logp(w16, canon)
            line = f"[{key}] cand {ci} seed {seed}: clarity {c:.2f}"
            if good:
                s_bad = logp(w16, canon.replace(good, bad).replace(good.capitalize(), bad.capitalize()))[0]
                line += f", fade margin {s - s_bad:+.2f}"
            text = asr.transcribe(w16, language="en", fp16=False)["text"].strip()
            print(f"{line}, {len(w16)/16000:.1f} s  | {say!r} -> {text}", flush=True)
