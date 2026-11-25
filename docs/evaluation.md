# Evaluation

`evaluate.py` answers multiple-choice questions about videos from a Memryoshka memory. Each video is streamed once at one
frame per second. A question with a time is answered from the memory as it was at that moment; a question without a
time is answered after the whole video. The memory never sees a question before it is asked.

```bash
python evaluate.py --questions data/lvbench.jsonl --videos /data/lvbench/videos --out results/lvbench_7mb.jsonl
```

## Question file

One JSON object per line:

```json
{"id": "lv667", "video": "_zrgbA3FMVE.mp4", "question": "Where are the three girls transported?",
 "options": ["On the spaceship", "On the car", "On the plane", "On the ship"], "answer": "C",
 "time": null, "benchmark": "lvbench", "task": "event understanding"}
```

| Field | Meaning |
| --- | --- |
| `video` | path of the video file, relative to `--videos` |
| `question`, `options` | the question and the option texts, without letters; options are shown to the reader as (A), (B), ... |
| `answer` | the correct letter |
| `time` | seconds into the video at which the question is asked, or `null` for questions asked after the video |
| `id`, `benchmark`, `task` | optional; used to resume a run and to group accuracies |

Questions on the same video share one stream, so put all of a video's questions in the same file. For streaming
benchmarks, give each question its time; the stream stops after the last question of a video.

## Benchmarks in the paper

The paper evaluates on the long-video benchmarks LVBench, the long splits of LongVideoBench, the long-video subset of
Video-MME (without subtitles) and TimeScope, and on the streaming benchmarks OVO-Bench (backward-tracing and real-time
tasks) and StreamingBench (real-time visual understanding). Download the videos and annotations from each benchmark's
official release and convert them to the format above. The benchmarks keep their own licenses.

## Settings

The main table matches the memory budget B to the readout budget L: B is the size of L visual tokens of Qwen2.5-VL-7B at
16 bits (3,584 numbers x 2 bytes per token).

| Readout L | Memory B | Command-line options |
| --- | --- | --- |
| 1,000 | 7.2 MB | `--readout 1000 --budget-mb 7.168` (default) |
| 2,000 | 14.3 MB | `--readout 2000 --budget-mb 14.336` |
| 4,000 | 28.7 MB | `--readout 4000 --budget-mb 28.672` |

`--recent 4` gives the "+ 4 recent frames" variant, which always reads the four newest stored frames first.

Fixed settings (as in the paper): frames at 1 fps, resized to 448 pixels high and given to Qwen2.5-VL at 448 x 448 pixels
(about 256 visual tokens per frame); PCA with 512 components and 8 bits per coefficient over +-3 standard deviations;
code lengths of 32 to 4,096 bits in powers of two; quality floor e0 = 0.5; 24 bits of metadata per stored token and
4,152 bits per stored frame; memory refitted to 90% of the budget; novelty against the previous 8 frames with a floor
of 0.05; LongCLIP-B/16 retrieval on square-padded frames; readout share rho = 0.8.

## Outputs

Each line of the `--out` file holds the question id, the gold and predicted letters, the option log-probabilities, how
many frames, tokens and positions were read, and the state of the memory when the question was asked. The accuracy per
benchmark is printed at the end.

## Re-running only the writer

`demo.py --save-inputs inputs.npz` saves what the vision encoder and LongCLIP produced for every frame (the PCA
coefficients in float16, the attention and the tags). `demo.py --inputs inputs.npz --budget-mb 1.8` then rebuilds the
memory at another size on a CPU, without the GPU (about 40 seconds for the 48-minute demo stream).
