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

Annihilator and Mixalot are also limited to the unchanged modules below, from
the same upstream commit. `research/toolchain.json` records SHA-256 fingerprints
checked before import; the Git blob IDs match the original upstream files.

| Local file | Original upstream path | Git blob |
| --- | --- | --- |
| annihilator/annihilator.py | tools/annihilator/annihilator.py | 546c32e0cb2eebc94ba9bdfe90425f89f3b5ad9b |
| mixalot/frozen_comp_v1.py | tools/mixalot/mixalot/vendor/blend/frozen_comp_v1.py | db11f359e0bcfdfc3de4b94d92706b4f1506e465 |
| mixalot/frozen_comp_blind.py | tools/mixalot/mixalot/vendor/blend/frozen_comp_blind.py | ca7b8cd17f1bc3e5dce96eaeb1288af295140ac9 |

Annihilator exposes constant-coefficient recurrence reconstruction of order at
most two, with two small fixed primes, exact rational reconstruction and external
holdout checks. Its built-in core selftest was also run unchanged (dimensions
2–5, all PASS); this does not verify the optional Ore/factor/eigenring wings.
Mixalot exposes frozen-component evidence with two fixed categorical signatures
and fixed Dirichlet weights, using both independent upstream derivations.
Neither integration installs the whole upstream package or its optional engines.
They retain the root MIT license and copyright attribution above.
Statsmodels and numerical dependencies are installed separately from PyPI under
the version lock in `research/requirements.lock`; Statsmodels uses BSD-3-Clause.
Our science bridge lives outside the vendored directory.

Other Ratfit functions, wider BootLoops packages, Julia, FLINT and external
engines are not installed. The package inventory in `research/bootloops-inventory.json`
is derived from upstream `tools/BATTERIES.json` at this commit.
Our JSON bridge and TypeScript adapter live outside this directory. The bridge
checks these bytes before importing them; upgrades require a reviewed commit
and fingerprint update. Tests never rewrite upstream code.
