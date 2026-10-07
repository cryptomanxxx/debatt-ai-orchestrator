-- Backend-only Data API access for the Problem Bank.
-- PostgreSQL grants are checked before RLS.
grant select, insert, update, delete
  on table public.research_problem
  to service_role;

grant select, insert, update, delete
  on table public.research_run
  to service_role;

-- Browser/user roles remain locked out.
revoke all
  on table public.research_problem, public.research_run
  from anon, authenticated;
