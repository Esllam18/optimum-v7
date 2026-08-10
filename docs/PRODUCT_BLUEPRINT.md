# Optimum — Product Blueprint

## 1. Product vision

Optimum is a premium B2B operating workspace for engineering companies. It turns scattered company knowledge and daily operations into one secure, understandable system.

The product is sold and provisioned privately. A company contacts the platform owner, a workspace is created after agreement, and the company owner activates their account and manages employees from inside their isolated tenant.

## 2. Official product phases

1. **Foundation** — company, team, permissions, projects, sites.
2. **Files Workspace** — Platform Control, folder structure, files, versions, search, activity, notifications.
3. **Work Management** — tasks, comments, attachments, calendar, manager/employee dashboards.
4. **CAD & Engineering** — drawing management, drawing-file relationships, comparisons, engineering tools.
5. **Enterprise** — AI, reports, integrations, native mobile, billing, white-label, and broader SaaS capabilities.

Documentation and security work continue through all five phases; they are not extra phases.

## 3. Tenant model

- Every client is a `company` tenant.
- Every company has its own members, roles, projects, sites, folders, documents, versions, notifications, and limits.
- A user may belong to more than one company and switch between them.
- Company data is protected by RLS and tenant-scoped storage paths.
- Company suspension blocks operations without deleting data.

## 4. Platform Control

### Platform roles

- **Platform Owner:** full platform control.
- **Platform Admin:** company provisioning and subscription operations.
- **Support:** future constrained support access.

### Company lifecycle

- `trial`
- `active`
- `suspended`
- `expired`

### Plans

The model supports default limits plus per-company overrides:

- maximum active members
- maximum active projects
- maximum storage bytes
- feature metadata

### Provisioning flow

1. Platform admin creates the company.
2. The system creates six protected company roles.
3. The system creates the company subscription.
4. The system creates a secure invitation for the owner email.
5. The owner opens the link, registers with that email, and chooses a password.
6. The owner invites employees and configures permissions.

Passwords are never generated or sent by the platform owner.

## 5. Company roles

- Owner
- Admin
- Manager
- Engineer
- Supervisor
- Viewer

Roles define defaults. Individual member permission overrides may allow, deny, or inherit a permission. Company/platform authorization is enforced in the database, not only by hidden UI controls.

## 6. Files Workspace

### Folder experience

- Cards are the primary visual navigation.
- A side tree provides fast hierarchical navigation.
- Breadcrumbs show the exact location.
- Project and site selectors define the current scope.
- Every new project and site receives the same standard template.
- Authorized users may create controlled custom folders and nested folders.

### Folder rules

- Duplicate folder names are blocked inside the same parent/scope.
- Maximum nesting depth is 20.
- System folders cannot be renamed, moved, or trashed.
- Custom folder operations are audited.
- Trash is soft deletion; permanent deletion is not available in this phase.

### File model

A document is not the uploaded binary.

- **Document:** stable identity, display name, code, type, description, tags, folder, and state.
- **Document Version:** immutable uploaded object, original filename, version number, size, MIME type, change note, uploader, and timestamps.

The same folder may contain many unrelated documents. A new version belongs only to its document.

### Upload intelligence

When multiple files are selected, the UI compares normalized names with documents in the current folder and proposes:

- create a new document; or
- add a new version to an existing document.

The user can change the decision before upload.

### Search

Global search covers:

- project name/code
- site name/code
- folder name/code
- document display name
- system code
- type, description, and tags

Search results open the correct project/site/folder/document context.

### Notifications

Important file/folder changes notify active company members except the actor. Notifications can open the related document or folder.

## 7. Standard engineering folder template

```text
00 — Project Management
01 — Drawings
    Architectural
    Structural
    Electrical
    Mechanical
    Plumbing
    Coordination
02 — Technical Documents
03 — BOQ & Cost
04 — Contracts
05 — RFIs
06 — Submittals
07 — Reports
08 — Photos
09 — Correspondence
99 — Archive
```

## 8. Version-one commercial boundaries

Implemented now:

- private company provisioning
- manual secure-link delivery
- plans/status/limits
- private storage
- multi-tenant isolation

Deferred to Enterprise:

- payment gateway and invoicing
- self-service company signup
- automated plan upgrades
- custom domains and full white-label
- coupons and usage-based billing

## 9. Product principles

- Clear before clever.
- Fast before decorative.
- Prevent errors before explaining them.
- Keep history; do not overwrite or silently delete.
- One primary action per screen.
- Every page explains itself in context.
- Features enter the product only when they reduce mistakes, save time, or improve access to information.

## 11. Phase 3 — Work Management contract

Work Management converts stored information into owned, time-bound action.

- Tasks may be company-visible or private.
- Company-visible tasks can be assigned to members or roles, or published as open work.
- Tasks are context-aware and may reference a project, site, folder, or document.
- Completion is more than a checkbox: status, completion time, actor, note, progress, checklist, and attachments are retained.
- Recurring work is represented by a series plus immutable occurrences.
- Managers receive all-company visibility through `tasks.view_all`; regular users receive only work they created, claimed, are directly assigned, inherit through their role, or may openly claim.

---

# Phase 4 Addendum — CAD & Engineering

The engineering module converts field/office schematic work from hand sketches into a controlled digital workflow. A drawing is a company-scoped record attached to a project and optional site/folder. Every editable state belongs to a revision. The editor stores semantic nodes, routes, annotations, sheet settings, and takeoff data rather than a flat image.

The primary user outcome is: **draw once, obtain the issued line diagram and takeoff sheet from the same engineering data.**

The module is deliberately domain-specific. It prioritizes fiber/telecom network schematics and company catalog items over general CAD complexity.
