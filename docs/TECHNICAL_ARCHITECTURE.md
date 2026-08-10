# Optimum — Technical Architecture

## 1. Stack

- Next.js 16 App Router production host
- Framework-neutral browser ES modules for the current feature layer
- PostgreSQL 17 and Supabase Auth
- Supabase Storage private bucket
- PostgreSQL RLS and validated RPC workflows
- Semantic CSS tokens; no Bootstrap dependency
- Portable Node server for immediate local execution

## 2. Source structure

```text
app/                    Next.js host and synchronized global CSS
public/assets/          Browser modules used by Next.js
assets/                 Browser modules used by portable mode
supabase/migrations/    Phase 1 SQL records and Phase 2 remote manifest
docs/                   Product, UX, design, database, QA, decisions
checks/                 Optional integrity artifacts
index.html              Portable entry
server.mjs              Portable server
```

Portable and Next.js assets must remain byte-for-byte synchronized during packaging.

## 3. Client modules

### `app.js`

Presentation, application state, permission-aware routing, dialogs/drawers, company/platform switching, Files Workspace, upload orchestration, search, and notifications.

### `api.js`

- Supabase Auth REST
- PostgREST select/insert/update/delete
- PostgreSQL RPC
- Storage object upload/delete/signed download URLs
- access-token refresh and normalized errors

### `i18n.js`

Arabic/English translation catalog and direction handling.

### `icons.js`

Local outline SVG registry; no runtime network request.

## 4. Platform and tenant boundaries

### Platform scope

`platform_admins`, `service_plans`, `company_subscriptions`, and `platform_audit_events` are platform-level entities. Platform RPCs validate `app_private.is_platform_admin()`.

### Tenant scope

Every company-owned row contains `company_id`. Membership plus effective permission controls data visibility and mutation.

A company must be operational (`trial` or `active` with valid dates) for permissions other than `company.view` to evaluate true.

## 5. File architecture

### Database metadata

- `folders`
- `documents`
- `document_versions`

### Object storage

Private bucket: `company-files`.

Path format:

```text
{company_id}/{project_id}/{site_id-or-project}/{document_id}/{version_id}/{safe_filename}
```

Storage RLS extracts the company UUID from the first path segment and evaluates file permission.

### Two-phase upload

1. `begin_document_upload` or `begin_new_version_upload` reserves metadata and quota.
2. Client uploads binary directly to Storage.
3. `finalize_document_upload` verifies that the object exists, marks version ready, and updates current version.
4. On failure, `abort_document_upload` removes incomplete metadata/object.

This prevents a database row from pretending a file exists when binary upload failed.

## 6. Folder generation

A global default `folder_template` and recursive `folder_template_nodes` define the standard tree. After project/site insert, a private trigger instantiates the tree. Existing Phase 1 projects and sites were backfilled.

Scope validation ensures folder, project, site, and company IDs agree. Custom hierarchy depth is capped at 20.

## 7. Search

Document metadata is stored in a generated `tsvector` and indexed with GIN. `global_search` combines text ranking and partial `ILIKE` matching across documents, folders, projects, and sites.

The UI does not load search results from unrelated companies; the RPC checks `search.use` for the requested company.

## 8. Plan enforcement

Database triggers enforce active-member and active-project limits. Upload reservation checks current ready/uploading bytes against effective storage limit.

Effective limits equal plan defaults unless an override exists on `company_subscriptions`.

## 9. Authorization strategy

- Anonymous table privileges revoked.
- Exposed tables use RLS.
- Sensitive multi-table writes use `SECURITY DEFINER` RPCs with fixed search paths and explicit authorization.
- Internal helper functions live in `app_private` and are not API resources.
- Storage SELECT/INSERT/DELETE policies independently enforce tenant permission.
- UI permission checks improve experience but are not the security boundary.

## 10. Invitations and registration

The UI is invitation-only. An invitation token in the URL enables registration. The database stores only SHA-256 hashes and binds acceptance to the authenticated email.

The Supabase Auth endpoint itself should also be configured for controlled production registration before a public launch. In this phase, unauthorized users cannot create companies and cannot access tenant data even if they create an auth identity outside the UI.

## 11. Performance

- indexes cover tenant/scope relationships, folder hierarchy, versions, search, notifications, and plan relationships;
- company data is fetched in parallel;
- Phase 2 UI currently caps large reads (folders/documents 5,000; versions 10,000);
- production scale beyond those thresholds should introduce cursor pagination and list virtualization;
- no runtime web-font or icon dependency blocks rendering.

## 12. Deployment modes

### Portable review

```bash
npm run portable
```

### Next.js development

```bash
npm install
npm run dev
```

### Production

Use a Node-compatible host, configure the final site URL in Supabase Auth redirect allow-list, enable leaked-password protection, and configure SMTP before external customer launch.

## 12. Work Management architecture

The browser loads tenant-scoped task rows through RLS. All state-changing operations use validated PostgreSQL RPCs.

```text
UI Task Dialog/Drawer
        ↓
Permission-aware RPC workflow
        ↓
Tasks + assignments + checklist/comments/events
        ↓
RLS read model + notifications + audit log
```

Recurring series are materialized idempotently into task occurrences. `(series_id, occurrence_at)` is unique. The application requests a bounded future window when loading Work Management; duplicate instances cannot be generated.

Task files are stored in the private `task-attachments` bucket. Upload uses reservation → object upload → finalization, with abort cleanup on failure.

---

# Phase 4 Technical Addendum

`assets/engineering.js` is a separate ES module integrated into the main shell through a small dependency interface. It owns engineering state, rendering, pointer interactions, takeoff generation, revision actions, and export functions. Pure functions for snapshot normalization, BOQ, diff, SVG, and DXF are exported for automated tests.

The canonical draft is semantic JSONB. Large binary references/exports are stored in the private `engineering-assets` bucket. Database RPCs enforce permission and scope and use optimistic locking for draft saves.

## Phase 4 generated-file integration

The browser generates SVG, DXF, CSV, and Spreadsheet XML locally. When the user chooses to persist an export:

1. `begin_document_upload` reserves a normal Files Workspace document/version and enforces quota.
2. The generated `Blob` is uploaded to the private `company-files` bucket.
3. `finalize_document_upload` marks the version ready.
4. `link_engineering_document` records the drawing/revision relationship.
5. Failure at any point deletes the uploaded object and aborts the reserved version.

This keeps CAD exports inside the same versioning, search, trash, permissions, and storage model as every other company file.
