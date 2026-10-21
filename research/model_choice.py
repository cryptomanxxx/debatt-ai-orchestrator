"""Parses the generated "provider / model" workflow dropdown (see model-menu.mjs)."""
import json
import re
from pathlib import Path

PROVIDERS = ("hip", "blablador")
# A trailing "(rekommenderad 9/10)" label marks the recommended entry and is ignored.
CHOICE = re.compile(r"^(hip|blablador) / (\S{1,200})(?: \(rekommenderad \d{1,6}/\d{1,6}\))?$")
SNAPSHOT = Path(__file__).resolve().parent / "model-catalog.json"


def parse_model_choice(value, explicit_model_id):
    """Returns (provider, model); model is None for the "alla" entry."""
    match = CHOICE.fullmatch(value or "")
    if not match:
        raise ValueError("Invalid model choice; run the model-menu refresh workflow first.")
    provider, model = match.groups()
    if model == "alla":
        return provider, None
    if not explicit_model_id(model):
        raise ValueError("Invalid model choice; aliases and non-chat models are not allowed.")
    return provider, model


def snapshot_models(provider, explicit_model_id, path=SNAPSHOT):
    """Explicit model IDs for "provider / alla", from the committed menu snapshot."""
    try:
        models = json.loads(Path(path).read_text(encoding="utf-8"))["providers"][provider]
    except (OSError, ValueError, KeyError, TypeError):
        raise ValueError("Model snapshot missing; run the model-menu refresh workflow first.") from None
    if not isinstance(models, list):
        raise ValueError("Model snapshot missing; run the model-menu refresh workflow first.")
    return [m for m in models if isinstance(m, str) and explicit_model_id(m)]
