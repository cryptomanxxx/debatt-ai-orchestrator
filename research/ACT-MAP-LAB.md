# ACT-MAP in Oraklet's lab and the VEM-Sci register

`act-map-transfer` is a catalog experiment in **Oraklets forskningslabb**. The daily planner can choose it on its own, and it can also be run manually. Professor Oraklet himself is the proposer: the lab's locked model, which may be a benchmark-ranked HIP/Blablador model for the `causal` domain.

The [ACT-MAP pilot](ACT-MAP-ACCL-VEM-PILOT.md) built the benchmark and the evidence gate, but its proposer is a deterministic enumeration of every possible mapping, not a model. This experiment keeps that gate as the verifier and asks whether Oraklet can reason his way to the same answers.

## The task

There is a known source mechanism, `s_1 = a·s_0` and `s_2 = b·s_1 + c·s_0`, with its coefficients shown to Oraklet. There is also an unknown target system of three variables and three interventions, all with random names. An intervention sets one target variable to a value and Oraklet sees all three target variables. The system is noise-free and all variables are 0 without an intervention.

| Case | Level | What is unknown | Allowed decisions |
| --- | --- | --- | --- |
| 1 | 2 | Which target variable plays which source role. The intervention targets are given. | `full`, `none` |
| 2 | 3 | The variable roles and which variable each intervention sets. | `full`, `none` |
| 3 | 4 | As level 3. The truth is seeded: either only `s_0 → s_1` carries over (`partial`) or nothing does (`none`). | `full`, `partial`, `none` |

Each case takes two model calls:

1. **Design.** Oraklet chooses 1–3 interventions, each with the value 1, −1 or 2.
2. **Inference.** The lab runs the interventions with its private oracle and shows the outcomes. Oraklet then states a decision. For `full` or `partial` he also names which target variable is `s_0`, `s_1` and `s_2`, and which variable each intervention sets.

Three cases use six calls. With the planning call that is the lab's budget of seven. An unreadable answer fails its case with a fixed code; no format correction is attempted. An answer cut off at the lab's token limit (`model_output_truncated`) counts the same way, as `design:truncated` or `inference:truncated`: no answer arrived within the budget, so the case fails without a claim and the run goes on. Only the inference call states a confidence, so calibration scores the claim, not the design.

## Verification

The fixture (the shown task plus the hidden truth) is hashed before any model call. The lab sends the fixture, Oraklet's claim and the discovery record to `research/act_map_benchmark.py --gate`, which does the following:

- rechecks the commitment;
- replays every intervention;
- applies the gate. Coverage of the root and the mediator is required, at least two different interventions are required, and the discovery outcomes must fit. The claim must then hold for the held-out intervention sizes −2 and 3.
- runs the enumeration baseline (`active` strategy) on the same fixture.

A separate Node implementation recomputes the gate decision, and the case is only scored when both agree.

**Pass rule.** A case passes when the decision is right.
- For `full` or `partial`, the gate must also certify the claim, and the correspondence must match the hidden truth.
- `none` passes only when nothing transfers.

The report shows Oraklet against the baseline per case, and counts falsely certified claims.

## VEM-Sci register

Every answer Oraklet gives in the lab, in every experiment, is a claim with the transitions `proposed → under_test → provisionally_supported | rejected | unresolved`. The runner derives the records from the verified cases and saves them in the report (`rapport.vem` in `oraklet_experiment`). A model answer never sets its own status.

- **ACT-MAP:** the gate decides the status. Abstaining (`none`) is recorded as an unresolved abstention, never as accepted knowledge. A case without a readable answer, for example one cut off at the token limit, is recorded as `no_answer` with its reason and status unresolved. It makes no statement, but the memory shows where Oraklet fails to answer.
- **Other experiments:** a case that passed its independent verifier is provisionally supported, and a case that failed it is rejected. A case without independent verification is unresolved. A verified first answer that was then corrected (Ratfit feedback) is a claim of its own. Each claim is bound to a hash of the whole verified case, so the verifier's results count, whichever field they are stored in.

### The planner uses the register

Oraklet plans with his memory. Before the daily lab (`EXPERIMENT=auto`) chooses an experiment, it reads the register and gives the planner `knowledge`: for each automatic experiment with claims, `[provisionally supported, rejected, unresolved]`.

- **Priority.** The lab, not the model, orders the entries by learning priority `(rejected + unresolved + 1) / (claims + 2)`. An experiment without claims scores 0.5. Claims that did not hold raise the score, and repeated support lowers it.
- **Instruction.** The planner is asked to prefer experiments whose claims were rejected or are unresolved, or where evidence is missing, and to say in `reason` what it wants to learn.
- **Fit.** If the request would exceed the planner limit, entries beyond the five highest priorities are dropped before open problems and ranked models. The planner is then told how many entries were left out (`knowledgeOmitted`), so a missing entry is never read as "no claims". `plan.knowledge.shown` records how many entries the planner saw and whether the chosen experiment's entry was among them.
- **Recorded choice.** The choice is committed with the plan as `plan.knowledge`, before any experiment call. It holds the chosen experiment's claims, its learning priority and its rank among the offered experiments; rank 1 means nothing had a higher priority. The report shows the same line ("Kunskapsminne: …"), so it can be measured whether Oraklet steers by what he has learned.
- **Outage.** If the register cannot be read, the planner chooses without it, and the plan records `unavailable`.

The daily literature report in [`ai-bus/`](../ai-bus/README.md) shows the register per experiment with its learning priority.

After each lab run, the step **Uppdatera Oraklets VEM-Sci-register** (`node research/vem-sci.mjs`) reads the register from the latest 200 saved runs that carry one. It counts the claims per experiment and status and writes the result to the step summary and the artifact. A read failure is reported and never fails the run. Runs saved before this change have no register entry.

"Provisionally supported" means: within this tested case and its verifier. It is never established science.

## Limitations

- The mechanisms are synthetic, linear and noise-free, with three variables. Correspondence is a permutation of three labels.
- The enumeration baseline solves essentially every case (30/30 in the pilot). The experiment therefore measures whether a model can reason out what a small enumeration finds, not a new capability.
- The held-out sizes are in the same linear family. That is a methodological gate, not independent real-world evidence.
- A model with access to this repository could reconstruct the generator. The truth is deterministic from the seed, not cryptographically blinded.
- The DeepRAP novelty review (decision HOLD / NO-SUBMIT) still applies. Autonomous causal analogy with active validation has prior art (AERA/OpenAERA), and no novelty is claimed.

## Next steps

- Harder fixtures: more variables, noise, nonlinear and partial motifs that are really held out, and observational data the model must use.
- Let the register say why a claim failed, for example which ACT-MAP level or which kind of mistake, so that the planner can target the weakness itself and not only the experiment.
- A bare-question arm for ACT-MAP, comparable to the [bare baseline](BARE-BASELINE.md).
