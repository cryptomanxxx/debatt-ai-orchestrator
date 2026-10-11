-- Supabase existing-project public-schema defaults can grant ALL on creation.
alter default privileges in schema public
  grant all on tables to anon,authenticated,service_role;
