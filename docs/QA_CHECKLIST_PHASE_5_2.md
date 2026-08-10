# QA Checklist — Phase 5.2

## Platform Console

- [ ] Sign in with the Optimum platform-owner account.
- [ ] Create a company with a logo and verify credentials still appear if optional logo upload fails.
- [ ] Open the company directory and verify company logo, member photos, and salary columns.
- [ ] Change a company's colors and confirm they appear in the client application after refresh.
- [ ] Create, edit, recommend, disable, and delete a global role template.
- [ ] Confirm a non-platform user cannot open the Platform Console or modify templates.

## Company application

- [ ] Confirm public signup is still absent.
- [ ] Sign in as company owner and open Settings → Company Identity.
- [ ] Upload a logo and change primary/accent colors, sidebar style, corner style, and density.
- [ ] Refresh and confirm the identity persists.
- [ ] Create an employee with a photo, employment data, salary, and a role.
- [ ] Confirm credentials appear once and first-login password change remains mandatory.
- [ ] Confirm a user without `compensation.view` cannot see salary values.
- [ ] Create a custom role from a template and modify its permissions.
- [ ] Use full-module permission toggles and individual permission toggles.
- [ ] Delete a custom role and reassign its members.
- [ ] Confirm the protected Owner role cannot be deleted.

## Regression

- [ ] Run `npm test`.
- [ ] Start client app on port 4173 and Platform Console on 4174.
- [ ] Verify CAD drawing open/save/export tests remain green.
- [ ] Confirm no `service_role` secret exists in browser bundles.
- [ ] Run Supabase security and performance advisors after migrations.
