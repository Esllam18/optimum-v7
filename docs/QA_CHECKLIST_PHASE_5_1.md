# QA Checklist — Phase 5.1

- [x] Public signup absent from client and platform login pages.
- [x] Forgot-password flow is present.
- [x] Recovery callback opens the password setup screen.
- [x] New provisioned accounts cannot load company data before password change.
- [x] First-login password change is performed by the trusted Edge Function.
- [x] Company owner can provision members with role and permission overrides.
- [x] Temporary password is displayed once and can be reissued.
- [x] Platform Console has a standalone server/launcher on port 4174 and a separate browser bundle.
- [x] Platform Console verifies an active `platform_admins` record.
- [x] Company wizard captures identity, legal, billing, technical-contact, subscription and owner data.
- [x] Existing email accounts are linked without replacing their current password.
- [x] Browser bundles contain no service-role key.
- [x] Portable `/`, `/platform`, and `/assets/platform.js` return HTTP 200.
- [x] All regression tests from Phase 4.11 through Phase 5.1 pass.
