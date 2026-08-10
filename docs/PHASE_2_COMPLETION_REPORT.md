# Optimum — Phase 2 Completion Report

## Status

**Completed:** Platform Control and Files Workspace are implemented in the web application and the connected Supabase project.

## Scope delivered

### Platform Control

- Platform-level roles: Owner, Admin, Support
- Platform Owner access assigned to the existing Optimum account
- Client company creation exclusively through Platform Control
- Three service plans with enforceable member/project/storage limits
- Trial, Active, Suspended, and Expired access states
- Company suspension without deleting tenant data
- Secure first-owner invitation link
- Company plan/status/limit editing
- Platform company overview with real member, project, and storage usage
- Platform audit event storage

### Files Workspace

- Generated engineering folder structure for every project and site
- Card-first folder experience with synchronized folder tree
- Custom nested folders, duplicate-name prevention, depth validation, and scope validation
- File records with immutable versions
- Private object storage and tenant-scoped object paths
- First-file and subsequent-version upload reservations
- Upload finalization/abort safety workflow
- Smart new-file/new-version selection in the UI
- File metadata, original filename, document type, description, tags, version notes
- Rename/move/trash/restore operations
- Search across projects, sites, folders, and documents
- Favorites and notifications
- Storage metrics and quota enforcement
- Audit triggers for folders, documents, and versions

## Database validation

A transactional Files Workspace test passed with:

- custom folder creation and rename
- first file upload reservation and finalization
- second version reservation and finalization
- current-version and version-count assertions
- private storage-object assertions
- global-search result assertion
- storage-metric assertion
- document trash and restore
- folder trash and restore

A transactional Platform Control test passed with:

- client-company creation
- six default roles
- secure owner invitation
- subscription plan/status update
- custom limits
- platform-overview visibility

Both tests were rolled back. No QA companies, folders, files, versions, or storage objects remained.

## Supabase state

- 22 public application tables, all with RLS enabled
- 23 permission definitions
- private `company-files` bucket
- 12 total applied migrations through Phase 2
- existing company backfilled to an active Business subscription
- existing project and site backfilled with their standard folder structures

## Security posture

- No service-role key in client source
- Anonymous table access revoked
- Direct writes to sensitive entities avoided; validated RPCs enforce authorization and invariants
- Tenant isolation enforced in PostgreSQL and Storage policies
- Company status is enforced by permission evaluation
- Invitation tokens are random and hashed at rest
- Object paths begin with company UUID and are checked by Storage RLS
- Permanent deletion is not exposed in this phase

Supabase Advisor flags authenticated `SECURITY DEFINER` functions because they are public RPC endpoints. This is intentional: each endpoint validates the authenticated user and required company/platform permissions before accessing protected tables.

The Supabase project currently reports leaked-password protection as disabled. It should be enabled in Supabase Auth settings before public production launch.

## Known operational boundary

SMTP/email delivery is not configured. The platform generates secure activation/invitation links, and the authorized user copies and sends them manually. Automated transactional email belongs to deployment/integration hardening, not the core file architecture.

## Exit criteria

Phase 2 is accepted when:

- the Platform Owner can create and manage a client company;
- the client owner can activate their own account;
- companies cannot see one another's data;
- each project/site receives the same folder template;
- users can navigate folders by cards and tree;
- files can have multiple immutable versions;
- upload, download, search, trash, restore, notifications, and plan limits work;
- Arabic/English and dark/light experiences remain consistent;
- portable source package and documentation are delivered.

All criteria above are implemented.
