# Optimum Hotfix 2.1.2

## Issue
After successful authentication, the dashboard renderer called `activityList(...)` but the helper was missing. This caused `activityList is not defined`, leaving the user on the sign-in screen even though the session had been created successfully.

## Fix
- Added the missing activity timeline renderer.
- Added bilingual labels and safe fallbacks for unknown audit actions.
- Added empty-state handling for companies with no activity.
- Updated cache-busting identifiers to `2.1.2`.
- Added a regression assertion to the smoke test so this exact bug cannot ship unnoticed again.

No database migration is required.
