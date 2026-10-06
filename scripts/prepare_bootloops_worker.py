"""Copy unchanged pinned upstream bytes and shared core into the Worker bundle."""
import hashlib
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent.parent
EXPECTED = '091596dcda3f873118a48340c4c6787b3acd8f316780cd0787644a05876a1913'
source = ROOT / 'vendor/bootloops/thiele_gate.py'
if hashlib.sha256(source.read_bytes()).hexdigest() != EXPECTED:
    raise SystemExit('BootLoops source integrity failure')
target = ROOT / 'bootloops-worker/src'
target.mkdir(parents=True, exist_ok=True)
shutil.copyfile(source, target / 'thiele_gate.py')
shutil.copyfile(ROOT / 'scripts/bootloops_core.py', target / 'ratfit_core.py')
print('Prepared pinned BootLoops Python Worker sources')
