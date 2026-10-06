# Vendored BootLoops component

This directory contains the **unchanged** `tools/ratfit/thiele_gate.py` from
[BootLoops-ai/bootloops](https://github.com/BootLoops-ai/bootloops/blob/66b680ce742e654cfe86da4f072a69061fe182b1/tools/ratfit/thiele_gate.py).

- Upstream commit: `66b680ce742e654cfe86da4f072a69061fe182b1`
- SHA-256: `091596dcda3f873118a48340c4c6787b3acd8f316780cd0787644a05876a1913`
- License: MIT; upstream license reproduced in `LICENSE`.
- Copyright: 2026 Anthropic, PBC. Created by Matthew D. Schwartz; code written by Claude under his supervision.
- Reference: M. D. Schwartz, *BootLoops 1.0* (2026), https://www.bootloops.ai.

Ratfit is limited to this standard-library submodule.

The unchanged `tools/rankscreen/screen.py` and `tools/rankscreen/modp_rref.py`
from the same commit are bundled in `rankscreen/`. Their SHA-256 fingerprints
are recorded in `rankscreen/pins.json` and checked before each subprocess import.
Only the stdlib sparse backend with a fixed three-prime panel is exposed through
`scripts/rankscreen_bridge.py`, in GitHub Actions (Linux/fork). Dense/numpy,
exact/gmpy2 shim, CLI file loading and the rest of the package are not exposed.
Our acceptance tests cover positive/negative systems, prime disagreement and
bad-denominator replacement. This is verification of our bounded subset, not
a claim that the entire upstream battery ran.

Other Ratfit functions, wider BootLoops packages, Julia, FLINT and external
engines are not installed. The package inventory in `research/bootloops-inventory.json`
is derived from upstream `tools/BATTERIES.json` at this commit.
Our JSON bridge and TypeScript adapter live outside this directory. The bridge
checks these bytes before importing them; upgrades require a reviewed commit
and fingerprint update. Tests never rewrite upstream code.
