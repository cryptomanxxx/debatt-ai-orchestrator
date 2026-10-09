"""Internal-only Ratfit service: public and preview URLs are disabled."""
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit
from workers import Response, WorkerEntrypoint
from ratfit_core import compute, EXPECTED_SHA256
from ratfit_diagnostics import diagnose, STAGES

if hashlib.sha256(Path(__file__).with_name('thiele_gate.py').read_bytes()).hexdigest() != EXPECTED_SHA256:
    raise RuntimeError('BootLoops source integrity failure')
import thiele_gate


def reply(data, status):
    return Response(json.dumps(data), status=status,
                    headers={'Content-Type': 'application/json', 'Cache-Control': 'no-store'})


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        url = urlsplit(request.url)
        prefix = '/v1/diagnostics/bootloops/'
        stage = url.path[len(prefix):] if url.path.startswith(prefix) else None
        if request.method != 'POST' or (url.path != '/v1/ratfit' and stage not in STAGES) or url.query:
            return reply({'error': 'not_found'}, 404)
        content_type = request.headers.get('Content-Type') or ''
        if content_type.split(';')[0].strip() != 'application/json':
            return reply({'error': 'application_json_required'}, 415)
        reader = request.body.getReader() if request.body else None
        if reader is None:
            return reply({'error': 'invalid_json'}, 400)
        raw = bytearray()
        try:
            while True:
                chunk = await reader.read()
                if chunk.done:
                    break
                if len(raw) + chunk.value.byteLength > 16384:
                    # Return 413 even if cancelling the oversized request stream fails.
                    # The response must not depend on a successful stream cancellation.
                    try:
                        await reader.cancel()
                    except Exception:
                        pass
                    return reply({'error': 'request_too_large'}, 413)
                raw.extend(bytes(chunk.value.to_py()))
        except Exception:
            return reply({'error': 'invalid_body'}, 400)
        finally:
            reader.releaseLock()
        try:
            if stage is not None:
                return reply(diagnose(stage, raw, thiele_gate), 200)
            result = compute(json.loads(raw), tool=thiele_gate)
            return reply(result, 200 if result['accepted'] else 422)
        except (ValueError, TypeError, KeyError):
            return reply({'error': 'invalid_bootloops_input'}, 400)
        except Exception:
            return reply({'error': 'bootloops_execution_failed'}, 502)
