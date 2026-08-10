begin;

create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated;

create or replace function app_private.is_company_member(p_company_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.company_memberships m
    where m.company_id=p_company_id and m.user_id=auth.uid() and m.status='active'
  );
$$;

create or replace function app_private.has_company_permission(p_company_id uuid,p_permission text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_memberships m
    join public.roles r on r.id=m.role_id and r.company_id=m.company_id
    left join public.member_permission_overrides o on o.membership_id=m.id and o.permission_key=p_permission
    left join public.role_permissions rp on rp.role_id=r.id and rp.permission_key=p_permission
    where m.company_id=p_company_id and m.user_id=auth.uid() and m.status='active'
      and coalesce(o.allowed,rp.allowed,false)=true
  );
$$;

create or replace function app_private.is_company_owner(p_company_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.company_memberships m join public.roles r on r.id=m.role_id
    where m.company_id=p_company_id and m.user_id=p_user_id and m.status='active' and r.slug='owner'
  );
$$;

revoke all on function app_private.is_company_member(uuid) from public,anon;
revoke all on function app_private.has_company_permission(uuid,text) from public,anon;
revoke all on function app_private.is_company_owner(uuid,uuid) from public,anon;
grant execute on function app_private.is_company_member(uuid) to authenticated;
grant execute on function app_private.has_company_permission(uuid,text) to authenticated;
grant execute on function app_private.is_company_owner(uuid,uuid) to authenticated;

alter policy companies_select_member on public.companies using(app_private.is_company_member(id));
alter policy companies_update_manage on public.companies using(app_private.has_company_permission(id,'company.manage')) with check(app_private.has_company_permission(id,'company.manage'));
alter policy roles_select_member on public.roles using(app_private.is_company_member(company_id));
alter policy roles_manage on public.roles using(app_private.has_company_permission(company_id,'roles.manage')) with check(app_private.has_company_permission(company_id,'roles.manage'));
alter policy role_permissions_select_member on public.role_permissions using(exists(select 1 from public.roles r where r.id=role_id and app_private.is_company_member(r.company_id)));
alter policy role_permissions_manage on public.role_permissions using(exists(select 1 from public.roles r where r.id=role_id and app_private.has_company_permission(r.company_id,'roles.manage'))) with check(exists(select 1 from public.roles r where r.id=role_id and app_private.has_company_permission(r.company_id,'roles.manage')));
alter policy memberships_select_member on public.company_memberships using(app_private.is_company_member(company_id));
alter policy memberships_manage on public.company_memberships using(app_private.has_company_permission(company_id,'members.manage')) with check(app_private.has_company_permission(company_id,'members.manage'));
alter policy overrides_select_member on public.member_permission_overrides using(exists(select 1 from public.company_memberships m where m.id=membership_id and app_private.is_company_member(m.company_id)));
alter policy overrides_manage on public.member_permission_overrides using(exists(select 1 from public.company_memberships m where m.id=membership_id and app_private.has_company_permission(m.company_id,'members.manage'))) with check(exists(select 1 from public.company_memberships m where m.id=membership_id and app_private.has_company_permission(m.company_id,'members.manage')));
alter policy invitations_select_manage on public.company_invitations using(app_private.has_company_permission(company_id,'members.view'));
alter policy invitations_insert_manage on public.company_invitations with check(app_private.has_company_permission(company_id,'members.invite') and invited_by=auth.uid());
alter policy invitations_update_manage on public.company_invitations using(app_private.has_company_permission(company_id,'members.manage')) with check(app_private.has_company_permission(company_id,'members.manage'));
alter policy projects_select on public.projects using(app_private.has_company_permission(company_id,'projects.view'));
alter policy projects_insert on public.projects with check(app_private.has_company_permission(company_id,'projects.create') and created_by=auth.uid());
alter policy projects_update on public.projects using(app_private.has_company_permission(company_id,'projects.edit')) with check(app_private.has_company_permission(company_id,'projects.edit'));
alter policy sites_select on public.sites using(app_private.has_company_permission(company_id,'projects.view'));
alter policy sites_insert on public.sites with check(app_private.has_company_permission(company_id,'projects.create') and created_by=auth.uid() and exists(select 1 from public.projects p where p.id=project_id and p.company_id=sites.company_id));
alter policy sites_update on public.sites using(app_private.has_company_permission(company_id,'projects.edit')) with check(app_private.has_company_permission(company_id,'projects.edit') and exists(select 1 from public.projects p where p.id=project_id and p.company_id=sites.company_id));
alter policy audit_select on public.audit_events using(app_private.has_company_permission(company_id,'audit.view'));

