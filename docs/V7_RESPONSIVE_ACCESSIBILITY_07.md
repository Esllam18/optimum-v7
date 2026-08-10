# Optimum V7 — Responsive, Readability & Accessibility Closure

Date: 2026-08-10  
Checkpoint target: 09

## Objective
Close the visual-quality gaps that would make a technically correct SaaS still feel cramped, difficult to scan, or unreliable on real devices. This pass focuses on readable typography, responsive decision surfaces, light-theme contrast, keyboard accessibility, RTL correctness, and browser-rendered layout verification without changing the established V7 business workflows or Production database schema.

## Readability audit
The inherited/accumulated V7 stylesheet still contained a large amount of micro typography before the effective overrides in this pass. The pre-pass audit found 203 explicit pixel `font-size` declarations, with 144 at 10 px or below. The densest legacy values were 8–10 px.

The correction deliberately avoids rewriting the entire stylesheet during a release-hardening pass. Instead, the effective product surfaces now enforce a readable floor for operational text while preserving compact engineering metadata where density is genuinely useful.

Effective changes include:
- page descriptions around 14 px
- panel headings around 17 px
- panel descriptions around 12 px
- action/back links around 12 px
- badges around 11 px
- stat labels around 12 px
- list primary content around 12–13 px
- project card headings around 17 px
- project metadata around 10–12 px
- search/select/segment controls around 12 px
- 40 px minimum primary/icon action height.

The CAD workspace remains intentionally denser than the normal SaaS surfaces, but essential 7–8 px engineering labels were lifted into a more readable 9–10.5 px range.

## Responsive decision surfaces
Work, People and Delivery previously depended on wide rows that effectively became horizontal tables at tablet/mobile widths. That behavior was removed from the effective responsive layer.

### Work
At tablet/mobile widths each task becomes a contextual card with:
- title and status
- project/site/document context
- due information.

At narrow mobile widths the card stacks into a single-column reading order rather than forcing horizontal scrolling.

### People
The member directory becomes a card with explicit areas for:
- avatar/person
- status
- role
- scope
- navigation affordance.

Server-side pagination/search remains unchanged; this is a presentation improvement, not a return to client-side bulk loading.

### Delivery
Claim-package rows become responsive cards exposing:
- package identity
- status
- version mode
- last update
- navigation affordance.

Search/status filtering remains server-side through `delivery_directory_query`.

### Mobile information preservation
Work titles, People names and Delivery package titles are allowed to wrap to a controlled two-line presentation on narrow screens instead of being prematurely hidden by a single-line ellipsis.

## Light-theme contrast
A contrast audit identified `--v7-muted-2` in the light theme as too faint for small operational text. The token was strengthened while retaining the visual hierarchy:
- dark effective muted-2: `#6f849d`
- light effective muted-2: `#5f7085`.

This improves legibility without turning secondary metadata into primary visual weight.

## Keyboard and interaction accessibility
The pass adds/strengthens:
- visible `:focus-visible` rings for interactive controls
- `prefers-reduced-motion: reduce`
- focus visibility for the company switcher
- `type="button"` as the safe default for the V7 Button primitive
- explicit `type="submit"` where form submission is intentional
- localized `aria-label` coverage for icon-only shell/login actions.

This prevents accidental form submits and makes icon-only controls understandable beyond hover/title behavior.

## RTL / bidirectional-number correctness
Browser inspection in Arabic/light mode exposed a real bidirectional rendering bug: ratios such as `5 / 25` and `18 / 80` could appear visually reversed inside RTL text flow.

Capacity ratios are now explicitly isolated with LTR direction / Unicode bidi isolation. This is not a cosmetic tweak; it prevents the user from reading plan usage backwards in Arabic.

## Browser-rendered layout verification
A dedicated browser fixture was added:
- `tests/visual/v7-layout-fixture.html`
- `tests/v7-responsive-browser.py`
- npm script: `test:v7:visual`.

It loads the real `src/v7/v7.css` and representative V7 DOM structures in Chromium through Playwright. This verifies the design-system/layout behavior even though the current execution environment cannot install the missing Next production dependency tree.

Final matrix after the RTL fix:
- Desktop 1440x1050 — dark / LTR — PASS
- Desktop 1440x1050 — light / RTL — PASS
- Tablet 820x1050 — dark / RTL — PASS
- Mobile 390x844 — dark / LTR — PASS
- Mobile 390x844 — light / RTL — PASS

For every matrix case:
- horizontal document overflow = 0 px
- Work / People / Delivery decision rows remain inside the viewport
- key effective font floors pass the browser assertions
- the company switcher remains interactive.

**Scope note:** this is real Chromium CSS/DOM layout testing, but it is not being represented as a successful live Next V7 application run. The real Next runtime/browser gate remains open until the dependency/build environment is restored.

## Automated contracts added
The following contracts are now part of `test:v7`:
- `tests/v7-readability-responsive-7.0.mjs`
- `tests/v7-accessibility-polish-7.0.mjs`
- `tests/v7-interaction-accessibility-7.0.mjs`
- `tests/v7-rtl-bidi-7.0.mjs`.

Final verification for this checkpoint:
- `npm run test:v7:visual` — PASS
- `npm run test:v7` — PASS
- `npm run test:release` — PASS after the functional code changes in this pass (V6.9 regression + V7 contracts).

## Database impact
No new Production database migration or DDL was applied in this round. The seven previously approved V7 Production migrations remain the complete V7 migration set at Checkpoint 09.

## Build gate
The production Next build is still blocked before application compilation:
- working `next` binary is absent from the current dependency tree
- the internal package registry previously returned 404 for `tslib-2.8.1.tgz`
- direct public npm registry probes timed out / binary tarball retrieval is unavailable in the current execution environment.

No build success is claimed. Once a healthy dependency environment is available, the next required gate is a real `next build` followed by live-route browser/pixel QA using the actual V7 application rather than the isolated design fixture.
