// TEMPORARY probe: early responses that leave the request body unread, followed by more requests.
const base = 'http://127.0.0.1:8788';
const input = { banked: [['0','1/2'],['1','2/3'],['2','3/4'],['3','4/5'],['6','7/8'],['7','8/9']], holdout: [['4','5/6'],['5','6/7']] };
const post = (path, type) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': type }, body: JSON.stringify(input) });
for (let i = 0; i < 120; i++) {
  try { if ((await post('/v1/ratfit', 'application/json')).status === 200) break; } catch {}
  await new Promise(r => setTimeout(r, 1000));
}
const counts = {};
const steps = [['/v1/ratfit', 'text/plain', 415], ['/other', 'application/json', 404], ['/v1/ratfit?x=1', 'application/json', 404], ['/v1/ratfit', 'application/json', 200]];
for (let round = 0; round < 600; round++) {
  for (const [path, type, expected] of steps) {
    const response = await post(path, type);
    const text = await response.text();
    const key = `${path} ${type} -> ${response.status}`;
    counts[key] = (counts[key] ?? 0) + 1;
    if (response.status !== expected) console.log(`round ${round}: ${key} body=${text.slice(0, 300)}`);
  }
}
console.log(JSON.stringify(counts, null, 1));
