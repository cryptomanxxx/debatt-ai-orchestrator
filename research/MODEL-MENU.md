# HIP/Blablador model menu

HIP and Blablador workflows offer **one dropdown** whose entries carry both provider and model, e.g. `hip / GLM-5.2-AWQ-INT4` or `blablador / Qwen3.8-27B`. You cannot pick a model under the wrong provider. GitHub Actions cannot load dropdown choices at dispatch time, so the choices are written into the workflow files.

## How the menu is refreshed

**Refresh HIP/Blablador model menu** (`discover-research-models.yml`) runs nightly at 03:17 UTC and on demand. It:

1. reads `GET /v1/research/models` from the Cloudflare Worker with `ORCHESTRATOR_API_KEY`;
2. keeps chat models only (`research/explicit-models.mjs`): explicit IDs, plus one Blablador alias per backing model (see below). Embedding, reranker, audio and image models are dropped;
3. rewrites only the lines between `# BEGIN/END GENERATED RESEARCH MODEL OPTIONS` in every workflow, the snapshot `research/model-catalog.json`, and the ranking files described below;
4. commits to `main` with a dedicated GitHub App token if anything changed.

If one provider's discovery fails, that provider keeps the models from the last snapshot, so an outage never empties a menu.

To use a model that appeared today: run the refresh workflow, reload the Actions page, then start the benchmark. Every runner still checks the selected model against the live catalog at start-up. A model removed since the last refresh is reported as `not_listed` and no inference request is sent for it.

A workflow opts in with a marker block on a `type: choice` input:

```yaml
        # BEGIN GENERATED RESEARCH MODEL OPTIONS providers=hip,blablador
        options:
          - "REFRESH_MODEL_MENU_FIRST"
        # END GENERATED RESEARCH MODEL OPTIONS
```

`providers=` lists the providers to include. Appending ` all` adds a `<provider> / alla` entry. In *HIP scientific benchmark*, `hip / alla` runs the nine standard models; in *Scientific benchmark v3* it runs every model of that provider in the snapshot (at most 12). Runners parse the choice with `research/model_choice.py`.

## Which model to use: recommendations

The refresh workflow also runs when *Scientific benchmark v3* or *HIP scientific benchmark* finishes on `main`. It downloads the result artifacts of the latest successful runs (artifacts live 30 days) and stores per-run tallies in `research/model-scores.json`, keyed by run ID so nothing is counted twice; the 40 newest runs are kept. `research/MODEL-RANKING.md` ranks every catalog model by correct answers / all attempts, so failed calls count against a model; ties go to more evidence, then lower median latency.

The best model per provider with at least five answers appears **first** in each menu as `hip / <model> (rekommenderad 9/10)` and is preselected. The plain `hip / <model>` entry stays in the list, so API callers such as Oraklet can keep sending stable values; runners accept both. To compare everything once, run *HIP scientific benchmark* with `hip / alla` and *Scientific benchmark v3* with `blablador / alla`.

Current menus: *Scientific benchmark v3 (HIP or Blablador)* and *HIP scientific benchmark*. Oraklet and other API callers must send an exact menu value; GitHub rejects anything else. They can read the valid IDs from `research/model-catalog.json`.

## One-time setup (repository owner)

1. **Create a GitHub App** under Settings → Developer settings → GitHub Apps, e.g. `debatt-ai-model-menu`.
   - Turn off the webhook.
   - Repository permissions: **Contents: Read and write** and **Workflows: Read and write**. Nothing else.
   - Install it on `debatt-ai-orchestrator` only.
2. **Add repository secrets:** `MODEL_MENU_APP_CLIENT_ID` (the app's Client ID) and `MODEL_MENU_APP_PRIVATE_KEY` (a generated private key, full PEM).
3. **Allow the app past the `main` protection:**
   - Ruleset: Settings → Rules → Rulesets → the ruleset for `main` → *Bypass list* → add the app (*Always allow*).
   - Classic branch protection: allow the app under *Allow specified actors to bypass required pull requests*.
4. **Remove `MODEL_MENU_WORKFLOW_TOKEN`.** The app replaces it.
5. **Run the refresh workflow once.** Until then, Blablador entries are missing and HIP shows the nine standard models from the seed snapshot.

The app token is created only after the menu actually changed, and it is scoped to Contents and Workflows. The generator cannot touch anything outside the marker blocks and the snapshot file.

## Blablador aliases

Blablador lists its main models under display names with spaces (e.g. `01 - GPT-OSS-120b - …`), which cannot be used as IDs, and exposes them through `alias-*` IDs. Its catalog gives each alias's backing model (`root`). An alias answers under that backing model's name, so the Worker accepts the reply only when its model is the alias's catalog root, or a catalog entry with that same root. Any other reply is still `benchmark_model_identity_mismatch`. The Worker returns that root as `resolved_model`, taken from the catalog and never from the upstream reply, and Scientific v3 stores it per result.

The menu keeps one alias per backing model (the longest, usually most descriptive name) and shows what it runs, e.g. `blablador / alias-fast = gpt-oss-120b`. The ` = …` part is a label; runners ignore it. `alias-default` and aliases without a usable root are left out, and the Worker refuses an alias whose live root is missing or a non-chat model. Scores are kept per alias *and* backing model (`alias@root`): when Blablador re-maps an alias, the next refresh shows the new model and the alias starts a fresh record instead of inheriting the old model's results.
