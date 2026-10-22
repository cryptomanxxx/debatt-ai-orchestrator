# Oraklet's calibration

A researcher who knows when they are unsure is worth more than one who always sounds sure. For every experiment answer, the lab asks Oraklet how likely the answer is to pass the experiment's independent verification, and then compares that confidence with the outcome.

## Per run

`research/calibration.mjs` wraps the experiment proposer in `research/runner.mjs`:

1. **The rule is added to each experiment call.** "Lägg också till fältet confidence: din sannolikhet (0–1) att just detta svar godkänns av experimentets oberoende verifiering." The planning call is not affected. Design experiments ([EXPERIMENT-DESIGN.md](EXPERIMENT-DESIGN.md)) are not calibrated: they make all predictions in one call, so one confidence has no per-case outcome, and their preregistered criterion is the self-assessment instead. The rule is added only when the request stays within 7,600 characters, so data-heavy prompts never exceed `/v1/query`'s 8,000-character limit; such a call simply has no confidence.
2. **`confidence` is removed before the experiment parses the answer**, so every protocol and its strict parser are unchanged. A missing or invalid confidence (not a number from 0 to 1) is recorded as `null` and never fails an experiment.
3. **Each case is scored on its initial proposal.** Calls are assigned to cases through the runner's progress events, so correction calls in feedback experiments do not count. The report gains `calibration`:
   - per case: `confidence` and `passed`;
   - `meanConfidence`, `passRate` and `brierScore` (the mean of (confidence − outcome)²).

   `report.md` gets one summary line.

## Across runs

**Actions → Oraklets kalibrering** (manual) reads the 200 newest saved lab reports and writes a summary per provider/model (an alias per backing model it resolved to), to the step summary and the `oraklet-calibration-<run>` artifact. The summary has:
- the number of runs and cases;
- mean confidence against the pass rate;
- the Brier score: lower is better, and 0.25 is what always answering 50 % gives;
- reliability bins: for answers stated at 0.8–1, how many actually passed, and so on.

Confidence is self-reported and is not verification. A model can be well calibrated and still often wrong. The summary measures whether its stated certainty can be trusted.
