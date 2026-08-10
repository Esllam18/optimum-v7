# Release Notes — Optimum 6.8.0

## Project & Document Control OS

### جديد
- Projects Command Center + Project 360.
- Site 360 مع manager/location/timezone/lifecycle.
- Common Data Environment (CDE) للملفات.
- Document 360 + Document Control lifecycle.
- Workspace Blueprints: Standard Engineering / Fiber Delivery / Construction Delivery.
- Storage Intelligence.
- Smart Trash query/context.
- Unified exact entity navigation.
- Server-side document search/picker/workspace snapshots.

### Security/Correctness
- Unified Project/Site RPC commands.
- Direct Project/Site Data API writes disabled.
- Granular rename/move/archive/restore permission enforcement.
- Storage policies bound to actual upload reservations and document resource scope.
- Archived project/site linked mutations blocked.
- Resource-aware file/folder notifications.
- Storage quota reservation serialized per company.

### Integration
- Work OS project context.
- CAD document linking uses server-side picker and opens Document 360 directly.
- Search/Notifications/Activity use the same entity context resolver.

### Database reproducibility
- Reconstructed canonical Phase 2 Files schema/workflow migration files added locally.
- 6.8 migrations include core PDC, CDE queries, Blueprints hardening and performance cleanup.

### Verified
- Full npm regression PASS.
- Browser Core/Policy/Work/Excellence/PDC PASS in independent gates.
- Live Supabase Owner + limited Engineer + storage/archive/blueprint rollback smokes PASS.
- Portable Client/Platform HTTP and security headers PASS.

### Remaining production gates
- `next build` not proven because dependency installation is blocked by the audit environment's npm registry (`tslib` 404).
- Fresh DB replay requires staging/CLI/Postgres environment.
- SECURITY DEFINER allowlist review and Leaked Password Protection remain before public production.
