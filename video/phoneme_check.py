"""What sounds a clip contains, with no word guessing: a phoneme recognizer (wav2vec2 trained on espeak phonemes,
facebook/wav2vec2-lv-60-espeak-cv-ft) gives the phonemes with times; Whisper word timestamps locate the word "fade"
(or whatever Whisper hears there) so its phonemes can be read on their own. /fād/ is "f eɪ d" in these symbols.
usage: ~/scratch/envs/chatterbox/bin/python video/phoneme_check.py <audio>[@start-end] ..."""
import json, subprocess, sys
import numpy as np, torch, whisper
from huggingface_hub import hf_hub_download
from transformers import Wav2Vec2ForCTC

torch.set_num_threads(4)
MID = "facebook/wav2vec2-lv-60-espeak-cv-ft"
vocab = json.load(open(hf_hub_download(MID, "vocab.json")))
inv = {v: k for k, v in vocab.items()}
model = Wav2Vec2ForCTC.from_pretrained(MID).eval()
asr = whisper.load_model("small.en", device="cpu")

def load16(path, s=None, e=None):
    cmd = ["ffmpeg", "-v", "error"] + (["-ss", str(s), "-to", str(e)] if s is not None else []) + ["-i", path, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).copy()

def phonemes(w):
    x = torch.from_numpy((w - w.mean()) / (w.std() + 1e-7))[None]
    with torch.no_grad():
        ids = model(x).logits[0].argmax(-1).tolist()
    out, prev = [], None
    for t, i in enumerate(ids):            # CTC: collapse repeats, drop blanks; 20 ms per frame
        if i != prev and inv.get(i) not in ("<pad>", "<s>", "</s>", "<unk>", None):
            out.append((t * 0.02, inv[i]))
        prev = i
    return out

for arg in sys.argv[1:]:
    path, s, e = arg, None, None
    if "@" in arg:
        path, span = arg.split("@"); s, e = (float(v) for v in span.split("-"))
    w = load16(path, s, e)
    r = asr.transcribe(w, language="en", fp16=False, word_timestamps=True)
    words = [x for seg in r["segments"] for x in seg["words"]]
    ph = phonemes(w)
    target = [x for x in words if x["word"].strip().lower().strip(".,!?").startswith(("fad", "fat", "fed", "fe", "fa", "fi"))]
    print(f"\n{arg}\n  heard: {r['text'].strip()}")
    print("  all phonemes: " + " ".join(p for _, p in ph))
    for x in target:
        seg = [p for t, p in ph if x["start"] - 0.08 <= t <= x["end"] + 0.08]
        print(f"  word {x['word'].strip()!r} at {x['start']:.2f}-{x['end']:.2f} s: phonemes {' '.join(seg)}")
