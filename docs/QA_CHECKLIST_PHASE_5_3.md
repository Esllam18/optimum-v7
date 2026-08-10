# Phase 5.3 QA Checklist

## Company provisioning

- [ ] Open the Platform Console on port 4174.
- [ ] Create a company with a unique slug and owner email.
- [ ] Confirm the result shows the owner email and temporary password.
- [ ] Confirm the company appears in the directory after refresh.
- [ ] Confirm the owner can sign in on port 4173 and is forced to change the temporary password.
- [ ] Confirm the owner sees only the new company after first-login completion.

## Member provisioning

- [ ] Open Team and choose Create member.
- [ ] Confirm all non-Owner roles appear as cards with permission counts.
- [ ] Select a role and fill the required name/email fields.
- [ ] Optionally upload a valid PNG/JPG/WebP image under 5 MB.
- [ ] Create the account and confirm temporary credentials are shown once.
- [ ] Confirm the member appears in Team with the correct role and profile data.
- [ ] Confirm a pre-existing Optimum email is joined without receiving a replacement password.

## Role Studio

- [ ] Create a custom role from scratch and select at least three permissions.
- [ ] Confirm the saved card reports the same permission count.
- [ ] Edit the role, add/remove permissions, save, and confirm the count changes.
- [ ] Confirm saving zero permissions is blocked with a readable message.
- [ ] In Platform Console, repeat the same test for a global role template.
- [ ] Create a company role from a global template and confirm permissions are copied.

## Identity and settings

- [ ] Upload a company logo and save branding.
- [ ] Confirm logo, application name, colors, theme, sidebar style, density, and radius update across the client application.
- [ ] Update legal/contact/tax/timezone/locale company data.
- [ ] Leave and reopen Settings; confirm the values persist.
- [ ] Confirm plan/usage shows plan name, members, projects, storage, status, and dates.

## Activity

- [ ] Confirm role, member, company, and settings operations appear in the company activity center.
- [ ] Search by action or metadata.
- [ ] Filter by actor, module, and date.
- [ ] Open an event and inspect metadata.
- [ ] In Platform Console, filter by company/action/date and export CSV.

## Security

- [ ] Confirm no public signup is displayed.
- [ ] Confirm a normal company member cannot open Platform Console.
- [ ] Confirm a user without role-management permission cannot save roles.
- [ ] Confirm salary data is hidden without `compensation.view`.
- [ ] Confirm identity files are inaccessible outside the tenant.
- [ ] Enable leaked-password protection in Supabase Auth before production.
