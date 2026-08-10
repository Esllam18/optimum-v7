-- Phase 5.2 tenant-integrity hardening for HR and identity data
create or replace function app_private.validate_member_compensation_scope()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_company uuid;
begin
  select company_id into v_company from public.company_memberships where id=new.membership_id;
  if v_company is null or v_company<>new.company_id then raise exception 'Compensation company scope mismatch'; end if;
  return new;
end $$;

drop trigger if exists validate_member_compensation_scope on public.member_compensation;
create trigger validate_member_compensation_scope before insert or update on public.member_compensation for each row execute function app_private.validate_member_compensation_scope();
revoke all on function app_private.validate_member_compensation_scope() from public,anon,authenticated;

drop policy if exists profiles_select_managed_company_members on public.profiles;
create policy profiles_select_managed_company_members on public.profiles for select to authenticated
using (
  id=auth.uid() or exists(
    select 1 from public.company_memberships target
    where target.user_id=profiles.id
      and app_private.has_company_permission(target.company_id,'members.view')
  )
);

create index if not exists memberships_company_status_user_idx on public.company_memberships(company_id,status,user_id);
create index if not exists compensation_membership_company_idx on public.member_compensation(membership_id,company_id);
