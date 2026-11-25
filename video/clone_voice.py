"""Narration in an author's voice: clone it from a short reference recording with Chatterbox (Resemble AI, MIT license,
open weights; its outputs carry an inaudible Perth watermark) and write one WAV per narration line.
usage: ~/scratch/envs/chatterbox/bin/python video/clone_voice.py <intro|arch> <reference.wav> [cpu|cuda] [ids,...]
reference used: video/voice/armen_reference.wav (two stretches of the sample, chosen by voice_sweep.py)
output: video/voice/<name>/<line id>.wav, then run voice.py <name> --from-dir video/voice/<name> --raw"""
import json, sys, time
from pathlib import Path
import torch, torchaudio as ta
from chatterbox.tts import ChatterboxTTS

ROOT = Path(__file__).resolve().parent
name, ref = sys.argv[1], sys.argv[2]
device = sys.argv[3] if len(sys.argv) > 3 else ("cuda" if torch.cuda.is_available() else "cpu")
only = set(sys.argv[4].split(",")) if len(sys.argv) > 4 else None
torch.set_num_threads(4)
model = ChatterboxTTS.from_pretrained(device=device)
out = ROOT / "voice" / name
out.mkdir(parents=True, exist_ok=True)
for i, ln in enumerate(json.load(open(ROOT / f"{name}_lines.json"))):
    if (only and ln["id"] not in only) or ln.get("silent"):
        continue
    torch.manual_seed(1000 + i + int(__import__('os').environ.get('SEED_OFFSET', 0)))  # SEED_OFFSET=1 to redo a line differently
    t0 = time.time()
    # "say" is what the voice reads (respelled where pronunciation needs help); captions keep "text".
    # Settings chosen by voice_lab.py: calmer and slower (closest to the real voice on two speaker verifiers).
    wav = model.generate(ln.get("say", ln["text"]), audio_prompt_path=ref, exaggeration=0.3, cfg_weight=0.3, temperature=0.6)
    ta.save(str(out / f"{ln['id']}.wav"), wav, model.sr)
    print(f"{ln['id']}: {wav.shape[-1] / model.sr:.1f} s of speech in {time.time() - t0:.0f} s", flush=True)
