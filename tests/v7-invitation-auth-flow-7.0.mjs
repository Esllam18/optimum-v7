import fs from 'node:fs';
import assert from 'node:assert/strict';

const sheet = fs.readFileSync(new URL('../src/v7/components/MemberInviteSheet.js', import.meta.url), 'utf8');
const activation = fs.readFileSync(new URL('../src/v7/components/InviteActivation.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../src/v7/lib/api.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/v7/V7App.js', import.meta.url), 'utf8');
const edge = fs.readFileSync(new URL('../supabase/functions/v7-member-invitation/index.ts', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260810084546_v7_invitation_preview_public_token_scope.sql', import.meta.url), 'utf8');

// Admin UI must never provision or display a temporary password in V7.
assert.match(sheet, /invokeFunction\('v7-member-invitation'/);
assert.match(sheet, /activation_url/);
assert.doesNotMatch(sheet, /temporary[_ -]?password|generatePassword|createUser\(|password\s*:/i);
assert.match(sheet, /r\.slug\s*!==\s*'owner'/);

// Dedicated Edge Function: authenticated caller, delegated DB invitation, Auth invite link, no password generation.
assert.match(edge, /admin\.auth\.getUser\(token\)/);
assert.match(edge, /client\.rpc\("create_company_invitation"/);
assert.match(edge, /admin\.auth\.admin\.generateLink/);
assert.match(edge, /type:\s*linkType/);
assert.match(edge, /linkType\s*=\s*existingUser\s*\?\s*"magiclink"\s*:\s*"invite"/);
assert.match(edge, /existingUser\?\.confirmed_at/);
assert.match(edge, /redirect origin must match the calling application/i);
assert.match(edge, /configuredOrigins\s*=\s*new Set/);
assert.match(edge, /isAllowedOrigin/);
assert.match(edge, /Application origin is not configured/);
assert.match(edge, /Application origin is not allowed/);
assert.match(edge, /Forbidden origin/);
assert.match(edge, /if \(!origin \|\| !isAllowedOrigin\(origin\)\) return base/);
assert.doesNotMatch(edge, /Access-Control-Allow-Origin["']?:\s*origin[\s\S]{0,80}without/i);
assert.match(edge, /revokeInvitationToken/);
assert.doesNotMatch(edge, /randomPassword|temporary_password|admin\.auth\.admin\.createUser/);

// Activation route captures Supabase Auth session, lets the user choose password, then accepts company invitation.
assert.match(api, /captureSessionFromUrl/);
assert.match(api, /updateCurrentUser/);
assert.match(api, /invokeFunction/);
assert.match(activation, /invitation_preview/);
assert.match(activation, /updateCurrentUser\(\{ password \}\)/);
assert.match(activation, /accept_company_invitation/);
assert.match(activation, /sameEmail/);
assert.match(activation, /signIn\(invitedEmail, password\)/);
assert.match(activation, /Switch account|تبديل الحساب/);
assert.match(app, /route\.key === 'invite'/);
assert.match(app, /InviteActivation/);

// Only the token-scoped preview is intentionally available before sign-in.
assert.match(migration, /revoke execute on function public\.invitation_preview\(text\) from public/i);
assert.match(migration, /grant execute on function public\.invitation_preview\(text\) to anon, authenticated/i);
assert.match(migration, /high-entropy invitation token/i);

console.log('V7 secure invitation auth flow 7.0 contract: PASS');
