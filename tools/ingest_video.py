"""Extract the writer's inputs for one new video on a GPU, with the tuning harness's ingestion code unchanged:
Qwen2.5-VL-7B visual tokens projected on the paper's PCA basis, each token's attention, and one LongCLIP tag per frame,
at one frame per second.
usage: python tools/ingest_video.py <video file> <bench name> <video id>
output: ~/scratch/memryoshka_tuning/dump/<codec tag>/<bench name>/<video id>.pt (read by replay_log.py, frame_tokens.py)"""
import os
import sys

os.environ.setdefault("MH_PREFIX_SET", "pow2")
sys.path.insert(0, "/project/6101803/armen/research_projects/memryoshka_tuning/harness")
import mh  # noqa: E402
import dump_ingest  # noqa: E402

video, bench, vid = sys.argv[1:4]
reader = mh.make_reader()
codec, energies, tag = mh.load_codec(reader.device)
root = mh.WORK / "dump" / tag.replace(":", "_")
# one offline "question" makes the ingestion read the whole video (it stops after the last streaming question otherwise)
v = {"bench": bench, "video_id": vid, "video_path": video, "encode_seconds": 0,
     "questions": [{"question_id": "whole-video", "ask_time": None}]}
print(vid, dump_ingest.process(v, reader, codec, tag, root), flush=True)
