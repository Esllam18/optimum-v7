# Optimum V7 — Checkpoint 14

## Purpose

Checkpoint 14 changes the release priority from **deployment-first** to **feature-parity-first**. The V7 visual system, Next.js runtime, security model, project context, performance discipline, and responsive RTL experience are retained. The 6.9 product remains the authoritative functional baseline until every legacy operating flow is either restored or explicitly superseded by an equivalent V7 workflow.

## Implemented now

- Restored top-level Calendar, Trash, Organization OS, Roles & Permissions, Activity/Audit, and Settings routes.
- Added Advanced Work Operations with cockpit, team capacity, dependency/risk graph, milestones, task templates, workflow templates, automation rules, and leave requests.
- Connected restored pages to existing production Supabase tables/RPC contracts; no mock data or browser-only imitation was introduced.
- Restored the Vercel conditional Next.js output fix and the Engineering JSX production-build fix.
- Expanded Arabic localization across login, Work, People, Engineering, Delivery, and every new parity page.
- Added a permanent feature-parity test gate to `npm run test:v7`.

## Verification

- `npm run test:v7` — PASS.
- `npm run test:v7:visual` — PASS, 11/11 browser CSS smoke profiles, 0px overflow.
- `npm run test:release` — PASS, including the complete 6.9 regression suite and all V7 contracts.
- TypeScript JSX parser sweep across all `src/v7/**/*.js` — 0 parse-error files.

## Important status

This checkpoint is a **real parity tranche, not a declaration of full parity**. Public cutover stays NO-GO. Deep mutation/editor flows still need to be restored feature-by-feature for Work, CDE, CAD, People, Organization/Roles, Settings, and Delivery. See `docs/V7_FEATURE_PARITY_14.md`.
