# Research Problem Bank v1

Problem Bank stores research targets separately from Research Loop execution state.

Kinds: `open`, `benchmark_hidden_solution`, `solved_training`, `verified_reference`, and `failed_attempt`.

## Hidden benchmark contract

The model-facing table `public.research_problem` never contains benchmark answers. Reference solutions live in `private.research_problem_reference`, and the migration revokes access from public API roles. Keep the `private` schema out of Supabase Data API exposed schemas.

The runner client uses an explicit safe-column projection and has no method for reading hidden references. A future verifier/reveal component must be a separately reviewed integration and must only reveal a reference after a run is committed/completed.

## Install

Run these migrations in the new orchestrator project's SQL Editor, in this order:

1. `supabase/migrations/20261007000000_research_problem_bank_v1.sql`
2. `supabase/migrations/20261007150000_research_run_database_completion_clock.sql`
3. `supabase/migrations/20261007181500_problem_bank_service_role_grants.sql`
4. `supabase/migrations/20261007193000_research_run_active_problem_guard.sql`

The base migration was renamed from `20261007_research_problem_bank_v1.sql` so that its version sorts before the same-day migrations that depend on it; its SQL is unchanged. Projects that applied it in SQL Editor need no action. If a project ever applied it with the Supabase CLI (`select version from supabase_migrations.schema_migrations` lists `20261007`), mark the rename once without rerunning any SQL:

```sh
supabase migration repair --status reverted 20261007
supabase migration repair --status applied 20261007000000
```

All four migrations are required. The service-role migration grants the backend `service_role` Data API table privileges while keeping `anon` and `authenticated` revoked. The final migration atomically rejects new runs unless the persisted Problem Bank row is still `active`.

Runtime configuration:
- `SUPABASE_URL` is non-secret and may be stored in Wrangler vars.
- `SUPABASE_SECRET_KEY` is a Cloudflare secret. Never commit it.

## Literature-linked proposals

The manual workflow **Oraklet proposes research problems** also reads the ten newest saved literature evidence reports (`literature_planner_run`). A research candidate whose theme matches a catalog experiment's research area (for example `arp-symbolic-regression` and the Ratfit experiments) becomes a review-only proposal for that experiment's canonical Problem Bank entry, with the supporting article IDs, the report and candidate IDs, and whether the entry is already registered. The workflow only reads; register a proposal with **problem-bank-create** after review. The catalog experiment is a bounded method test in the same area; it does not test the reported limitation or research gap.
