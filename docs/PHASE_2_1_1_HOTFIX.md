# Optimum Phase 2.1.1 — Invitation & Loading Hotfix

## Fixed

- Prevented an invitation opened under the wrong signed-in email from leaving the app on an endless loading skeleton.
- Added a clear conflict screen showing the current email and invited email.
- Added two safe choices:
  - Ignore the invitation and continue to the current workspace.
  - Sign out and continue with the invited email.
- Added an 18-second loading watchdog and a recovery screen instead of an infinite skeleton.
- Added retry, continue-without-invitation, and sign-out recovery actions.
- Added global handling for unexpected startup promise and rendering failures.
- Bumped all browser asset versions to 2.1.1 to avoid stale cache.

## Immediate cause

The invitation token remained in browser localStorage while the browser was signed in with a different email. The previous UI repeatedly attempted to accept that invitation and did not provide a safe recovery path.
