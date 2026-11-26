# Memryoshka videos: scripts (final, 20 Nov 2026)

There are two videos, both 1920 x 1080 at 30 fps with captions burned in. Every number matches the paper or the demo stream.

## 1. Intro, about 60 seconds (`memryoshka_intro.mp4`)

| Scene | Narration | Picture |
|---|---|---|
| title | (silent, about 4.6 s) | The dolls, "Memryoshka", the subtitle, four use cases (smart glasses, robots, audio and video, live video streams), and "Work done by" with the five institution logos. |
| watch | Glasses and robots will watch for hours, and we'll ask them about what they saw. | Open-film frames stream past; a clock runs to 47:52; a question bubble appears. |
| heavy | But for a vision-language model, one hour of video is six and a half gigabytes of tokens. | A frame is cut into its 252 tokens; counters climb to 920,000 tokens and 6.6 GB. |
| forget | Most memories cope by forgetting: they keep some frames in full and drop the rest. | A memory with four slots; old frames fall out. |
| nested | Memryoshka stores each token as a nested code, a shorter code inside a longer one, just like Russian Matryoshka dolls. | The dolls, then one token's 4,096-bit code shrinking to 512 bits (share of detail kept: 100%, 99%, 93%, 80%). |
| price | As memory fills, one price per bit decides what to shorten and what to drop. | A Tears of Steel frame: as the price rises, every token's patch first turns coarser (shorter codes), then the least useful tokens fade to dark (dropped); 120 of 252 tokens remain, on the face and robot arm. |
| stream | Here, forty-eight minutes of film stream into seven megabytes. Frames from start to finish stay in memory, at lower detail. At full precision, the same memory would hold three. | The real replay on the four films, with thumbnails and film names. |
| numbers | On six benchmarks it matches a memory that keeps everything, with about a thousand times less storage on hour-long videos, and beats existing memories by six to eight points. | Three numbers: about 1,000 times less storage (with how it breaks down in the demo), same accuracy, +6 to 8 points. |
| beyond | It also works for robots, and for audio and video together. | Two cards: 95% robot success with 256 KiB; 33.7% audio-visual accuracy with 7.2 MB. |
| end | No training needed. Memryoshka: fade, don't forget. | Logo, title and "Visit https://armenjeddi.github.io/memryoshka". |

## 2. How it works, about 60 seconds (`memryoshka_architecture.mp4`)

One diagram builds up step by step: the write path (frame, vision encoder, tokens with attention, LongCLIP tag, nested
code, memory with a price) and the read path (question, LongCLIP text encoder, matching, decoding, language model).
The narration is in `arch_lines.json`.

## Where the numbers come from

- 6.6 GB per hour: 3,600 frames x about 256 tokens x 3,584 numbers x 2 bytes (paper introduction).
- Demo stream (47 min 52 s): 1,653 of 2,872 frames kept (58%), 48 tokens each, 581 bits per token on average,
  7.0 MB; full precision fits 3 whole frames; every token at 16 bits would be 5.2 GB (about 740 times more).
- About 1,000 times less on hour-long videos: LVBench videos average 67.5 minutes, which is 7.4 GB of tokens against
  7.2 MB. For exactly one hour it is about 920 times; it grows with length because the memory size is fixed.
- Matches a memory that keeps everything: Table 1 six-benchmark averages, 59.7 vs 59.4, 63.5 vs 62.7, 64.8 vs 64.6.
- Six to eight points: Table 1 averages against CausalMem, +5.9, +7.9 and +8.0.
- Robot: 95% with 256 KiB vs 94% for the policy's own history (paper Figure 4a). Audio and video: 33.7% with 7.2 MB vs
  32.0% reported for the full input of about 1.1 GB (paper Figure 4b).
