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
        import re
        code = str(error)
        if not re.fullmatch(r"[a-z0-9_]+", code):
            code = "router_selection_failed"
        known = {"key_not_configured", "not_listed", "invalid_api_key", "upstream_timeout",
                 "upstream_transport_error", "invalid_upstream_json", "invalid_model_discovery",
                 "oversized_response"}
        issues = []
        for item in getattr(error, "issues", [])[:12]:
            if not isinstance(item, dict):
                continue
            provider, reason = item.get("provider"), item.get("error")
            if provider not in PROVIDERS or not isinstance(reason, str):
                continue
            if reason not in known and not re.fullmatch(r"http_[1-5][0-9]{2}", reason):
                continue
            safe = {"provider": provider, "error": reason}
            if item.get("model") in PROVIDERS[provider]["models"]:
                safe["model"] = item["model"]
            issues.append(safe)
        print(json.dumps({"status": "failed", "error": code, "issues": issues}))
        raise SystemExit(1) from None
    # Safe explicit selection only; no API keys, input texts or secret-bearing URLs.
    print(json.dumps({"provider": selection["provider"], "model": selection["model"],
                      "reason": selection["reason"], "issues": selection["discovery_issues"]}))

if __name__ == "__main__":
    main()
