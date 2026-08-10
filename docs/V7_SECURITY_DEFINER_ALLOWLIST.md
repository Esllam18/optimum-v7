# Optimum V7 — SECURITY DEFINER Allowlist Review

Date: 2026-08-10
Production Supabase project: `wzcaquxuvqfbstpxujsj`

## Purpose
Supabase's database advisor reports every authenticated-callable `SECURITY DEFINER` function as a warning. Optimum deliberately uses PostgreSQL RPC functions as an authorization-enforcing API layer, so the correct gate is not to mass-revoke every warning. The gate is to prove that each externally callable function has an intentional authorization boundary or a reviewed delegation/token boundary.

## Live inventory
- Public `SECURITY DEFINER` functions: **162**.
- Callable by `authenticated`: **153**.
- Callable by `anon`: **1 intentional token-scoped RPC** (`invitation_preview(text)`).
- `work_scheduler_tick` remains **not callable by authenticated** and is service-role only.

## Automated authorization-signal screen
The 153 authenticated-callable functions were scanned for an obvious authorization signal in their live definition, including:
- `auth.uid()`
- `app_private.has_company_permission(...)`
- resource permission helpers
- `app_private.can_view_*`
- `app_private.is_platform_admin()`
- JWT/service-role checks
- explicit permission-denied gates.

Result:
- **151 / 153** had a direct authorization signal in their own live definition.
- **2 / 153** required manual review.

This is a triage mechanism, not a proof that every implementation is bug-free. It reduces the advisor warning surface to functions that actually need manual reasoning.

## Manual-review exceptions

### `public.resolve_engineering_review_mark(p_mark_id uuid)`
Classification: **Allowed authenticated wrapper**.

The function delegates immediately to `public.update_engineering_review_mark(...)`. The target function locks the mark, derives its company, and requires `app_private.has_company_permission(m.company_id, 'drawings.review')` before performing the update. The wrapper therefore inherits the reviewed authorization boundary of the target function.

Decision: keep authenticated execute.

### `public.invitation_preview(p_token text)`
Classification: **Intentional pre-auth token-scoped read / accepted advisor exception**.

Postgres logs proved that the invitation landing page needs this preview before the invitee is signed in. Production migration `20260810084546_v7_invitation_preview_public_token_scope` therefore grants `EXECUTE` to `anon` and `authenticated` on this one function only.

The function:
- rejects null/short tokens,
- hashes the supplied invitation token before lookup,
- returns only invitation-specific company/role/email/status/expiry data,
- returns `{valid:false}` for a token that does not match an invitation,
- does not grant table access or any mutation capability.

Rollback testing as the `anon` role confirmed that a valid synthetic high-entropy token can preview its invitation while a wrong token receives only `{valid:false}`, with zero persisted test invitations after rollback.

Decision: retain the narrow anon grant as a documented product requirement. The Supabase `anon_security_definer_function_executable` warning for this function is expected and accepted; it should not be silenced by broadening table access or breaking the pre-auth experience.

## Explicit compatibility exception
### `public.cleanup_stale_uploads(...)`
This remains callable by authenticated users for the V6.9 compatibility window. Its live implementation limits cleanup to uploads owned by the caller or companies where the caller has `files.manage`, and only aborts stale reservations whose storage object does not exist.

Decision: do not revoke while legacy V6.9 boot still calls it. Remove the compatibility exposure when the legacy boot path is retired.

## Remaining security gates
1. Supabase Auth leaked-password protection is still disabled and must be enabled/verified outside the currently connected tool surface.
2. Preserve the rule that `anon` receives no broad RPC execute surface beyond the reviewed token-scoped `invitation_preview(text)` exception.
3. Re-run this allowlist review whenever a new `SECURITY DEFINER` RPC is added or its grant changes.
4. Keep authorization tests paired with sensitive command RPCs rather than treating advisor-count reduction as the goal.
