# Supabase Status — Phase 5.1

Project: `Optimum` (`wzcaquxuvqfbstpxujsj`)

Applied remotely:

- `phase5_1_identity_provisioning`
- `phase5_1_account_security_backfill`
- `phase5_1_first_login_service_hardening`
- `phase5_1_rich_platform_directory`
- `phase5_1_identity_performance_indexes`

Deployed Edge Function:

- `identity-provisioning`
- JWT verification enabled.
- Service-role operations remain server-side.

Verified:

- RLS enabled on identity/company/member/invitation tables.
- No anonymous execution grant on the Phase 5.1 identity service RPCs.
- Service-only RPCs are executable by `service_role`.
- Platform read RPCs are available only to authenticated users and verify platform-admin status internally.
- New foreign-key indexes for account provisioning and engineering review tables are present.

Do not re-run the bundled Phase 5.1 migrations against this same project.
