# Research Problem Bank v1

Problem Bank stores research targets separately from Research Loop execution state.

Kinds: `open`, `benchmark_hidden_solution`, `solved_training`, `verified_reference`, and `failed_attempt`.

## Hidden benchmark contract

The model-facing table `public.research_problem` never contains benchmark answers. Reference solutions live in `private.research_problem_reference`, and the migration revokes access from public API roles. Keep the `private` schema out of Supabase Data API exposed schemas.

The runner client uses an explicit safe-column projection and has no method for reading hidden references. A future verifier/reveal component must be a separately reviewed integration and must only reveal a reference after a run is committed/completed.

## Install

Run `supabase/migrations/20261007_research_problem_bank_v1.sql` in the new orchestrator project's SQL Editor.

Runtime configuration:
- `SUPABASE_URL` is non-secret and may be stored in Wrangler vars.
- `SUPABASE_SECRET_KEY` is a Cloudflare secret. Never commit it.
