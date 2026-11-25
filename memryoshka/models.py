"""Frozen models used by Memryoshka, pinned to the revisions used in the paper, and where they are kept."""
from __future__ import annotations

import os
from pathlib import Path

QWEN_ID = "Qwen/Qwen2.5-VL-7B-Instruct"
QWEN_REVISION = "cc594898137f460bfe9f0759e9844b3ce807cfb5"

LONGCLIP_ID = "BeichenZhang/LongCLIP-B"
LONGCLIP_REVISION = "107b6f178477e1bf8af8bfe565c13e691e2c356f"
LONGCLIP_WEIGHTS_SHA256 = "ca2face3716d60473a4e284e5be2cf0a1f3a4ad9954a6a651d878e814cc0c894"
LONGCLIP_WEIGHTS_SIZE = 599433439
# Official LongCLIP model code (github.com/beichenzbc/Long-CLIP, Apache-2.0) at a fixed commit, with git blob hashes.
LONGCLIP_CODE_REPO = "beichenzbc/Long-CLIP"
LONGCLIP_CODE_COMMIT = "3966af9ae9331666309a22128468b734db4672a7"
LONGCLIP_CODE_FILES = {
    "__init__.py": "1a8902d8a7ce19623f8537834b4fde73978b97d8",
    "longclip.py": "2a427f055560e3741da4db0515f4b184503a5269",
    "model_longclip.py": "9045ac614db11deb69521b67085d39355162d705",
    "simple_tokenizer.py": "0a66286b7d5019c6e221932a813768038f839c91",
    "bpe_simple_vocab_16e6.txt.gz": "7b5088a527f720063f044eb928eee315f63b2fc0",
}

# Frames are resized to 448 pixels high (keeping the aspect ratio) and the Qwen2.5-VL processor is fixed at 448 x 448
# pixels, about 256 visual tokens per frame.
RESIZE_HEIGHT = 448
QWEN_PIXELS = 448 * 448


def model_dir() -> Path:
    """Folder for LongCLIP (Qwen2.5-VL goes to the Hugging Face cache). Set MEMRYOSHKA_MODELS to change it."""
    return Path(os.environ.get("MEMRYOSHKA_MODELS", Path.home() / ".cache" / "memryoshka"))


def longclip_dir() -> Path:
    return Path(os.environ.get("MEMRYOSHKA_LONGCLIP", model_dir() / "longclip-B" / LONGCLIP_REVISION))


def qwen_path() -> str:
    """A local folder with Qwen2.5-VL-7B-Instruct, or the Hugging Face id (downloaded on first use)."""
    return os.environ.get("MEMRYOSHKA_QWEN", QWEN_ID)