revoke all on function public.is_company_member(uuid) from public,anon,authenticated;
revoke all on function public.has_company_permission(uuid,text) from public,anon,authenticated;
drop function public.is_company_member(uuid);
drop function public.has_company_permission(uuid,text);

alter table public.company_memberships add constraint company_memberships_profile_fkey foreign key(user_id) references public.profiles(id) on delete cascade;
alter table public.audit_events add constraint audit_events_actor_profile_fkey foreign key(actor_id) references public.profiles(id) on delete set null;

create or replace function app_private.write_audit_event()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_company_id uuid;v_entity_id uuid;v_old jsonb;v_new jsonb;
begin
  v_old:=case when tg_op in('UPDATE','DELETE') then to_jsonb(old) else null end;
  v_new:=case when tg_op in('INSERT','UPDATE') then to_jsonb(new) else null end;
  v_company_id:=coalesce((v_new->>'company_id')::uuid,(v_old->>'company_id')::uuid);
  v_entity_id:=coalesce((v_new->>'id')::uuid,(v_old->>'id')::uuid);
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(v_company_id,auth.uid(),lower(tg_table_name||'.'||tg_op),tg_table_name,v_entity_id,jsonb_strip_nulls(jsonb_build_object('before',v_old,'after',v_new)));
  return coalesce(new,old);
end;
$$;
revoke all on function app_private.write_audit_event() from public,anon,authenticated;
create trigger companies_audit after update on public.companies for each row execute function app_private.write_audit_event();
create trigger roles_audit after insert or update or delete on public.roles for each row execute function app_private.write_audit_event();
create trigger memberships_audit after insert or update or delete on public.company_memberships for each row execute function app_private.write_audit_event();
create trigger projects_audit after insert or update or delete on public.projects for each row execute function app_private.write_audit_event();
create trigger sites_audit after insert or update or delete on public.sites for each row execute function app_private.write_audit_event();

create or replace function app_private.protect_core_roles()
returns trigger language plpgsql set search_path=public,pg_temp
as $$
begin
  if old.is_protected and tg_op='DELETE' then raise exception 'Protected roles cannot be deleted'; end if;
  if old.is_protected and tg_op='UPDATE' and(new.slug<>old.slug or new.company_id<>old.company_id or new.is_protected=false) then raise exception 'Protected role identity cannot be changed'; end if;
  return coalesce(new,old);
end;
$$;
revoke all on function app_private.protect_core_roles() from public,anon,authenticated;
create trigger roles_protect before update or delete on public.roles for each row execute function app_private.protect_core_roles();

create or replace function public.create_company_invitation(p_company_id uuid,p_email text,p_role_id uuid,p_expires_in_hours integer default 168)
returns text language plpgsql security definer set search_path=public,auth,extensions,pg_temp
as $$
declare v_token text;v_email text;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;
  if not app_private.has_company_permission(p_company_id,'members.invite') then raise exception 'Permission denied';end if;
  if p_expires_in_hours<1 or p_expires_in_hours>720 then raise exception 'Invalid expiry';end if;
  if not exists(select 1 from public.roles where id=p_role_id and company_id=p_company_id) then raise exception 'Invalid role';end if;
  v_email:=lower(trim(p_email));
  if v_email!~'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Invalid email';end if;
  if exists(select 1 from public.company_memberships m join auth.users u on u.id=m.user_id where m.company_id=p_company_id and lower(u.email)=v_email and m.status='active') then raise exception 'User is already a member';end if;
  update public.company_invitations set status='revoked' where company_id=p_company_id and email=v_email and status='pending';
  v_token:=encode(gen_random_bytes(32),'hex');
  insert into public.company_invitations(company_id,email,role_id,token_hash,status,invited_by,expires_at)
  values(p_company_id,v_email,p_role_id,encode(digest(v_token,'sha256'),'hex'),'pending',auth.uid(),now()+make_interval(hours=>p_expires_in_hours));
  insert into public.audit_events(company_id,actor_id,action,entity_type,metadata) values(p_company_id,auth.uid(),'invitation.created','company_invitation',jsonb_build_object('email',v_email,'role_id',p_role_id));
  return v_token;
