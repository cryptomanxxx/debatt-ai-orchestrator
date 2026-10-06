"""Manual fixed-fixture diagnostic calls; CPU readings stay in Cloudflare logs."""
from datetime import datetime, timezone
import json
import os
import urllib.error
import urllib.request

URL = 'https://debatt-ai-orchestrator.xx8031126.workers.dev/v1/diagnostics/bootloops'
STAGES = ['transport', 'json', 'validate', 'fit', 'full']
KEY = os.environ.get('ORCHESTRATOR_API_KEY', '')
if len(KEY) < 24:
    raise SystemExit('ORCHESTRATOR_API_KEY repository secret is missing')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


opener = urllib.request.build_opener(NoRedirect)


def request(stage, authenticated=True):
    headers = {'Content-Type': 'application/json',
               'User-Agent': 'Debatt-AI-BootLoops-Smoke/1.0 (GitHub Actions)'}
    if authenticated:
        headers['Authorization'] = 'Bearer ' + KEY
    req = urllib.request.Request(URL, data=json.dumps({'stage': stage}).encode(),
                                 headers=headers, method='POST')
    try:
        response = opener.open(req, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    except Exception:
        raise SystemExit('Diagnostic network request failed')
    with response:
        status = response.code
        raw = response.read(16385)
    if len(raw) > 16384:
        raise SystemExit('Diagnostic response too large')
    try:
        return status, json.loads(raw)
    except Exception:
        raise SystemExit('Diagnostic response was not JSON')


if request('full', authenticated=False)[0] != 401:
    raise SystemExit('Unauthenticated diagnostic was not rejected')
if request('unknown')[0] != 400:
    raise SystemExit('Unknown diagnostic stage was not rejected')

rows = []
# Reverse and rotate stage order to reduce a consistent warmup/order bias.
# Cloudflare can still schedule requests on different isolates/CPUs.
for round_number, order in enumerate([STAGES, list(reversed(STAGES)), STAGES[2:] + STAGES[:2]], 1):
    for stage in order:
        started = datetime.now(timezone.utc).isoformat(timespec='milliseconds')
        status, data = request(stage)
        if status != 200 or data != {'diagnostic': True, 'stage': stage, 'fixture': 'rational-v1'}:
            raise SystemExit('Diagnostic ' + stage + ' failed with HTTP ' + str(status))
        print(f'Round {round_number}: {stage}, HTTP 200, started {started}')
        rows.append(f'| {round_number} | {stage} | {started} |')
print('15 fixed-fixture calls passed. CPU time was NOT measured by this workflow.')
summary = os.environ.get('GITHUB_STEP_SUMMARY')
if summary:
    with open(summary, 'a') as f:
        f.write('BootLoops diagnostic calls passed. Read CPU time in debatt-ai-bootloops → Observability.\n\n')
        f.write('Stage paths: `/v1/diagnostics/bootloops/{stage}`. Same fixed body in every call.\n\n')
        f.write('| Round | Stage | Request started (UTC) |\n|---|---|---|\n' + '\n'.join(rows) + '\n\n')
        f.write('These are independent invocation totals, including runtime/transport overhead. Compare repeated readings; differences are estimates, not precise stage CPU times or free-plan certification.\n')
