begin;

drop policy if exists roles_manage on public.roles;
drop policy if exists role_permissions_manage on public.role_permissions;
drop policy if exists memberships_manage on public.company_memberships;
drop policy if exists overrides_manage on public.member_permission_overrides;
drop policy if exists invitations_insert_manage on public.company_invitations;
drop policy if exists invitations_update_manage on public.company_invitations;

alter policy profiles_select_self_or_colleague on public.profiles using (
  id=(select auth.uid()) or exists(
    select 1 from public.company_memberships me
    join public.company_memberships them on them.company_id=me.company_id
    where me.user_id=(select auth.uid()) and me.status='active'
      and them.user_id=profiles.id and them.status='active'
  )
);
alter policy profiles_update_self on public.profiles using(id=(select auth.uid())) with check(id=(select auth.uid()));
alter policy projects_insert on public.projects with check(app_private.has_company_permission(company_id,'projects.create') and created_by=(select auth.uid()));
alter policy sites_insert on public.sites with check(
  app_private.has_company_permission(company_id,'projects.create')
  and created_by=(select auth.uid())
  and exists(select 1 from public.projects p where p.id=project_id and p.company_id=sites.company_id)
);

create index if not exists audit_events_actor_idx on public.audit_events(actor_id);
create index if not exists companies_created_by_idx on public.companies(created_by);
create index if not exists invitations_accepted_by_idx on public.company_invitations(accepted_by) where accepted_by is not null;
create index if not exists invitations_invited_by_idx on public.company_invitations(invited_by);
create index if not exists invitations_role_idx on public.company_invitations(role_id);
create index if not exists memberships_role_idx on public.company_memberships(role_id);
create index if not exists overrides_permission_idx on public.member_permission_overrides(permission_key);
create index if not exists projects_created_by_idx on public.projects(created_by);
create index if not exists role_permissions_permission_idx on public.role_permissions(permission_key);
create index if not exists sites_company_idx on public.sites(company_id);
create index if not exists sites_created_by_idx on public.sites(created_by);

commit;
