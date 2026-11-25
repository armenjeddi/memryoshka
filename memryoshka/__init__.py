"""Memryoshka: adaptive-fidelity video memory for streaming vision-language models."""
from .codec import NestedCode
from .readout import question_text, read
from .writer import DEFAULT_BUDGET, LENGTHS, Memory

__version__ = "0.1.0"

__all__ = ["NestedCode", "Memory", "DEFAULT_BUDGET", "LENGTHS", "read", "question_text", "Memryoshka"]


def __getattr__(name):
    # the model-loading pipeline needs torch and transformers; import it only when asked for
    if name == "Memryoshka":
        from .pipeline import Memryoshka
        return Memryoshka
    raise AttributeError(name)
