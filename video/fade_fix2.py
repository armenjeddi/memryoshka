"""Last line in two parts. Part A = "No training needed. Memryoshka." from the current take (name said right),
cut at the pause after the name. Part B = "Fade, don't forget." generated on its own; a take is kept only if the
phoneme recognizer hears "f eɪ d" (/fād/) and Whisper hears "fade, don't forget". Output: voice/fade/end_joined.wav
usage: ~/scratch/envs/chatterbox/bin/python video/fade_fix2.py"""
import json, re, subprocess
from pathlib import Path
import numpy as np, torch, torchaudio as ta, whisper
from huggingface_hub import hf_hub_download
from transformers import Wav2Vec2ForCTC
from chatterbox.tts import ChatterboxTTS

ROOT = Path(__file__).resolve().parent
torch.set_num_threads(4)
out = ROOT / "voice" / "fade"; out.mkdir(parents=True, exist_ok=True)
MID = "facebook/wav2vec2-lv-60-espeak-cv-ft"
inv = {v: k for k, v in json.load(open(hf_hub_download(MID, "vocab.json"))).items()}
pr = Wav2Vec2ForCTC.from_pretrained(MID).eval()
asr = whisper.load_model("small.en", device="cpu")
tok = whisper.tokenizer.get_tokenizer(multilingual=False)

def load(path, sr=16000):
    cmd = ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).copy()
def phonemes(w):
    with torch.no_grad():
        ids = pr(torch.from_numpy((w - w.mean()) / (w.std() + 1e-7))[None]).logits[0].argmax(-1).tolist()
    res, prev = [], None
    for t, i in enumerate(ids):
        if i != prev and inv.get(i) not in ("<pad>", "<s>", "</s>", "<unk>", None): res.append((t * 0.02, inv[i]))
        prev = i
    return res
def clarity(w, text):
    mel = whisper.log_mel_spectrogram(whisper.pad_or_trim(torch.from_numpy(w))).unsqueeze(0)
    pre = list(tok.sot_sequence_including_notimestamps); ids = pre + tok.encode(" " + text) + [tok.eot]
    t = torch.tensor([ids])
    with torch.no_grad():
        lp = torch.log_softmax(asr(mel, t[:, :-1]), -1).gather(-1, t[:, 1:, None])[0, :, 0]
    return float(lp[len(pre) - 1:].mean())

# ---- part A: cut the current take after "Memryoshka", in the pause before "fade"
cur = ROOT / "voice" / "intro_v2" / "end.wav"
w24 = load(cur, 24000); w16 = load(cur)
r = asr.transcribe(w16, language="en", fp16=False, word_timestamps=True)
words = [x for s in r["segments"] for x in s["words"]]
k = next(i for i, x in enumerate(words) if x["word"].strip().lower().startswith(("fad", "fat", "fa")))
gap0, gap1 = words[k - 1]["end"], words[k]["start"]
# lowest-energy 20 ms point between the name and "fade"
fr = int(0.02 * 24000); a, b = int(gap0 * 24000), max(int(gap1 * 24000), int(gap0 * 24000) + fr)
env = [np.sqrt(np.mean(w24[i:i + fr] ** 2)) for i in range(a, b, fr // 2)] or [0]
cut = a + int(np.argmin(env)) * (fr // 2)
partA = w24[:cut]
print(f"part A: {r['text'].strip()!r}, cut at {cut / 24000:.2f} s (name ends {gap0:.2f}, fade starts {gap1:.2f})", flush=True)

# ---- part B: candidates for "Fade, don't forget."
m = ChatterboxTTS.from_pretrained(device="cpu")
m.prepare_conditionals(str(ROOT / "voice" / "armen_reference.wav"), exaggeration=0.3)
CANDS = ["Fade, don't forget.", "Feyd, don't forget.", "Faid, don't forget.", "fade, don't forget."]
best = None
for ci, say in enumerate(CANDS):
    for seed in range(4):
        torch.manual_seed(1300 + 10 * ci + seed)
        w = m.generate(say, audio_prompt_path=None, exaggeration=0.3, cfg_weight=0.3, temperature=0.6)
        fp = out / f"partB_{ci}_{seed}.wav"; ta.save(str(fp), w, m.sr)
        b16 = load(fp)
        ph = [p for _, p in phonemes(b16)]
        start = " ".join(ph[:3])
        ok = start in ("f eɪ d", "f e d") or (ph[:2] == ["f", "eɪ"] and len(ph) > 2 and ph[2] in ("d", "t"))
        text = asr.transcribe(b16, language="en", fp16=False)["text"].strip()
        heard_ok = re.sub(r"[^a-z ]", "", text.lower()).split()[:3] == ["fade", "dont", "forget"]
        c = clarity(b16, "Fade, don't forget.")
        print(f"part B cand {ci} seed {seed}: starts [{start}] {'OK' if ok else 'no'}, heard {text!r} ({'OK' if heard_ok else 'no'}), clarity {c:.2f} | {' '.join(ph)}", flush=True)
        if ok and heard_ok and (best is None or c > best[0]):
            best = (c, fp, say)
if best is None:
    print("NO GOOD PART B", flush=True)
else:
    b24 = load(best[1], 24000)
    # trim leading silence of part B, join with a 0.35 s pause
    th = 0.01 * np.max(np.abs(b24)); i0 = int(np.argmax(np.abs(b24) > th))
    joined = np.concatenate([partA, np.zeros(int(0.35 * 24000), np.float32), b24[max(0, i0 - 480):]])
    ta.save(str(out / "end_joined.wav"), torch.from_numpy(joined)[None], 24000)
    j16 = load(out / "end_joined.wav")
    print(f"BEST part B: {best[1].name} ({best[2]!r}, clarity {best[0]:.2f}); joined heard: "
          f"{asr.transcribe(j16, language='en', fp16=False)['text'].strip()!r} | {' '.join(p for _, p in phonemes(j16))}", flush=True)
