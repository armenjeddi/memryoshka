"""LongCLIP-B/16 search tags for frames and questions.

Frames are padded to a square with CLIP's mean colour before LongCLIP's own 224 x 224 preprocessing, so the whole frame
is seen (no centre crop). Questions use LongCLIP's tokenizer with its 248-token context. Both embeddings are unit
vectors with 512 values. The official LongCLIP model code is loaded from the folder that scripts/download_models.py
fills.
"""
from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path

import numpy as np
import torch
from PIL import Image

from .models import longclip_dir

CLIP_MEAN = (0.48145466, 0.4578275, 0.40821073)
CONTEXT_LENGTH = 248


def _official(code_dir: Path):
    """Import the official longclip.py as a package module (it uses relative imports)."""
    package_name = "_memryoshka_longclip"
    module_name = package_name + ".longclip"
    if module_name in sys.modules:
        return sys.modules[module_name]
    package = types.ModuleType(package_name)
    package.__path__ = [str(code_dir)]
    sys.modules[package_name] = package
    path = code_dir / "longclip.py"
    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    source = path.read_text().replace("from pkg_resources import packaging", "import packaging")
    exec(compile(source, str(path), "exec"), module.__dict__)
    return module


def letterbox(image: Image.Image) -> Image.Image:
    """Pad to a square with CLIP's mean colour, keeping the frame centred."""
    image = image.convert("RGB")
    w, h = image.size
    side = max(w, h)
    canvas = Image.new("RGB", (side, side), tuple(int(round(255 * m)) for m in CLIP_MEAN))
    canvas.paste(image, ((side - w) // 2, (side - h) // 2))
    return canvas


class LongCLIP:
    def __init__(self, folder: str | Path | None = None, device: str | torch.device = "cuda"):
        folder = Path(folder) if folder else longclip_dir()
        weights, code = folder / "longclip-B.pt", folder / "official-model"
        if not weights.exists() or not code.exists():
            raise FileNotFoundError(f"LongCLIP not found in {folder}; run scripts/download_models.py")
        self.lib = _official(code)
        model, preprocess = self.lib.load(str(weights), device="cpu")
        self.model = model.float().to(device).eval()
        for p in self.model.parameters():
            p.requires_grad_(False)
        self.preprocess = preprocess
        self.device = next(self.model.parameters()).device

    @staticmethod
    def _unit(value: torch.Tensor) -> np.ndarray:
        value = value.float()
        return (value / value.norm(dim=-1, keepdim=True)).cpu().numpy().astype(np.float32)

    @torch.no_grad()
    def image_tags(self, images) -> np.ndarray:
        """(n, 512) unit tags for a batch of frames (the paper's runs used batches of up to 64 frames)."""
        pixels = torch.stack([self.preprocess(letterbox(im)) for im in images]).to(self.device)
        return self._unit(self.model.encode_image(pixels))

    @torch.no_grad()
    def text_tag(self, text: str) -> np.ndarray:
        """(512,) unit tag for a question (newlines become spaces; long text is truncated to 248 tokens)."""
        tokens = self.lib.tokenize([text.replace("\n", " ")], context_length=CONTEXT_LENGTH, truncate=True)
        return self._unit(self.model.encode_text(tokens.to(self.device)))[0]
