"""Parses the generated "provider / model" workflow dropdown (see model-menu.mjs)."""
import re

PROVIDERS = ("hip", "blablador")
CHOICE = re.compile(r"^(hip|blablador) / (\S{1,200})$")


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
