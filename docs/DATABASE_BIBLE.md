# Optimum — Database Bible: Phases 1–2

## 1. Supabase project

- Name: `Optimum`
- Ref: `wzcaquxuvqfbstpxujsj`
- Region: `eu-west-1`
- PostgreSQL: 17

## 2. Enums

- `membership_status`: invited, active, suspended, left
- `project_status`: planned, active, on_hold, completed, archived
- `invitation_status`: pending, accepted, revoked, expired
- `platform_role`: owner, admin, support
- `company_access_status`: trial, active, suspended, expired
- `document_state`: active, archived, trashed
- `upload_state`: uploading, ready, failed
- `favorite_entity_type`: project, site, folder, document

## 3. Foundation tables

- `profiles`
- `companies`
- `permissions`
- `roles`
- `role_permissions`
- `company_memberships`
- `member_permission_overrides`
- `company_invitations`
- `projects`
- `sites`
- `audit_events`

## 4. Platform tables

### `platform_admins`

Platform user role and active flag.

### `service_plans`

Plan code, bilingual name/description, default member/project/storage limits, features JSON, active state, sort order.

### `company_subscriptions`

One row per company containing plan, lifecycle status, trial/period dates, optional limit overrides, and notes.

### `platform_audit_events`

Append-oriented platform action history with actor, company, action, metadata, and timestamp.

## 5. Files tables

### `folder_templates`

Global or company-scoped folder template definition.

### `folder_template_nodes`

Recursive template tree with bilingual names, code, order, and system flags.

### `folders`

Instantiated project/site hierarchy. Contains company, project, optional site, parent, template node, depth, system/custom state, creator, and trash metadata.

### `documents`

Stable document identity and metadata. `current_version_id` points to the ready current version. `search_vector` indexes searchable metadata.

### `document_versions`

Immutable version metadata and storage identity. A unique `(document_id, version_number)` prevents version collisions.

### `favorites`

Per-user favorites for project/site/folder/document IDs.

### `notifications`

Per-user company notifications with bilingual title/body, related entity, read state, and timestamp.

## 6. Permission catalog

Foundation permissions plus:

- `files.view`
- `files.upload`
- `files.create_folder`
- `files.rename`
- `files.move`
- `files.archive`
- `files.restore`
- `files.download`
- `files.manage`
- `search.use`
- `notifications.view`

The catalog currently contains 23 keys.

## 7. Public RPC contracts

### Platform

- `platform_create_company`
- `platform_update_company`
- `platform_company_overview`

### Team/Foundation

- `create_company_invitation`
- `accept_company_invitation`
- `revoke_company_invitation`
- `set_member_role`
- `set_member_status`
- `set_member_permission_override`
- `clear_member_permission_override`
- `replace_role_permissions`

### Folder operations

- `create_folder`
- `rename_folder`
- `move_folder`
- `trash_folder`
- `restore_folder`

### Document/version operations

- `begin_document_upload`
- `begin_new_version_upload`
- `finalize_document_upload`
- `abort_document_upload`
- `rename_document`
- `move_document`
- `trash_document`
- `restore_document`

### Search/metrics/notifications

- `global_search`
- `company_storage_metrics`
- `mark_all_notifications_read`

The old direct `create_company` RPC is disabled and its authenticated execute grant is revoked.

## 8. Storage

Bucket: `company-files`

- private
- per-object limit: 1 GB
- SELECT requires `files.download`
- INSERT requires `files.upload`
- DELETE is limited to the uploading owner or `files.manage`
- company UUID is validated from path prefix

## 9. Critical integrity rules

- all tenant references must share the same company;
- site must belong to project;
- parent folder must share project/site scope;
- custom nesting depth cannot exceed 20;
- active folder names are unique per parent/scope;
- system folders cannot be moved, renamed, or trashed;
- document codes are unique within a folder when present;
- version numbers are unique and sequential within a document;
- current version is finalized only after Storage object exists;
- member/project/storage limits are enforced in PostgreSQL;
- at least one active company owner remains;
- invitation email must match authenticated email;
- suspended/expired companies retain data but lose operational permissions.

