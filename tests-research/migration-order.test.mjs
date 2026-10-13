import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { migrationOrder } from '../scripts/test-migrations.mjs';

test('short date-only versions sort before later timestamps on the same day', () => {
  assert.deepEqual(migrationOrder(['20261007150000_b.sql', '20261007_a.sql', '20261006120000_c.sql', 'README.md']),
    ['20261006120000_c.sql', '20261007_a.sql', '20261007150000_b.sql']);
});

test('duplicate versions and unversioned migrations are rejected', () => {
  assert.throws(() => migrationOrder(['20261007_a.sql', '20261007000000_b.sql']), /Duplicate migration version/);
  assert.throws(() => migrationOrder(['schema.sql']), /without version prefix/);
});

test('repository migrations start with the Problem Bank base schema', () => {
  assert.equal(migrationOrder(readdirSync('supabase/migrations'))[0], '20261007_research_problem_bank_v1.sql');
});
