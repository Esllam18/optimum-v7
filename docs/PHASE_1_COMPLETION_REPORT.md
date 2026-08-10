# Optimum — Phase 1 Completion Report

**Phase:** Foundation  
**Status:** Delivered as a runnable web application and applied Supabase backend foundation  
**Supabase project:** `Optimum` (`wzcaquxuvqfbstpxujsj`)

## Delivered scope

### Company foundation

- Account sign-up, sign-in, sign-out, refresh-token session handling
- User profile created automatically by database trigger
- First-use company onboarding
- Multiple-company membership and company switcher
- Company name, slug, locale, timezone, and theme/profile preferences
- Complete tenant isolation through company-aware RLS policies

### Team and invitations

- Six default protected roles: Owner, Admin, Manager, Engineer, Supervisor, Viewer
- Secure invitation links with hashed tokens and expiry
- Invitation acceptance restricted to the invited email address
- Pending invitation revocation
- Member role and lifecycle management
- Protection against removing or disabling the last active owner

### Permissions

- Role permission matrix
- Per-member Allow / Deny / Default overrides
- Permission-aware navigation and actions
- Database-side permission enforcement; hiding a button is never the security boundary
- Validated RPC write workflows for sensitive operations

### Projects and sites

- Project create, edit, filter, details, and archive
- Site create and edit within a project
- Unique project code per company
- Unique site code per project
- Cross-company project/site validation

### Experience and interface

- Arabic and English
- Proper RTL and LTR layouts
- Separate light, dark, and system themes
- Responsive desktop, tablet, and mobile shell
- Contextual help drawer on every page
- Command palette with `Ctrl/Cmd + K`
- Dialogs, forms, tables, cards, empty states, loading skeletons, and toasts
- Keyboard focus and reduced-motion support

### Audit and safety

- Immutable-by-client activity log
- Automatic audit events for company, role, membership, project, and site changes
- No public anonymous table privileges
- RLS enabled on all 11 application tables
- Private helper functions moved outside the exposed public API schema
- Foreign-key and common-query indexes

## Database delivery

Applied migrations:

1. `20260803190517_foundation_identity_companies_roles_projects`
2. `20260803190536_harden_function_execution_grants`
3. `20260803191944_complete_foundation_security_workflows`
4. `20260803193025_foundation_performance_hardening`
5. `20260803194047_foundation_audit_integrity_fixes`
6. `20260803194240_foundation_role_cascade_fix`
7. `20260803194325_foundation_audit_cascade_fix`

Verification snapshot:

- 11 application tables
- RLS enabled on all 11 tables
- 12 base permissions
- 9 validated public workflow functions
- 5 private authorization/audit helpers
- 0 anonymous grants on application tables

The SQL migration source is included in `supabase/migrations/`. These migrations are already applied to the connected Optimum project and must not be run again there.

## Automated verification completed

- JavaScript syntax checks passed
- Dependency-free application smoke test passed
- Portable server returned HTTP 200
- CSP and security headers verified
- Application JavaScript and CSS delivery verified
- No service-role secret exists in browser code
- Database schema counts, RLS coverage, grants, and migration ledger verified remotely
- Full database workflow acceptance passed with two temporary authenticated users: company creation, six roles, project, site, invitation, acceptance, member permission override, role-permission replacement, and 16 audit events
- All temporary acceptance data was removed; the production project returned to zero users, companies, memberships, projects, sites, and audit events

Run the local checks with:

```bash
npm test
```

## Manual acceptance before public deployment

Before public deployment, complete one short browser acceptance pass with two real email accounts:

1. Sign up and confirm email if confirmation is enabled.
2. Create the Optimum company workspace.
3. Invite the second account and accept the invitation.
4. Change its role and test one permission override.
5. Create a project and a site.
6. Confirm the activity feed and access restrictions.

The database workflow itself has already passed an automated end-to-end acceptance test. This remaining pass checks actual email delivery and browser behavior in the deployment environment. No test rows remain in the production Supabase project.

## Run locally

Fastest tested route:

```bash
npm run portable
```

Open `http://localhost:4173`.

Windows users may double-click `start-portable.bat`.

Next.js development route:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The package installation/build step was not executed in the restricted build environment because its external npm registry was unavailable. The same browser application modules were tested through the included portable server.

## Supabase advisor note

The security advisor lists the nine authenticated `SECURITY DEFINER` workflow functions as warnings. This is intentional: they are the exposed application commands used by signed-in users, and every function validates the caller, company scope, role, token, or permission before making a protected write. Anonymous execution is revoked, direct table writes are restricted, and the complete workflow passed the remote acceptance scenario.

## Phase boundary

Phase 1 is limited to Company, Team, Permissions, Projects, and Sites. Folder trees, file cards, version control, file search, file notifications, and file-specific activity begin in **Phase 2 — Files Workspace**.
