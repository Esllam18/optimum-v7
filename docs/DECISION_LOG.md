# Optimum — Decision Log

## ADR-001 — Five product phases
Keep Foundation, Files Workspace, Work Management, CAD & Engineering, and Enterprise. Documentation is continuous, not an additional product phase.

## ADR-002 — Responsive web first
Desktop is primary for structured file work; responsive web supports mobile operations. Native mobile remains later.

## ADR-003 — PostgreSQL/Supabase
Use relational PostgreSQL for tenant relationships, constraints, RLS, reporting, and version history.

## ADR-004 — Authorization in the database
UI visibility is convenience. RLS, Storage policies, and validated RPC functions are the security boundaries.

## ADR-005 — Roles plus member overrides
Use six understandable company roles and per-member overrides rather than role proliferation.

## ADR-006 — Protected ownership
At least one active owner must remain. Owner identity and core permission safety are database invariants.

## ADR-007 — Private B2B provisioning
Companies are created by Platform Control after commercial agreement. Public users cannot create tenants.

## ADR-008 — Owners choose passwords
The platform sends a secure activation link. It never sends or stores a generated plaintext password.

## ADR-009 — Company suspension is non-destructive
Suspended/expired tenants retain data; operational permissions are disabled until reactivation.

## ADR-010 — Platform Control belongs at the start of Phase 2
File quotas and storage ownership depend on tenant plans and lifecycle, so platform control precedes file implementation but remains inside Phase 2.

## ADR-011 — Cards plus tree
Folder cards are the primary understandable navigation. A synchronized tree supports experienced users and deep structures.

## ADR-012 — Fixed template plus controlled custom folders
Every project/site starts consistently. Authorized users can add nested custom folders only when necessary.

## ADR-013 — Document separate from binary/version
A document is stable metadata. Each upload is an immutable version. New files in the same folder remain unrelated unless explicitly versioned.

## ADR-014 — Two-phase file upload
Reserve metadata, upload the object, then finalize. Failed objects do not become fake ready versions.

## ADR-015 — Private S3-compatible storage abstraction
Start on Supabase Storage with tenant-scoped paths and preserve a migration-friendly object-storage model.

## ADR-016 — Trash before permanent deletion
Phase 2 exposes recovery, not irreversible deletion. Retention and permanent purge are later operational policies.

## ADR-017 — Search metadata first
Index names, codes, types, descriptions, and tags now. Full file-content extraction/OCR comes later.

## ADR-018 — Manual link delivery for now
Secure activation/invitation links are generated and copied. SMTP automation is deferred until deployment integration is configured.

## ADR-019 — Distinct dark/light systems
Themes share semantics but have independent surfaces and depth. Arabic/English are designed from day one.

## ADR-020 — No Bootstrap visual dependency
Use the Optimum semantic design system and local components to avoid a generic admin-template identity.

## ADR-021 — Hardening before Phase 3
Real browser use is the release boundary. Work Management does not begin while invitation, Storage, download, or Trash workflows have unresolved failures.

## ADR-022 — Direct versus inherited trash
Persist whether an item was deleted directly or hidden by an ancestor folder. Restoring a folder must never restore a file the user had deleted independently.

## ADR-023 — Cache-busted portable releases
Portable assets are versioned and served with `no-store`. A new release must not depend on the user manually clearing an old JavaScript module cache to obtain required API methods.

## ADR-024 — Invitation-aware authentication
Invitation links may require authentication, but they must first explain the company, role, and invited email. After login or signup, acceptance is automatic.

## ADR-025 — Storage object before ready metadata
A document version becomes ready only after the object exists in private Storage. Failure cleanup removes the object through the Storage API and then aborts the database reservation.

## ADR-019 — Work Management is Phase 3
Tasks are a core product module, not a small dashboard widget. It receives its own relational model, permission set, navigation, calendar, and execution history.

## ADR-020 — Member and role assignment
A task may have multiple direct members or role assignments. This supports real engineering teams without proliferating custom team tables in the first release.

## ADR-021 — Open work is permission-controlled
Open unassigned tasks are useful, but publishing work to the company is an assignment action. Users without `tasks.assign` may create self-assigned or private tasks only.

## ADR-022 — Recurrence uses series plus occurrences
A series stores the rule; generated tasks remain independent historical occurrences. This supports completion history and future edits without rewriting past work.

## ADR-023 — Attachments use a separate private bucket
Task evidence and collaboration files have different lifecycle and size limits from the document-management source of truth.

---

## ADR — Domain-specific schematic editor instead of a general CAD clone

**Decision:** Build a fast semantic editor for the company's network diagrams.  
**Reason:** The uploaded hand sketches and issued PDFs use a repeatable symbol/route language. A general CAD interface would increase training and error risk.

## ADR — DXF as AutoCAD interchange

**Decision:** Export ASCII DXF R12.  
**Reason:** It is editable by AutoCAD-compatible software without falsely claiming native DWG fidelity or adding a licensed server engine.

## ADR — Semantic JSONB plus server BOQ rows

**Decision:** Store each revision as semantic JSONB and also persist its generated BOQ lines.  
**Reason:** JSONB keeps the editor flexible; normalized BOQ rows support reporting, search, and future analytics.