end;
$$;

create or replace function public.accept_company_invitation(p_token text)
returns uuid language plpgsql security definer set search_path=public,auth,extensions,pg_temp
as $$
declare v_inv public.company_invitations%rowtype;v_email text;v_membership_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;
  select lower(email) into v_email from auth.users where id=auth.uid();
  if v_email is null then raise exception 'User email unavailable';end if;
  select * into v_inv from public.company_invitations where token_hash=encode(digest(p_token,'sha256'),'hex') and status='pending' and expires_at>now() for update;
  if not found then raise exception 'Invitation is invalid or expired';end if;
  if lower(v_inv.email)<>v_email then raise exception 'Invitation belongs to another email';end if;
  insert into public.company_memberships(company_id,user_id,role_id,status,joined_at)
  values(v_inv.company_id,auth.uid(),v_inv.role_id,'active',now())
  on conflict(company_id,user_id) do update set role_id=excluded.role_id,status='active',joined_at=coalesce(public.company_memberships.joined_at,now()),updated_at=now()
  returning id into v_membership_id;
  update public.company_invitations set status='accepted',accepted_by=auth.uid(),accepted_at=now() where id=v_inv.id;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(v_inv.company_id,auth.uid(),'invitation.accepted','company_membership',v_membership_id,jsonb_build_object('invitation_id',v_inv.id));
  return v_inv.company_id;
end;
$$;

create or replace function public.revoke_company_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_company_id uuid;
begin
  select company_id into v_company_id from public.company_invitations where id=p_invitation_id and status='pending';
  if v_company_id is null then raise exception 'Pending invitation not found';end if;
  if not app_private.has_company_permission(v_company_id,'members.manage') then raise exception 'Permission denied';end if;
  update public.company_invitations set status='revoked' where id=p_invitation_id;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id) values(v_company_id,auth.uid(),'invitation.revoked','company_invitation',p_invitation_id);
end;
$$;

