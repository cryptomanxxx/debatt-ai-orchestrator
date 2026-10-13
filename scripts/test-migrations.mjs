// Applies every migration in supabase/migrations in version order against PGHOST/PGDATABASE,
// running SQL fixtures and assertions after the migration they depend on.
// New migrations are applied automatically; only their tests need an entry below.
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const MIGRATIONS = 'supabase/migrations';
const TESTS = 'tests-literature-sql';
const REAPPLY = Symbol('reapply');

// Files run after the named migration, in order. REAPPLY runs that migration again to check idempotency.
const AFTER = {
  '20261007193000_research_run_active_problem_guard.sql': ['problem-bank.sql'],
  '20261011131500_literature_database.sql': ['upgrade-fixture.sql'],
  '20261011140000_literature_publication_backfill.sql': ['upgrade-assertions.sql'],
  '20261011150500_literature_publication_precedence.sql': ['planner-default-acls.sql'],
  '20261011180000_literature_planner_reports.sql': ['catalog.sql', 'strict-dates.sql',
    'publication-precedence.sql', 'planner-reports.sql', 'planner-upgrade-fixture.sql'],
  '20261011183000_literature_planner_privileges.sql': [REAPPLY, 'planner-upgrade-assertions.sql',
    'planner-default-acls.sql'],
  '20261012160000_literature_abstract_archive.sql': ['abstract-archive.sql'],
  '20261012183000_literature_evidence_registry.sql': ['evidence-registry.sql'],
  '20261012200000_literature_follow_up.sql': ['follow-up.sql'],
  '20261013000000_research_dashboard.sql': ['research-dashboard.sql', 'planner-reports.sql']
};

// Supabase versions are the digits before the first underscore. Pad short versions such as
// 20261007 so they sort before later timestamps on the same day, as the Problem Bank guide requires.
export function migrationOrder(files) {
  const entries = files.filter(f => f.endsWith('.sql')).map(name => {
    const match = /^(\d{8,14})_/.exec(name);
    if (!match) throw new Error(`Migration without version prefix: ${name}`);
    return { name, version: match[1].padEnd(14, '0') };
  });
  const seen = new Map();
  for (const { name, version } of entries) {
    if (seen.has(version)) throw new Error(`Duplicate migration version ${version}: ${seen.get(version)}, ${name}`);
    seen.set(version, name);
  }
  return entries.sort((a, b) => a.version.localeCompare(b.version)).map(e => e.name);
}

function psql(file) {
  console.log(`psql -f ${file}`);
  execFileSync('psql', ['-q', '-v', 'ON_ERROR_STOP=1', '-f', file], { stdio: 'inherit' });
}

function main() {
  const migrations = migrationOrder(readdirSync(MIGRATIONS));
  const unknown = Object.keys(AFTER).filter(name => !migrations.includes(name));
  if (unknown.length) throw new Error(`Test hooks for missing migrations: ${unknown.join(', ')}`);
  const referenced = new Set(Object.values(AFTER).flat());
  const orphaned = readdirSync(TESTS).filter(f => f.endsWith('.sql') && !referenced.has(f));
  if (orphaned.length) throw new Error(`SQL tests not run by any migration hook: ${orphaned.join(', ')}`);
  for (const migration of migrations) {
    psql(`${MIGRATIONS}/${migration}`);
    for (const step of AFTER[migration] ?? [])
      psql(step === REAPPLY ? `${MIGRATIONS}/${migration}` : `${TESTS}/${step}`);
  }
  console.log(`Applied ${migrations.length} migrations.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
