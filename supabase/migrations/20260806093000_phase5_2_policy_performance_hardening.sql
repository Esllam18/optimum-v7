-- Phase 5.2 policy and index hardening after Supabase advisor review.

create index if not exists role_template_permissions_permission_key_idx
  on public.role_template_permissions(permission_key);

-- Cache auth.uid() once per statement in RLS policies.
drop policy if exists account_security_select_visible on public.account_security;
create policy account_security_select_visible
on public.account_security for select to authenticated
using (
  user_id = (select auth.uid())
  or app_private.is_platform_admin()
  or exists (
    select 1
    from public.company_memberships target
    where target.user_id = account_security.user_id
      and app_private.has_company_permission(target.company_id,'members.view')
  )
);

-- Keep a single SELECT policy for profiles and include authorized member managers.
drop policy if exists profiles_select_self_or_colleague on public.profiles;
drop policy if exists profiles_select_managed_company_members on public.profiles;
create policy profiles_select_self_colleague_or_managed
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.company_memberships me
    join public.company_memberships them on them.company_id = me.company_id
    where me.user_id = (select auth.uid())
      and me.status = 'active'
      and them.user_id = profiles.id
      and them.status = 'active'
  )
  or exists (
    select 1
    from public.company_memberships target
    where target.user_id = profiles.id
      and app_private.has_company_permission(target.company_id,'members.view')
  )
);

-- Avoid SELECT overlap from FOR ALL policies by separating writes.
drop policy if exists company_branding_manage on public.company_branding;
create policy company_branding_insert
on public.company_branding for insert to authenticated
with check (app_private.has_company_permission(company_id,'branding.manage') or app_private.is_platform_admin());
create policy company_branding_update
on public.company_branding for update to authenticated
using (app_private.has_company_permission(company_id,'branding.manage') or app_private.is_platform_admin())
with check (app_private.has_company_permission(company_id,'branding.manage') or app_private.is_platform_admin());
create policy company_branding_delete
on public.company_branding for delete to authenticated
using (app_private.has_company_permission(company_id,'branding.manage') or app_private.is_platform_admin());

drop policy if exists compensation_manage on public.member_compensation;
create policy compensation_insert
on public.member_compensation for insert to authenticated
with check (app_private.has_company_permission(company_id,'compensation.manage') or app_private.is_platform_admin());
create policy compensation_update
on public.member_compensation for update to authenticated
using (app_private.has_company_permission(company_id,'compensation.manage') or app_private.is_platform_admin())
with check (app_private.has_company_permission(company_id,'compensation.manage') or app_private.is_platform_admin());
create policy compensation_delete
on public.member_compensation for delete to authenticated
using (app_private.has_company_permission(company_id,'compensation.manage') or app_private.is_platform_admin());

drop policy if exists role_templates_manage on public.role_templates;
create policy role_templates_insert
on public.role_templates for insert to authenticated
with check (app_private.is_platform_admin());
create policy role_templates_update
on public.role_templates for update to authenticated
using (app_private.is_platform_admin()) with check (app_private.is_platform_admin());
create policy role_templates_delete
on public.role_templates for delete to authenticated
using (app_private.is_platform_admin());

drop policy if exists role_template_permissions_manage on public.role_template_permissions;
create policy role_template_permissions_insert
on public.role_template_permissions for insert to authenticated
with check (app_private.is_platform_admin());
create policy role_template_permissions_update
on public.role_template_permissions for update to authenticated
using (app_private.is_platform_admin()) with check (app_private.is_platform_admin());
create policy role_template_permissions_delete
on public.role_template_permissions for delete to authenticated
using (app_private.is_platform_admin());