create or replace function public.set_member_role(p_membership_id uuid,p_role_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_company_id uuid;v_target_user uuid;v_old_owner boolean;v_new_owner boolean;v_owner_count integer;
begin
  select m.company_id,m.user_id,(r.slug='owner') into v_company_id,v_target_user,v_old_owner from public.company_memberships m join public.roles r on r.id=m.role_id where m.id=p_membership_id;
  if v_company_id is null then raise exception 'Member not found';end if;
  if not app_private.has_company_permission(v_company_id,'members.manage') then raise exception 'Permission denied';end if;
  select(slug='owner') into v_new_owner from public.roles where id=p_role_id and company_id=v_company_id;
  if v_new_owner is null then raise exception 'Invalid role';end if;
  if v_new_owner and not app_private.is_company_owner(v_company_id,auth.uid()) then raise exception 'Only an owner can assign owner role';end if;
  if v_old_owner and not v_new_owner then
    select count(*) into v_owner_count from public.company_memberships m join public.roles r on r.id=m.role_id where m.company_id=v_company_id and m.status='active' and r.slug='owner';
    if v_owner_count<=1 then raise exception 'Company must keep at least one owner';end if;
  end if;
  update public.company_memberships set role_id=p_role_id where id=p_membership_id;
end;
$$;

create or replace function public.set_member_status(p_membership_id uuid,p_status public.membership_status)
returns void language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_company_id uuid;v_is_owner boolean;v_owner_count integer;
begin
  select m.company_id,(r.slug='owner') into v_company_id,v_is_owner from public.company_memberships m join public.roles r on r.id=m.role_id where m.id=p_membership_id;
  if v_company_id is null then raise exception 'Member not found';end if;
  if not app_private.has_company_permission(v_company_id,'members.manage') then raise exception 'Permission denied';end if;
  if v_is_owner and p_status<>'active' then
    select count(*) into v_owner_count from public.company_memberships m join public.roles r on r.id=m.role_id where m.company_id=v_company_id and m.status='active' and r.slug='owner';
    if v_owner_count<=1 then raise exception 'Company must keep at least one active owner';end if;
  end if;
  update public.company_memberships set status=p_status,joined_at=case when p_status='active' then coalesce(joined_at,now()) else joined_at end where id=p_membership_id;
end;
$$;

create or replace function public.set_member_permission_override(p_membership_id uuid,p_permission_key text,p_allowed boolean)
returns void language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_company_id uuid;
begin
  select company_id into v_company_id from public.company_memberships where id=p_membership_id;
  if v_company_id is null then raise exception 'Member not found';end if;
  if not app_private.has_company_permission(v_company_id,'members.manage') then raise exception 'Permission denied';end if;
  if not exists(select 1 from public.permissions where key=p_permission_key) then raise exception 'Invalid permission';end if;
  insert into public.member_permission_overrides(membership_id,permission_key,allowed) values(p_membership_id,p_permission_key,p_allowed)
  on conflict(membership_id,permission_key) do update set allowed=excluded.allowed;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(v_company_id,auth.uid(),'member.permission_override','company_membership',p_membership_id,jsonb_build_object('permission',p_permission_key,'allowed',p_allowed));
end;
$$;

create or replace function public.clear_member_permission_override(p_membership_id uuid,p_permission_key text)
returns void language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_company_id uuid;
begin
  select company_id into v_company_id from public.company_memberships where id=p_membership_id;
  if v_company_id is null then raise exception 'Member not found';end if;
  if not app_private.has_company_permission(v_company_id,'members.manage') then raise exception 'Permission denied';end if;
  delete from public.member_permission_overrides where membership_id=p_membership_id and permission_key=p_permission_key;
end;
$$;

create or replace function public.replace_role_permissions(p_role_id uuid,p_permission_keys text[])
returns void language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_company_id uuid;v_slug text;
begin
  select company_id,slug into v_company_id,v_slug from public.roles where id=p_role_id;
  if v_company_id is null then raise exception 'Role not found';end if;
  if not app_private.has_company_permission(v_company_id,'roles.manage') then raise exception 'Permission denied';end if;
  if v_slug='owner' then raise exception 'Owner permissions are fixed';end if;
  if exists(select 1 from unnest(p_permission_keys) k where not exists(select 1 from public.permissions p where p.key=k)) then raise exception 'Invalid permission key';end if;
  delete from public.role_permissions where role_id=p_role_id;
  insert into public.role_permissions(role_id,permission_key,allowed) select p_role_id,k,true from unnest(coalesce(p_permission_keys,array[]::text[])) k;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(v_company_id,auth.uid(),'role.permissions_replaced','role',p_role_id,jsonb_build_object('permissions',p_permission_keys));
end;
$$;

revoke all on function public.create_company_invitation(uuid,text,uuid,integer) from public,anon;
revoke all on function public.accept_company_invitation(text) from public,anon;
revoke all on function public.revoke_company_invitation(uuid) from public,anon;
revoke all on function public.set_member_role(uuid,uuid) from public,anon;
revoke all on function public.set_member_status(uuid,public.membership_status) from public,anon;
revoke all on function public.set_member_permission_override(uuid,text,boolean) from public,anon;
revoke all on function public.clear_member_permission_override(uuid,text) from public,anon;
revoke all on function public.replace_role_permissions(uuid,text[]) from public,anon;
grant execute on function public.create_company_invitation(uuid,text,uuid,integer) to authenticated;
grant execute on function public.accept_company_invitation(text) to authenticated;
grant execute on function public.revoke_company_invitation(uuid) to authenticated;
grant execute on function public.set_member_role(uuid,uuid) to authenticated;
grant execute on function public.set_member_status(uuid,public.membership_status) to authenticated;
grant execute on function public.set_member_permission_override(uuid,text,boolean) to authenticated;
grant execute on function public.clear_member_permission_override(uuid,text) to authenticated;
grant execute on function public.replace_role_permissions(uuid,text[]) to authenticated;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;
grant select,update on public.profiles to authenticated;
grant select,update on public.companies to authenticated;
grant select on public.permissions to authenticated;
grant select on public.roles to authenticated;
grant select on public.role_permissions to authenticated;
grant select on public.company_memberships to authenticated;
grant select on public.member_permission_overrides to authenticated;
grant select on public.company_invitations to authenticated;
grant select,insert,update on public.projects to authenticated;
grant select,insert,update on public.sites to authenticated;
grant select on public.audit_events to authenticated;
grant usage,select on sequence public.audit_events_id_seq to authenticated;

commit;
