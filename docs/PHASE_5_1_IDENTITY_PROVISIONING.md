# Phase 5.1 — Identity, Provisioning & First Login

## Scope

Phase 5.1 separates platform administration from the client workspace and replaces self-registration with controlled account provisioning.

## Client application

- Login only; no public signup.
- Password recovery by email.
- Forced first-login security screen before any company data loads.
- Full employee-account provisioning by authorized company administrators.
- Employment data, role, permission overrides, direct manager, access period and notes.
- One-time temporary credentials and account activation state.
- Temporary-password reissue from the team directory.

## Platform Console

The console is available as a standalone web process at `http://localhost:4174` and is also served at `/platform` by the main app for development convenience. It includes:

- Platform-admin-only login and authorization check.
- Company overview metrics and status filters.
- Four-step company provisioning wizard.
- Company identity, legal records, primary/billing/technical contacts, plan, usage limits, billing and payment data.
- Immediate owner account creation with mandatory first-login password change.
- Company account directory and temporary-password reset.
- Company/subscription editing and platform audit history.

## Security model

- Browser applications use only the Supabase publishable key.
- Auth user creation and password reset are performed by the `identity-provisioning` Edge Function.
- The Edge Function requires a valid JWT and verifies platform/company permissions for each action.
- Temporary passwords are generated cryptographically and are never stored in plaintext.
- `account_security` blocks workspace loading until first-login completion.
- The trusted service RPC completes profile/security state only after the Edge Function changes the Auth password.
- Anonymous execution of engineering review mutation RPCs is revoked.

## Optional email delivery

Automatic credential email delivery activates when these Edge Function secrets are configured:

- `RESEND_API_KEY`
- `OPTIMUM_FROM_EMAIL`
- `OPTIMUM_CLIENT_LOGIN_URL`

Without them, the UI still shows credentials once and provides secure copy and email-compose actions.
