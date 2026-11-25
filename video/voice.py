"""Narration track and timeline for a video.
Placeholder voice: each line is synthesized with Piper (LJ Speech voice, public-domain data).
Your own voice: record one file per line, named by the line's id in <name>_lines.json (watch.m4a, heavy.m4a, ...),
put them in one folder, and pass --from-dir <folder>; the scenes then follow your timing.
usage: ~/scratch/envs/tts/bin/python video/voice.py <intro|arch> [length_scale=0.92] [--from-dir <folder> [--raw]]
then:  render.py <intro|arch>"""
import json, subprocess, sys, wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODEL = Path.home() / "scratch/memryoshka_demo/tts/en_US-ljspeech-high.onnx"
name = sys.argv[1]
rest = sys.argv[2:]
src_dir, raw = None, "--raw" in rest
rest = [r for r in rest if r != "--raw"]
tempo, tag = 1.0, ""
if "--tempo" in rest:  # pitch-preserving pace change of every clip, e.g. 0.86 = 14% slower
    i = rest.index("--tempo"); tempo = float(rest[i + 1]); rest = rest[:i] + rest[i + 2:]
if "--tag" in rest:    # writes build/<name><tag>_timing.json etc., so several versions can coexist
    i = rest.index("--tag"); tag = rest[i + 1]; rest = rest[:i] + rest[i + 2:]
gap = None
if "--gap" in rest:    # seconds of silence after each line (default 0.45)
    i = rest.index("--gap"); gap = float(rest[i + 1]); rest = rest[:i] + rest[i + 2:]
if "--from-dir" in rest:
    i = rest.index("--from-dir"); src_dir = Path(rest[i + 1]); rest = rest[:i] + rest[i + 2:]
scale = rest[0] if rest else "0.92"
LEAD, GAP = 0.5, 0.45
if gap is not None:
    GAP = gap
lines = json.load(open(ROOT / f"{name}_lines.json"))
build = ROOT / "build"; build.mkdir(exist_ok=True)
rate, chunks, timeline, t = None, [], [], LEAD
for i, ln in enumerate(lines):
    if ln.get("silent"):  # a scene without narration (the title slide)
        timeline.append({"id": ln["id"], "text": "", "start": round(t, 3), "end": round(t + ln.get("min", 3.0), 3),
                         "voice_start": round(t, 3), "voice_end": round(t, 3)})
        t += ln.get("min", 3.0)
        continue
    wav = build / f"{name}_{i:02d}.wav"
    if src_dir:  # a recording of this line: convert to 22,050 Hz mono, remove rumble and steady noise, trim silence
        found = sorted(src_dir.glob(ln["id"] + ".*"))
        if not found:
            sys.exit(f"missing recording for line '{ln['id']}' in {src_dir}")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(found[0]), "-ac", "1", "-ar", "22050",
                        "-af", ("" if raw else "highpass=f=80,afftdn=nf=-25,") +  # --raw: generated speech, no clean-up
                               (f"atempo={tempo}," if tempo != 1.0 else "") +
                               "silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
                               "silenceremove=start_periods=1:start_threshold=-45dB,areverse", "-sample_fmt", "s16", str(wav)], check=True)
    else:
        subprocess.run([str(Path(sys.executable).parent / "piper"), "-m", str(MODEL), "-f", str(wav), "--length_scale", scale,
                        "--sentence_silence", "0.3"], input=ln["text"].encode(), check=True, capture_output=True)
    with wave.open(str(wav)) as w:
        rate = rate or w.getframerate()
        frames = w.readframes(w.getnframes())
        dur = w.getnframes() / w.getframerate()
    scene = max(dur + GAP, ln.get("min", 0)) + ln.get("tail", 0)
    timeline.append({"id": ln["id"], "text": ln["text"], "start": round(t, 3), "end": round(t + scene, 3),
                     "voice_start": round(t, 3), "voice_end": round(t + dur, 3)})
    chunks.append((t, frames))
    t += scene
total = round(t, 3)
# assemble the narration track: silence, with each line placed at its start time (16-bit mono)
out = bytearray(int(total * rate) * 2)
for start, frames in chunks:
    o = int(start * rate) * 2
    out[o:o + len(frames)] = frames[:len(out) - o]
with wave.open(str(build / f"{name}{tag}_narration.wav"), "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(bytes(out))
json.dump({"name": name, "duration": total, "scenes": timeline}, open(build / f"{name}{tag}_timing.json", "w"), indent=1)

# captions as an .srt file for video editors: one sentence (or half of a long one) at a time, like the burned-in captions
import re
def caption_chunks(text):
    outc = []
    for sent in [x.strip() for x in (re.findall(r"[^.!?]+[.!?]+", text) or [text])]:
        if len(sent) <= 96 or ", " not in sent: outc.append(sent); continue
        commas = [mm.start() for mm in re.finditer(", ", sent)]
        mid = min(commas, key=lambda c: abs(c - len(sent) / 2))
        outc += [sent[:mid + 1], sent[mid + 2:]]
    return outc
def stamp(x):
    h, r = divmod(x, 3600); mi, se = divmod(r, 60)
    return f"{int(h):02d}:{int(mi):02d}:{int(se):02d},{int(round((se % 1) * 1000)) % 1000:03d}"
srt, k = [], 1
for sc in timeline:
    if not sc["text"]: continue
    cs = caption_chunks(sc["text"]); tot = sum(len(c) for c in cs); acc = 0
    for c in cs:
        a0 = sc["voice_start"] + (sc["voice_end"] - sc["voice_start"]) * acc / tot
        acc += len(c)
        a1 = sc["voice_start"] + (sc["voice_end"] - sc["voice_start"]) * acc / tot
        srt.append(f"{k}\n{stamp(a0)} --> {stamp(a1 + 0.15)}\n{c}\n"); k += 1
(build / f"{name}{tag}_captions.srt").write_text("\n".join(srt))
print(f"{name}: {total:.1f} s;", " | ".join(f"{s['id']} {s['end'] - s['start']:.1f}s" for s in timeline))
