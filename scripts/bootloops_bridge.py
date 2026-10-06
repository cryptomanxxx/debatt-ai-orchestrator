"""Restricted Node subprocess transport for the shared BootLoops core."""
import json
import sys
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location('bootloops_core', Path(__file__).with_name('bootloops_core.py'))
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)
compute = core.compute

if __name__ == '__main__':
    try:
        # Linux/Unix resource caps supplement the parent process wall timeout.
        import resource
        resource.setrlimit(resource.RLIMIT_CPU, (4, 4))
        resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
        raw = sys.stdin.buffer.read(16385)
        if len(raw) > 16384:
            raise ValueError('Input too large')
        print(json.dumps(compute(json.loads(raw))))
    except Exception:
        # Do not expose input values, filesystem paths or upstream diagnostics.
        print('BootLoops bridge failed', file=sys.stderr)
        sys.exit(1)
