# V7 Feature Parity — Tranche 19

Tranche 19 restores governance, controlled offboarding, compensation editing, and security/settings depth from the 6.9 operating model inside the V7 interface.

## Restored product capabilities

- **Member compensation**: authorized users can edit salary, currency, pay frequency, effective date, allowances, bonus target, and compensation notes through the existing atomic member-control RPC.
- **Controlled offboarding**: calculate impact first, select a valid handover target, transfer open work/custody, require a second owner when policy demands it, then execute the approved plan.
- **Governance policy**: company owners can configure second approval for high-risk access changes and offboarding, plus the explicit high-risk permission set.
- **Approval queue**: pending access/offboarding requests are visible in Control, with independent owner approve/reject actions and self-approval prevention reflected in the UI.
- **Settings depth**: company contacts and onboarding metadata, current account-security state, runtime health, schema-head visibility, and platform connection status without exposing credentials or secrets.
- **Arabic/RTL**: the restored flows have complete Arabic labels and responsive RTL-safe layouts.

## Data contracts

No new database migration is required. Tranche 19 uses existing production contracts including `save_member_control_profile`, `prepare_member_offboarding`, `execute_member_offboarding`, `save_access_governance_settings`, and `review_access_change_request`.

Production schema head remains `20260810221851`.

## Gate

`tests/v7-feature-parity-19.0.mjs` is part of `npm run test:v7`. The responsive browser matrix also includes dedicated governance/offboarding/security desktop RTL and mobile LTR fixtures.
