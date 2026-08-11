# V7 Feature Parity — Tranche 18

## Purpose
Restore the organization and delivery operating depth that existed in Optimum 6.9 without reverting the V7 visual system or runtime architecture.

## Restored in this tranche

### Member Control 360
- A real management sheet is reachable from People for members the current actor is allowed to manage.
- Reads `member_access_snapshot` and `member_security_snapshot` instead of reconstructing access rules in the browser.
- Restores profile, employee code, title, department, direct/alternate manager, account status, lifecycle stage, employment type, work mode, weekly capacity, experience, skills, primary site and access-window controls.
- Restores organization-unit assignment and default-project/work preference management.
- Preserves current add-ons and scope rules when saving access changes.
- Compensation remains read-only here and is exposed only when the existing compensation permission permits it.

### People bulk operations
- Multi-select members.
- Bulk role change, activate and suspend through the existing atomic RPC contracts.
- A short undo window restores the exact prior role/status snapshot with `bulk_restore_member_access`.
- Owner rows remain outside bulk mutation selection.

### Organization OS depth
- Overview, structure, working-hours and health tabs.
- Workspace setup journey driven by `organization_health_snapshot`.
- Health issues link back to the appropriate V7 operating screen.
- Create/edit organization units with hierarchy/manager/type fields through `save_organization_unit`.
- Working days/hours/timezone/default weekly capacity remain server validated through `save_company_work_settings`.
- Cross-session organization revision polling reloads stale organization state instead of silently presenting outdated control data.

### Site Delivery claim collection
- Claim-package detail now loads server-ranked `site_claim_suggestions`.
- Single suggested evidence can be added using the canonical document reference; no duplicate file is created.
- Auto-collect uses the existing guarded server workflow.
- Existing evidence can be removed while the package is editable.
- Locked/submitted package semantics stay controlled by the existing database RPCs.

## Visual and responsive coverage
`tests/v7-responsive-browser.py` now includes two dedicated Tranche 18 profiles in addition to the existing eleven profiles:
- desktop light RTL
- mobile dark LTR

The fixture exercises member bulk controls, organization journey/health, Member Control and claim collection suggestion layouts.

## Validation contract
- `npm run test:v7` includes `tests/v7-feature-parity-18.0.mjs`.
- `npm run test:release` preserves the complete legacy 4.x–6.9 regression suite plus all V7 parity gates.
- `npm run test:v7:visual` covers 13 responsive profiles.
- TypeScript parser check is used as an additional JSX syntax check for all modified React source files in the assembly workspace.

## Not claimed complete
This tranche does not close all legacy parity. Remaining work includes deeper governance/offboarding/compensation editing, settings/security/connections surfaces, additional CAD/CDE power workflows and final Delivery/People details before production acceptance resumes.