## 10. RLS summary

All 22 public application tables have RLS enabled.

- platform tables: platform admin or permitted member visibility;
- company tables: active membership and effective permission;
- files: `files.view` read policy; writes through validated RPC;
- favorites: current user only;
- notifications: current user only;
- Storage objects: company path + effective file permission.

## 11. Applied migrations

### Phase 1

- `20260803190517_foundation_identity_companies_roles_projects`
- `20260803190536_harden_function_execution_grants`
- `20260803191944_complete_foundation_security_workflows`
- `20260803193025_foundation_performance_hardening`
- `20260803194047_foundation_audit_integrity_fixes`
- `20260803194240_foundation_role_cascade_fix`
- `20260803194325_foundation_audit_cascade_fix`

### Phase 2

- `20260803210554_phase2_platform_control`
- `20260803211107_phase2_files_schema`
- `20260803211211_phase2_files_workflows`
- `20260803212223_phase2_platform_metrics_storage`
- `20260803212452_phase2_performance_hardening`

## 12. Phase 2 hardening additions

### Trash provenance

`folders` and `documents` now include:

- `trash_origin`: `direct` or `ancestor`;
- `trash_root_folder_id`: the root folder whose deletion hid the item.

`restore_folder` restores only rows sharing its deletion batch and marked as inherited from that folder. A directly trashed document remains trashed.

### Invitation preview

`invitation_preview(p_token text)` exposes only token-scoped onboarding information: validity, status, company name, invited email, role labels, and expiry. The raw token remains a high-entropy bearer secret and its hash is stored at rest.

### Stale upload cleanup

`cleanup_stale_uploads(p_older_than_minutes integer)` removes abandoned database reservations only when no matching Storage object exists. Objects are never deleted directly from PostgreSQL; Storage deletion uses the Storage API.

### Hardening migration

- `20260803223342_phase2_hardening_trash_uploads_invites`
- `20260803230705_phase2_hardening_invites_uploads_trash`

## 12. Phase 3 enums

- `task_status`: todo, in_progress, blocked, done, cancelled
- `task_priority`: low, medium, high, urgent
- `task_visibility`: company, private
- `task_recurrence_frequency`: none, daily, weekly, monthly
- `task_attachment_state`: uploading, ready, failed

## 13. Phase 3 tables

- `task_series`: recurring definition and next materialization points.
- `tasks`: one executable task occurrence.
- `task_series_assignments`: reusable member/role ownership template.
- `task_assignments`: task-level member/role ownership.
- `task_checklist_items`: ordered execution steps.
- `task_comments`: task discussion.
- `task_attachments`: private attachment metadata and upload state.
- `task_events`: append-only task timeline.

## 14. Phase 3 invariants

- Every row carries `company_id` and is protected by RLS.
- Context references must belong to the same company and coherent project/site scope.
- Private tasks cannot be assigned or open for claiming.
- Only users with assignment authority can assign other members, roles, or open work.
- Users with execution permission can update their own, claimed, directly assigned, or role-assigned tasks.
- Attachment objects are inaccessible without task visibility.
- Recurring occurrences are unique per series and timestamp.

---

# Phase 4 Database Addendum

Engineering entities use six RLS-protected tables: catalog, drawings, revisions, revision BOQ, review marks, and assets. `engineering_drawings.current_revision_id` points to the revision currently presented to users. Each revision contains an immutable identity and mutable content only while its status is `draft`. `lock_version` prevents accidental overwrite of another user's save.

The drawing snapshot has `nodes`, `routes`, `annotations`, optional `reference`, and `manualBoq`. Server-side BOQ rows mirror the generated takeoff for reporting and future analytics.

## Phase 4 file integration addendum

`engineering_document_links` provides a non-destructive relationship between an engineering drawing/revision and a Files Workspace document.

- `relation_type`: `source`, `reference`, `export`, or `boq`.
- The linked document must belong to the same company, project, and site scope.
- Removing the relationship does not delete the document or its versions.
- Generated exports use `begin_document_upload` → private Storage upload → `finalize_document_upload` → `link_engineering_document`.
