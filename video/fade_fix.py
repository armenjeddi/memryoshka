"""Find a take of the last line where "fade" is said /fād/ ("f eɪ d" in phoneme symbols) and the name is right.
The voice reads a respelling ("Faid" as in "paid", or "Fayd"); captions keep "fade". Each take is checked by a phoneme
recognizer (no word guessing) and by Whisper. usage: ~/scratch/envs/chatterbox/bin/python video/fade_fix.py"""
import json, re, shutil, subprocess
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
m = ChatterboxTTS.from_pretrained(device="cpu")
m.prepare_conditionals(str(ROOT / "voice" / "armen_reference.wav"), exaggeration=0.3)

def load16(path):
    cmd = ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).copy()
def phonemes(w):
    with torch.no_grad():
        ids = pr(torch.from_numpy((w - w.mean()) / (w.std() + 1e-7))[None]).logits[0].argmax(-1).tolist()
    res, prev = [], None
    for t, i in enumerate(ids):
        if i != prev and inv.get(i) not in ("<pad>", "<s>", "</s>", "<unk>", None): res.append((t * 0.02, inv[i]))
        prev = i
    return res

CANDS = ["No training needed. Memryoshka. Faid. Don't forget.",
         "No training needed. Memryoshka. Fayd. Don't forget.",
         "No training needed. Memryoshka: faid, don't forget.",
         "No training needed. Memryoshka: fayd, don't forget."]
results = []
for ci, say in enumerate(CANDS):
    for seed in range(3):
        torch.manual_seed(900 + 10 * ci + seed)
        w = m.generate(say, audio_prompt_path=None, exaggeration=0.3, cfg_weight=0.3, temperature=0.6)
        fp = out / f"end_{ci}_{seed}.wav"; ta.save(str(fp), w, m.sr)
        w16 = load16(fp)
        r = asr.transcribe(w16, language="en", fp16=False, word_timestamps=True)
        words = [x for s in r["segments"] for x in s["words"]]
        ph = phonemes(w16)
        seq = " ".join(p for _, p in ph)
        # the "fade" word: the phonemes after the name, before "don't"
        i_f = [k for k, (_, p) in enumerate(ph) if p == "f"]
        fade_ph = ""
        for k in i_f:
            nxt = [p for _, p in ph[k:k + 4]]
            if len(nxt) >= 3 and nxt[2] in ("d", "ð", "t") or (len(nxt) >= 2 and nxt[1] in ("eɪ", "e", "ɛ", "ɑː", "a", "æ")):
                fade_ph = " ".join(nxt[:3]); break
        vowel_ok = fade_ph.startswith("f eɪ d") or fade_ph.startswith("f e d")
        name_ok = not re.search(r"\bmemory\b", r["text"].lower())
        results.append((vowel_ok, name_ok, fp, say, fade_ph, r["text"].strip()))
        print(f"cand {ci} seed {seed}: fade sounds [{fade_ph}] {'OK' if vowel_ok else 'no'}, name {'OK' if name_ok else 'no'}"
              f" | {say!r} -> {r['text'].strip()}  ||  {seq}", flush=True)
good = [x for x in results if x[0] and x[1]]
print("GOOD TAKES:", [str(x[2].name) for x in good], flush=True)
