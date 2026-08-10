import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260809230046_v7_engineering_draft_fast_path.sql'), 'utf8');
assert.ok(sql.includes('v_boq_changed :='), 'Migration must detect BOQ changes before rewriting normalized rows');
assert.ok(sql.includes('if v_boq_changed then'), 'BOQ persistence must have an unchanged-payload fast path');
assert.ok(sql.includes('distinct on (item_code,source_kind)'), 'Set-based BOQ persistence must deduplicate composite keys deterministically');
assert.ok(sql.includes('is distinct from (excluded.quantity'), 'BOQ upsert must not issue no-op updates');
assert.ok(sql.includes('v_revision_changed'), 'Migration must distinguish real changes from true no-op saves');
assert.ok(sql.includes("current_revision_id is distinct from p_revision_id"), 'Drawing touch guard must still repair revision identity');
assert.ok(sql.includes("status is distinct from 'draft'"), 'Drawing touch guard must preserve draft status correction');
assert.ok(sql.includes("p_expected_lock_version"), 'Optimistic locking must remain in the optimized function');
assert.ok(sql.includes("app_private.user_has_resource_permission(auth.uid(),r.company_id,'drawings.edit'"), 'Engineering save must explicitly enforce drawing resource scope');
assert.ok(sql.includes("then raise exception 'Permission denied'"), 'Engineering save must retain the permission-denied contract');
console.log('V7 engineering save fast-path migration contract: PASS');

const engineering = fs.readFileSync(path.join(process.cwd(), 'assets/engineering.js'), 'utf8');
assert.ok(engineering.includes('AUTOSAVE_IDLE_MS=2200'), 'CAD autosave must wait for an editing idle window');
assert.ok(engineering.includes('AUTOSAVE_MIN_INTERVAL_MS=4500'), 'CAD autosave must coalesce rapid changes');
assert.ok(engineering.includes('function markDirty(){eng.dirty=true;eng.lastMutationAt=Date.now();}'), 'CAD mutations must timestamp the latest change');
assert.ok(engineering.includes('idleFor>=AUTOSAVE_IDLE_MS'), 'Autosave must not run while the user is actively editing');
assert.ok(engineering.includes('eng.lastSaveStartedAt=Date.now()'), 'Save throttling must track actual save starts');

assert.ok(engineering.includes('async function ensureFrameLogoAssets()'), 'Frame logos must migrate from inline data URLs to storage assets');
assert.ok(engineering.includes("p_kind:'reference'"), 'Frame logo migration must use the existing engineering asset upload contract');
assert.ok(engineering.includes('function settingsForPersistence()'), 'Engineering settings need a compact server persistence representation');
assert.ok(engineering.includes('delete safe.src;delete safe.dataUrl;delete safe.localUrl;'), 'Inline image bytes must never be persisted in revision settings');
assert.ok(engineering.includes('p_sheet_settings:persistedSettings'), 'Draft save must send compact settings to Supabase');
assert.ok(engineering.includes('async function hydrateFrameLogoUrls()'), 'Stored frame logo assets must be hydrated back for rendering/export');

console.log('V7 engineering autosave coalescing contract: PASS');
