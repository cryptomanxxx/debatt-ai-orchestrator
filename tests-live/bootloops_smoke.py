"""Manual deployed trial: fixed Worker URL, no model calls or logged secrets."""
import json
import os
import urllib.error
import urllib.request

URL = 'https://debatt-ai-orchestrator.xx8031126.workers.dev/v1/query'
KEY = os.environ.get('ORCHESTRATOR_API_KEY', '')
if len(KEY) < 24:
    raise SystemExit('ORCHESTRATOR_API_KEY repository secret is missing')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


opener = urllib.request.build_opener(NoRedirect)
data = dict(banked=[['0','1/2'],['1','2/3'],['2','3/4'],['3','4/5'],['6','7/8'],['7','8/9']],
            holdout=[['4','5/6'],['5','6/7']])


def request(args, authenticated=True):
    headers = {'Content-Type': 'application/json',
               'User-Agent': 'Debatt-AI-BootLoops-Smoke/1.0 (GitHub Actions)'}
    if authenticated:
        headers['Authorization'] = 'Bearer ' + KEY
    req = urllib.request.Request(URL, data=json.dumps(dict(tool='bootloops_ratfit', input=args)).encode(),
                                 headers=headers, method='POST')
    try:
        response = opener.open(req, timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    except Exception:
        raise SystemExit('BootLoops network request failed')
    with response:
        status = response.code
        raw = response.read(16385)
    if len(raw) > 16384:
        raise SystemExit('BootLoops response too large')
    try:
        parsed = json.loads(raw)
    except Exception:
        raise SystemExit('BootLoops returned invalid JSON')
    return status, parsed


status, good = request(data)
if status != 200:
    raise SystemExit('BootLoops positive control failed with HTTP ' + str(status))
if (good.get('provider') != 'bootloops' or good.get('mock') is not False
        or good.get('toolResult', {}).get('checked') != 2
        or good.get('toolResult', {}).get('accepted') is not True
        or good.get('toolResult', {}).get('upstreamCommit') != '66b680ce742e654cfe86da4f072a69061fe182b1'
        or good.get('verification', {}).get('status') != 'passed'
        or good.get('verification', {}).get('scope') != 'exact_rational_holdout'):
    raise SystemExit('BootLoops returned unexpected evidence')
bad_data = dict(data, holdout=[['4','0'],['5','6/7']])
status, bad = request(bad_data)
if status != 422 or bad.get('verification', {}).get('status') != 'failed':
    raise SystemExit('BootLoops failed to reject the corrupted control')
status, _ = request(data, authenticated=False)
if status != 401:
    raise SystemExit('Unauthenticated request was not rejected')
print('BootLoops: 200, actual tool and two exact holdouts verified')
print('Corrupted holdout: 422, rejected')
print('Without API key: 401, rejected')
summary = os.environ.get('GITHUB_STEP_SUMMARY')
if summary:
    with open(summary, 'a') as f:
        f.write('BootLoops in Cloudflare: real tool passed; corrupted holdout rejected; authentication passed.\n')
