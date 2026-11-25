"""The frozen reader, Qwen2.5-VL-7B: decoded tokens back in their places, then a multiple-choice answer.

Each chosen frame becomes its timestamp text, the vision-start token, its decoded tokens in grid order and the
vision-end token. A token keeps the position ids of its original grid cell (time, row, column), and the position counter
moves on by the full frame size, so tokens that were dropped leave gaps. The answer is the option letter with the
highest log-probability as the first answer token.
"""
from __future__ import annotations

import numpy as np
import torch

from .models import QWEN_PIXELS, QWEN_REVISION, qwen_path
from .readout import timestamp_text

INTRO = "These are frames of a video.\n"
SUFFIX = "Answer with the option's letter from the given choices directly."


class Reader:
    def __init__(self, model_path: str | None = None, *, revision: str | None = QWEN_REVISION, device: str = "cuda",
                 dtype: torch.dtype = torch.bfloat16, attn_implementation: str = "sdpa"):
        from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration
        model_path = model_path or qwen_path()
        revision = revision if not str(model_path).startswith("/") else None
        self.processor = AutoProcessor.from_pretrained(model_path, revision=revision, min_pixels=QWEN_PIXELS,
                                                       max_pixels=QWEN_PIXELS)
        self.model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            model_path, revision=revision, dtype=dtype, attn_implementation=attn_implementation).to(device).eval()
        for p in self.model.parameters():
            p.requires_grad_(False)
        self.tokenizer = self.processor.tokenizer
        self.embedding = self.model.get_input_embeddings()
        self.device = self.embedding.weight.device
        self.dtype = self.embedding.weight.dtype
        text = self.processor.apply_chat_template(
            [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": "x"}]}],
            tokenize=False, add_generation_prompt=True)
        self.header = text.split("<|vision_start|>", 1)[0] + INTRO
        self.vision_start = self.single_token("<|vision_start|>")
        self.vision_end = self.single_token("<|vision_end|>")

    def ids(self, text: str) -> list[int]:
        return list(self.tokenizer.encode(text, add_special_tokens=False))

    def single_token(self, text: str) -> int:
        ids = self.ids(text)
        if len(ids) != 1:
            raise ValueError(f"{text!r} is not one token")
        return ids[0]

    # ------------------------------------------------------------------ decoding stored tokens
    @torch.no_grad()
    def decode(self, code, chosen):
        """[(frame, token indices)] in reading order -> [(timestamp, grid, tokens, positions)] for build()."""
        codes = [frame.codes[j] for frame, take in chosen for j in take]
        bits = [int(frame.bits[j]) for frame, take in chosen for j in take]
        if not codes:
            return []
        coefficients = torch.from_numpy(code.decode_coefficients(codes, bits)).to(self.device)
        mu = torch.from_numpy(code.mu).to(self.device)
        components = torch.from_numpy(code.components).to(self.device)
        tokens = mu + coefficients @ components.T
        out, at = [], 0
        for frame, take in chosen:
            positions = torch.as_tensor([int(frame.positions[j]) for j in take], dtype=torch.long, device=self.device)
            out.append((float(frame.timestamp), tuple(frame.grid), tokens[at:at + len(take)], positions))
            at += len(take)
        return out

    # ------------------------------------------------------------------ building the input
    def build(self, frames, prompt: str) -> dict:
        embeddings, position_chunks, cursor = [], [], 0

        def add_ids(ids):
            nonlocal cursor
            ids = torch.as_tensor(ids, dtype=torch.long, device=self.device)
            embeddings.append(self.embedding(ids)[None])
            positions = torch.arange(cursor, cursor + ids.numel(), device=self.device)
            position_chunks.append(positions[None, None, :].expand(3, 1, -1))
            cursor += ids.numel()

        add_ids(self.ids(self.header))
        for timestamp, grid, tokens, positions in sorted(frames, key=lambda f: f[0]):
            gh, gw = grid[1] // 2, grid[2] // 2
            order = positions.argsort()
            positions, tokens = positions[order], tokens.to(device=self.device, dtype=self.dtype)[order]
            add_ids(self.ids(timestamp_text(timestamp)))
            add_ids([self.vision_start])
            embeddings.append(tokens[None])
            grid_ids = torch.stack((torch.zeros_like(positions), positions // gw, positions % gw))
            position_chunks.append(grid_ids[:, None, :] + cursor)
            cursor += max(gh, gw)
            add_ids([self.vision_end])
        add_ids(self.ids("\n" + prompt + "\n" + SUFFIX + "<|im_end|>\n<|im_start|>assistant\n"))
        embeds = torch.cat(embeddings, dim=1)
        return {"inputs_embeds": embeds, "position_ids": torch.cat(position_chunks, dim=2),
                "attention_mask": torch.ones(embeds.shape[:2], dtype=torch.long, device=self.device)}

    @torch.no_grad()
    def answer(self, frames, question: str, options) -> dict:
        """Multiple choice: the option letter with the highest log-probability."""
        from .readout import question_text
        inputs = self.build(frames, question_text(question, options))
        result = self.model(**inputs, use_cache=False, logits_to_keep=1, return_dict=True)
        letters = [chr(65 + i) for i in range(len(options))]
        ids = [self.single_token(x) for x in letters]
        logp = result.logits[0, -1, ids].float().log_softmax(-1).cpu().numpy()
        return {"answer": letters[int(np.argmax(logp))], "logp": [round(float(x), 5) for x in logp],
                "input_positions": int(inputs["inputs_embeds"].shape[1])}
