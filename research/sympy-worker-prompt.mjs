// Only adapts the already-fixed quadratic research protocol to the Worker's
// single-string prompt. Never changes the verified cases, oracle or parser.
export function sympyWorkerPrompt(messages) {
  if (!Array.isArray(messages) || messages.length !== 2 ||
      messages[0]?.role !== 'system' || messages[1]?.role !== 'user' ||
      typeof messages[1].content !== 'string') throw Error('invalid_sympy_messages');
  let parsed;
  try { parsed=JSON.parse(messages[1].content); } catch { throw Error('invalid_sympy_messages'); }
  const coefficients=parsed?.coefficients;
  if (!Array.isArray(coefficients) || coefficients.length !== 3 ||
      !coefficients.every(x=>typeof x==='string' && /^-?(0|[1-9][0-9]{0,4})$/.test(x))) {
    throw Error('invalid_sympy_messages');
  }
  // Present the equation and full strict output contract in a single prompt;
  // provider models may not preserve instruction hierarchy after role flattening.
  return [
    'Du är Professor Oraklet. Lös ekvationen a*x^2+b*x+c=0 över de reella talen.',
    'Koefficienter [a,b,c]: '+JSON.stringify(coefficients)+'.',
    'Svara med EXAKT ett giltigt JSON-objekt utan kodblock, markdown, inledning eller eftertext.',
    'JSON måste ha exakt tre nycklar: "method", "roots", "reason".',
    'method ska vara strängen "sympy".',
    'roots ska vara en array med ALLA distinkta reella rötter i stigande ordning.',
    'Varje rot måste vara en kanonisk sträng: heltal som "-2" eller förkortat bråk som "1/2".',
    'Vid dubbelrot: bara en rot. Utan reella rötter: tom array [].',
    'reason ska vara en kort svensk motivering (max 800 tecken).',
    'Exempel på format, INTE lösningen: {"method":"sympy","roots":["-2","1/2"],"reason":"Kontroll med diskriminanten."}',
    'Beräkna svaret för de angivna koefficienterna och returnera endast JSON.'
  ].join('\\n');
}
