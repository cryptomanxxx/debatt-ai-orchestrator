# Vendored BootLoops component

This directory contains the **unchanged** `tools/ratfit/thiele_gate.py` from
[BootLoops-ai/bootloops](https://github.com/BootLoops-ai/bootloops/blob/66b680ce742e654cfe86da4f072a69061fe182b1/tools/ratfit/thiele_gate.py).

- Upstream commit: `66b680ce742e654cfe86da4f072a69061fe182b1`
- SHA-256: `091596dcda3f873118a48340c4c6787b3acd8f316780cd0787644a05876a1913`
- License: MIT; upstream license reproduced in `LICENSE`.
- Copyright: 2026 Anthropic, PBC. Created by Matthew D. Schwartz; code written by Claude under his supervision.
- Reference: M. D. Schwartz, *BootLoops 1.0* (2026), https://www.bootloops.ai.

Only this standard-library submodule is bundled. Other Ratfit functions and
the wider BootLoops toolkit, Julia, FLINT and external engines are not installed.
Our JSON bridge and TypeScript adapter live outside this directory. The bridge
checks these bytes before importing them; upgrades require a reviewed commit
and fingerprint update. Tests never rewrite upstream code.
