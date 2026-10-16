#!/usr/bin/env python3
"""Select one allowlisted research model without inference or credential output."""
import json
import os
from scientific_model_router import PROVIDERS, RouterError, choose_model

def main():
    keys = {entry["secret"]: os.getenv(entry["secret"], "") for entry in PROVIDERS.values()}
    try:
        selection = choose_model("reasoning", keys, os.getenv("ROUTER_PROVIDER", "auto"))
    except (RouterError, ValueError) as error:
        print("router_selection_failed", file=__import__("sys").stderr)
        raise SystemExit(1) from None
    # Safe explicit selection only; no API keys, input texts or secret-bearing URLs.
    print(json.dumps({"provider": selection["provider"], "model": selection["model"],
                      "reason": selection["reason"], "issues": selection["discovery_issues"]}))

if __name__ == "__main__":
    main()
