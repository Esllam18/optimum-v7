import fs from 'node:fs';
import assert from 'node:assert/strict';

const people = fs.readFileSync(new URL('../src/v7/pages/PeoplePage.js', import.meta.url), 'utf8');
const invite = fs.readFileSync(new URL('../src/v7/components/MemberInviteSheet.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260809231816_v7_people_directory_security_contract.sql', import.meta.url), 'utf8');
const legacy = fs.readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8');

assert.match(people, /member_directory_query/);
assert.doesNotMatch(people, /api\.select\('company_memberships'/);
assert.doesNotMatch(people, /api\.select\('profiles'/);
assert.doesNotMatch(people, /location\.assign\('\/#\/team'\)/);
assert.match(people, /p_limit:\s*PAGE_SIZE/);
assert.match(people, /p_offset:\s*offset/);
assert.match(people, /pending_invites/);
assert.match(people, /MemberInviteSheet/);
assert.match(invite, /invokeFunction\('v7-member-invitation'/);
assert.match(invite, /r\.slug\s*!==\s*'owner'/);
assert.match(invite, /activation_url/);
assert.doesNotMatch(invite, /temporary[_ -]?password|generatePassword|password\s*:/i);
assert.match(invite, /navigator\.clipboard\.writeText/);

assert.match(migration, /create or replace function public\.member_directory_query/i);
assert.match(migration, /security definer/i);
assert.match(migration, /auth\.uid\(\) is null/i);
assert.match(migration, /members\.view/);
assert.match(migration, /least\(coalesce\(p_limit,50\),100\)/i);
assert.match(migration, /left join auth\.users/i);
assert.match(migration, /ilike '%'\|\|v_query\|\|'%'/i);
assert.match(migration, /status_counts/);
assert.match(migration, /pending_invites/);
assert.match(migration, /revoke all on function public\.member_directory_query/i);
assert.match(migration, /grant execute on function public\.member_directory_query[\s\S]*to authenticated/i);
assert.match(migration, /Intentional backward-compatible authenticated maintenance API/i);
assert.match(legacy, /cleanup_stale_uploads/);

console.log('V7 People + security 7.0 contract: PASS');
