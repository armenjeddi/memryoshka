"""Final narration in the cloned voice: several takes per line, keep the clearest one.
Each take is scored with Whisper: clarity (average log-probability of the caption text given the audio) and a
word-by-word comparison with the script; lines with "Memryoshka" must not come out as "memory ...", and the last
line must be heard as "fade", not "fate". Settings and reference as chosen by voice_lab.py and pron_lab.py.
usage: ~/scratch/envs/chatterbox/bin/python video/clone_best.py <intro|arch> [takes=2] [ids,...]
output: video/voice/<name>_v2/<id>.wav and picks.json"""
import json, re, subprocess, sys
from pathlib import Path
import numpy as np, torch, torchaudio as ta, whisper
from chatterbox.tts import ChatterboxTTS

ROOT = Path(__file__).resolve().parent
name = sys.argv[1]
takes = int(sys.argv[2]) if len(sys.argv) > 2 else 2
only = set(sys.argv[3].split(",")) if len(sys.argv) > 3 else None
torch.set_num_threads(4)
out = ROOT / "voice" / f"{name}_v2"; out.mkdir(parents=True, exist_ok=True)
m = ChatterboxTTS.from_pretrained(device="cpu")
m.prepare_conditionals(str(ROOT / "voice" / "armen_reference.wav"), exaggeration=0.3)
asr = whisper.load_model("small.en", device="cpu")
tok = whisper.tokenizer.get_tokenizer(multilingual=False)

def load16(path):
    cmd = ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).copy()
def logp(w, text):
    mel = whisper.log_mel_spectrogram(whisper.pad_or_trim(torch.from_numpy(w))).unsqueeze(0)
    pre = list(tok.sot_sequence_including_notimestamps); ids = pre + tok.encode(" " + text) + [tok.eot]
    t = torch.tensor([ids])
    with torch.no_grad():
        lp = torch.log_softmax(asr(mel, t[:, :-1]), -1).gather(-1, t[:, 1:, None])[0, :, 0]
    body = lp[len(pre) - 1:]; return float(body.sum()), float(body.mean())
norm = lambda s: re.sub(r"[^a-z0-9 ]", " ", s.lower().replace("-", " ")).split()
def wer(ref, hyp):
    r, h = norm(ref), norm(hyp); d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1])); prev, d[j] = d[j], cur
    return d[len(h)] / max(1, len(r))

picks = json.load(open(out / "picks.json")) if (out / "picks.json").exists() else {}
for i, ln in enumerate(json.load(open(ROOT / f"{name}_lines.json"))):
    if ln.get("silent") or (only and ln["id"] not in only):
        continue
    if only is None and str(picks.get(ln["id"], {}).get("take", "")).startswith("joined"):
        # The end line is joined by fade_fix2.py so that "fade" is read /feId/; a plain re-run would undo that.
        print(f"{ln['id']}: kept the joined clip (name it explicitly to redo it, then run fade_fix2.py again)", flush=True)
        continue
    caption, say = ln["text"], ln.get("say", ln["text"])
    has_name = "Memryoshka" in caption
    n = takes + (1 if has_name else 0)
    best = None
    for k in range(n):
        torch.manual_seed(2000 + 37 * i + k)
        w = m.generate(say, audio_prompt_path=None, exaggeration=0.3, cfg_weight=0.3, temperature=0.6)
        fp = out / f"{ln['id']}_take{k}.wav"; ta.save(str(fp), w, m.sr)
        w16 = load16(fp)
        s, clarity = logp(w16, caption)
        text = asr.transcribe(w16, language="en", fp16=False)["text"].strip()
        e = wer(caption.replace("Memryoshka", "X"), text.replace("Memryoshka", "X"))
        ok_name = (not has_name) or not re.search(r"\bmemory\b", text.lower().replace("memory model", ""))
        fade = None
        if ln["id"] == "end":
            fade = s - logp(w16, caption.replace("fade", "fate"))[0]
        score = clarity - 1.0 * e - (2.0 if not ok_name else 0) - (2.0 if fade is not None and fade < 0 else 0)
        print(f"{ln['id']:8s} take {k}: clarity {clarity:.2f}, word error {e:.2f}, name ok {ok_name}"
              + (f", fade margin {fade:+.1f}" if fade is not None else "") + f", {len(w16)/16000:.1f} s | {text}", flush=True)
        if best is None or score > best[0]:
            best = (score, k, fp, text, clarity, e)
    import shutil
    shutil.copy(best[2], out / f"{ln['id']}.wav")
    picks[ln["id"]] = {"take": best[1], "clarity": round(best[4], 3), "word_error": round(best[5], 3), "heard": best[3]}
    json.dump(picks, open(out / "picks.json", "w"), indent=1)
    print(f"  -> {ln['id']}: take {best[1]}", flush=True)
print("CLONE_BEST_DONE", flush=True)
