"""Download the frozen models at the revisions used in the paper, and check them.

    python scripts/download_models.py [--skip-qwen]

Qwen2.5-VL-7B-Instruct (about 16.6 GB) goes to the Hugging Face cache. LongCLIP-B (599 MB) and the official LongCLIP
model code (github.com/beichenzbc/Long-CLIP, Apache-2.0) go to ~/.cache/memryoshka, or to MEMRYOSHKA_MODELS if set.
"""
import argparse
import hashlib
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from memryoshka import models  # noqa: E402


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while block := f.read(1 << 23):
            h.update(block)
    return h.hexdigest()


def fetch(url, path):
    if path.exists():
        return
    part = path.with_suffix(path.suffix + ".partial")
    with urllib.request.urlopen(url, timeout=120) as r, open(part, "wb") as f:
        while block := r.read(1 << 23):
            f.write(block)
    part.replace(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--skip-qwen", action="store_true")
    args = ap.parse_args()

    folder = models.longclip_dir()
    code = folder / "official-model"
    code.mkdir(parents=True, exist_ok=True)
    weights = folder / "longclip-B.pt"
    fetch(f"https://huggingface.co/{models.LONGCLIP_ID}/resolve/{models.LONGCLIP_REVISION}/longclip-B.pt", weights)
    if weights.stat().st_size != models.LONGCLIP_WEIGHTS_SIZE or sha256(weights) != models.LONGCLIP_WEIGHTS_SHA256:
        sys.exit(f"LongCLIP weights in {weights} do not match the expected checksum; delete the file and try again")
    for name, blob in models.LONGCLIP_CODE_FILES.items():
        target = code / name
        fetch(f"https://raw.githubusercontent.com/{models.LONGCLIP_CODE_REPO}/{models.LONGCLIP_CODE_COMMIT}/model/{name}",
              target)
        raw = target.read_bytes()
        if hashlib.sha1(f"blob {len(raw)}\0".encode() + raw).hexdigest() != blob:
            sys.exit(f"{target} does not match the expected file; delete it and try again")
    print(f"LongCLIP-B: {folder}")

    if not args.skip_qwen:
        from huggingface_hub import snapshot_download
        path = snapshot_download(models.QWEN_ID, revision=models.QWEN_REVISION)
        print(f"Qwen2.5-VL-7B-Instruct: {path}")


if __name__ == "__main__":
    main()
