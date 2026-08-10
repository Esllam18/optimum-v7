# Optimum V7 — Feature Parity Tranche 14

## Decision

Go-live work is paused until product feature parity is restored. V7 keeps its current premium Next.js shell, performance model, Supabase security contract, contextual project backbone, and responsive/RTL behavior. The legacy product remains the domain/feature reference, not the visual reference.

## Restored in this tranche

### Top-level operating areas

- Calendar (`/v7/calendar`)
  - `work_calendar_feed`
  - tasks, milestones, leave, holidays
  - monthly operating grid
  - upcoming agenda
  - 14-day capacity summary when workload permission is available
- Trash (`/v7/trash`)
  - `trash_query`
  - folder restore
  - document restore
  - descendant-aware recovery UX
- Organization OS (`/v7/organization`)
  - active organization hierarchy
  - manager accountability
  - organization health snapshot
  - create organization unit
  - work days / timezone / workday / weekly capacity settings
- Roles & Permissions (`/v7/roles`)
  - company roles
  - permission matrix grouped by module
  - protected Owner behavior
  - `replace_role_permissions`
  - custom role creation
- Activity & Audit (`/v7/activity`)
  - server-side `work_activity_feed`
  - search, action, date filters
  - task/member/role/document/folder/engineering trace labels
- Settings (`/v7/settings`)
  - overview and setup health
  - current user profile
  - company profile fields
  - brand/interface values
  - subscription/plan view
  - direct links to Organization, Roles, Activity
- Advanced Work Operations (`/v7/work-intelligence`)
  - execution cockpit
  - capacity/workload plan
  - dependency/risk graph
  - milestones
  - task templates
  - workflow templates
  - automation rules
  - leave requests

## Language correction

Arabic is no longer treated as a partial translation pass. This tranche localizes the V7 login story and the major hard-coded labels in Work, People, Engineering, Delivery, and all newly restored pages. English remains available as the alternate locale.

## Deployment compatibility retained

- Next.js standalone output stays enabled for Docker/CI.
- Vercel managed deployments omit standalone mode using `VERCEL=1`.
- The Engineering production JSX fix remains applied.

## Still open — next parity tranches

This tranche restores the missing product spine, but does **not** declare complete legacy parity. The next implementation passes must close the remaining deep flows, especially:

1. Work: full task editing/status/checklist/comment/dependency mutations, workflow/template editors, automation editor/test UI, leave approval UI, saved views.
2. CDE: full folder operations, search/filter depth, favorites, review/control workflow, complete version lifecycle, trash administration, upload batch UX.
3. Engineering: full legacy drawing/revision/review/reference/sheet settings and takeoff workflows that are not yet present in native V7.
4. People: lifecycle, manager/alternate manager, units, schedules, skills, access windows, permission overrides and profile administration.
5. Organization/Roles: full edit/delete/version/draft/rollback/add-on/access-governance workflows.
6. Settings: responsible contacts, richer subscription/storage intelligence, security/account controls, appearance/branding asset upload and all old settings sections.
7. Delivery: all package/cabinet/evidence/claim editing and lifecycle actions from 6.9.

Public cutover remains NO-GO until these parity items and authenticated browser regression are closed.
