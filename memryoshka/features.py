"""From video to writer inputs: frames at one per second, Qwen2.5-VL visual tokens, token importance and search tags.

For each frame the writer needs:
  - the visual tokens the language model would read (after Qwen2.5-VL's 2 x 2 patch merger, 3,584 numbers each),
    as 512 PCA coefficients (stored in float16, as in the paper's runs);
  - each token's importance: the attention it receives in the last full-attention layer of the vision encoder,
    softmax(q k^T x scale) per head, summed over queries, averaged over heads and over the 4 patches merged into it;
  - the frame's LongCLIP search tag.
"""
from __future__ import annotations

from dataclasses import dataclass
from fractions import Fraction

import numpy as np
import torch
from PIL import Image

from .models import RESIZE_HEIGHT


def sample_frames(video_path, fps: float = 1.0):
    """Yield (image, timestamp, requested_time) at fps frames per second, causally.

    At each requested time t = 0, 1/fps, 2/fps, ... the sample is the latest decoded frame whose presentation time is
    at most t; its own presentation time is the timestamp the memory stores. No frame after the end is invented.
    """
    import av
    with av.open(str(video_path)) as container:
        stream = container.streams.video[0]
        stream.codec_context.thread_count = 4
        stream.codec_context.thread_type = "AUTO"
        previous, previous_pts, index, last = None, None, 0, -float("inf")
        for frame in container.decode(stream):
            base = frame.time_base or stream.time_base
            pts = float(Fraction(frame.pts) * Fraction(base))
            if pts < last:
                raise ValueError("decoder returned decreasing timestamps")
            last = pts
            if pts < 0:
                continue
            target = index / fps
            while target < pts:
                if previous is not None:
                    yield previous.to_image().convert("RGB"), previous_pts, target
                index += 1
                target = index / fps
            previous, previous_pts = frame, pts
        target = index / fps
        if previous is not None and target <= previous_pts:
            yield previous.to_image().convert("RGB"), previous_pts, target


def resize(image: Image.Image, height: int = RESIZE_HEIGHT) -> Image.Image:
    image = image.convert("RGB")
    width = max(1, int(round(image.width * height / image.height)))
    return image.resize((width, height), Image.Resampling.BICUBIC)


@dataclass
class FrameFeatures:
    tokens: torch.Tensor        # (n, 3584) visual tokens, on the model's device
    attention: np.ndarray       # (n,) attention received in the last full-attention vision layer
    tag: np.ndarray             # (512,) LongCLIP unit tag
    grid: tuple                 # (1, height, width) in patches before merging


class FrameEncoder:
    """Runs the frozen Qwen2.5-VL vision encoder and LongCLIP on frames."""

    def __init__(self, reader, longclip):
        self.model, self.processor, self.longclip = reader.model, reader.processor, longclip
        self.text = self.processor.apply_chat_template(
            [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": "x"}]}],
            tokenize=False, add_generation_prompt=True)

    @property
    def visual(self):
        inner = getattr(self.model, "model", self.model)
        return getattr(inner, "visual", getattr(self.model, "visual", None))

    @torch.no_grad()
    def __call__(self, images) -> list[FrameFeatures]:
        images = [resize(im) for im in images]
        tags = self.longclip.image_tags(images)
        out = []
        for image, tag in zip(images, tags):
            tokens, attention, grid = self._visual(image)
            out.append(FrameFeatures(tokens=tokens, attention=attention, tag=tag, grid=grid))
        return out

    @torch.no_grad()
    def _visual(self, image):
        inputs = self.processor(text=[self.text], images=[image], return_tensors="pt")
        visual = self.visual
        param = next(visual.parameters())
        pixels = inputs["pixel_values"].to(device=param.device, dtype=param.dtype)
        grid_t = inputs["image_grid_thw"].to(param.device)
        grid = tuple(int(x) for x in grid_t[0].tolist())
        merge = int(visual.spatial_merge_size)
        unit = merge * merge
        attn = visual.blocks[list(visual.fullatt_block_indexes)[-1]].attn
        captured = []

        def capture(_module, args, kwargs):
            x = kwargs.get("hidden_states", args[0] if args else None)
            pe = kwargs.get("position_embeddings")
            if pe is None and len(args) >= 3:
                pe = args[2]
            captured.append((x, pe))

        handle = attn.register_forward_pre_hook(capture, with_kwargs=True)
        try:
            inner = getattr(self.model, "model", self.model)
            getter = getattr(inner, "get_image_features", None) or self.model.get_image_features
            merged = getter(pixels, grid_t)
        finally:
            handle.remove()
        merged = getattr(merged, "pooler_output", merged)
        if isinstance(merged, (list, tuple)):
            merged = merged[0]
        if merged.ndim == 3:
            merged = merged[0]
        x, (cos, sin) = captured[0]
        n = grid[0] * grid[1] * grid[2]
        # the vision encoder reorders patches into windows; undo that before computing full attention
        window_index = vision_window_index(visual, grid_t).to(x.device)
        permutation = (window_index[:, None] * unit + torch.arange(unit, device=x.device)[None, :]).reshape(-1)
        inverse = permutation.argsort()
        x, cos, sin = x[inverse], cos[inverse], sin[inverse]
        q, k, _ = attn.qkv(x).reshape(n, 3, attn.num_heads, -1).permute(1, 0, 2, 3).unbind(0)
        from transformers.models.qwen2_5_vl.modeling_qwen2_5_vl import apply_rotary_pos_emb_vision
        q, k = apply_rotary_pos_emb_vision(q, k, cos, sin)
        probabilities = torch.softmax(
            torch.bmm(q.transpose(0, 1).float(), k.transpose(0, 1).float().transpose(1, 2)) * attn.scaling, dim=-1)
        received = probabilities.sum(dim=1).mean(0).reshape(-1, unit).mean(1)
        return merged.detach(), received.float().cpu().numpy(), grid


def vision_window_index(visual, grid_t):
    """Order in which Qwen2.5-VL's vision encoder visits the merged patches (its window attention layout)."""
    try:
        from transformers.vision_utils import get_vision_window_index
    except ImportError:  # older transformers
        return visual.get_window_index(grid_t)[0]
    return get_vision_window_index(grid_t, spatial_merge_size=visual.spatial_merge_size,
                                   window_size=visual.window_size, patch_size=visual.patch_size)[0]


class Projector:
    """PCA projection on the model's device: (n, 3584) tokens -> (n, 512) float16 coefficients."""

    def __init__(self, code, device):
        self.mu = torch.from_numpy(code.mu).to(device)
        self.components = torch.from_numpy(code.components).to(device)

    @torch.no_grad()
    def __call__(self, tokens: torch.Tensor) -> np.ndarray:
        tokens = tokens.to(device=self.mu.device, dtype=torch.float32)
        return ((tokens - self.mu) @ self.components).to(torch.float16).cpu().numpy()
