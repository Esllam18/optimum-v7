-- Optimum 5.8.0 — Organization OS Closure
-- Reproducible backend for premium organization intelligence, saved views, bulk actions,
-- work settings and cross-session organization revision tracking.

create table if not exists public.workspace_saved_views (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  view_key text not null check (view_key in ('team','roles','settings','organization')),
  name text not null check (char_length(trim(name)) between 2 and 80),
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters)='object'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workspace_saved_views_user_idx on public.workspace_saved_views(user_id,company_id,view_key,updated_at desc);
create unique index if not exists workspace_saved_views_default_idx on public.workspace_saved_views(company_id,user_id,view_key) where is_default;
alter table public.workspace_saved_views enable row level security;
drop policy if exists workspace_saved_views_select on public.workspace_saved_views;
create policy workspace_saved_views_select on public.workspace_saved_views for select to authenticated using (user_id=auth.uid() and app_private.is_company_member(company_id));
drop policy if exists workspace_saved_views_insert on public.workspace_saved_views;
create policy workspace_saved_views_insert on public.workspace_saved_views for insert to authenticated with check (user_id=auth.uid() and app_private.is_company_member(company_id));
drop policy if exists workspace_saved_views_update on public.workspace_saved_views;
create policy workspace_saved_views_update on public.workspace_saved_views for update to authenticated using (user_id=auth.uid() and app_private.is_company_member(company_id)) with check (user_id=auth.uid() and app_private.is_company_member(company_id));
drop policy if exists workspace_saved_views_delete on public.workspace_saved_views;
create policy workspace_saved_views_delete on public.workspace_saved_views for delete to authenticated using (user_id=auth.uid() and app_private.is_company_member(company_id));

create table if not exists public.company_work_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  timezone text not null default 'Africa/Cairo',
  work_days smallint[] not null default array[0,1,2,3,4]::smallint[],
  workday_start time not null default '09:00',
  workday_end time not null default '17:00',
  default_weekly_hours numeric not null default 40 check(default_weekly_hours between 1 and 168),
  holidays jsonb not null default '[]'::jsonb check(jsonb_typeof(holidays)='array'),
  notification_defaults jsonb not null default '{"approval":true,"security":true,"task_due":true,"task_assigned":true}'::jsonb,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.company_work_settings enable row level security;
drop policy if exists company_work_settings_select on public.company_work_settings;
create policy company_work_settings_select on public.company_work_settings for select to authenticated using (app_private.is_company_member(company_id) or app_private.is_platform_admin());

create table if not exists public.member_work_preferences (
  membership_id uuid primary key references public.company_memberships(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  default_project_ids uuid[] not null default array[]::uuid[],
  notification_preferences jsonb not null default '{}'::jsonb,
  calendar_preferences jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists member_work_preferences_company_idx on public.member_work_preferences(company_id,membership_id);
alter table public.member_work_preferences enable row level security;
drop policy if exists member_work_preferences_select on public.member_work_preferences;
create policy member_work_preferences_select on public.member_work_preferences for select to authenticated using (app_private.is_company_member(company_id) or app_private.is_platform_admin());

create table if not exists public.organization_runtime_versions (
  company_id uuid primary key references public.companies(id) on delete cascade,
  revision bigint not null default 1,
  last_kind text not null default 'bootstrap',
  updated_at timestamptz not null default now()
);
alter table public.organization_runtime_versions enable row level security;
drop policy if exists organization_runtime_versions_select on public.organization_runtime_versions;
create policy organization_runtime_versions_select on public.organization_runtime_versions for select to authenticated using (app_private.is_company_member(company_id) or app_private.is_platform_admin());
insert into public.organization_runtime_versions(company_id)
select id from public.companies on conflict(company_id) do nothing;

create or replace function public.save_workspace_saved_view(p_company_id uuid,p_view_key text,p_name text,p_filters jsonb,p_is_default boolean default false,p_view_id uuid default null)
returns public.workspace_saved_views language plpgsql set search_path='public','pg_temp' as $$
declare result public.workspace_saved_views;
begin
  if not app_private.is_company_member(p_company_id) then raise exception 'Company membership required'; end if;
  if p_view_key not in ('team','roles','settings','organization') then raise exception 'Unsupported saved view'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 2 and 80 then raise exception 'Saved view name must be 2 to 80 characters'; end if;
  if jsonb_typeof(coalesce(p_filters,'{}'::jsonb))<>'object' then raise exception 'Saved view filters must be an object'; end if;
  if p_is_default then update public.workspace_saved_views set is_default=false,updated_at=now() where company_id=p_company_id and user_id=auth.uid() and view_key=p_view_key and (p_view_id is null or id<>p_view_id); end if;
  if p_view_id is null then
    insert into public.workspace_saved_views(company_id,user_id,view_key,name,filters,is_default) values(p_company_id,auth.uid(),p_view_key,trim(p_name),coalesce(p_filters,'{}'::jsonb),p_is_default) returning * into result;
  else
    update public.workspace_saved_views set name=trim(p_name),filters=coalesce(p_filters,'{}'::jsonb),is_default=p_is_default,updated_at=now() where id=p_view_id and company_id=p_company_id and user_id=auth.uid() returning * into result;
    if result.id is null then raise exception 'Saved view not found'; end if;
  end if;
  return result;
end $$;

create or replace function public.delete_workspace_saved_view(p_view_id uuid)
returns boolean language plpgsql set search_path='public','pg_temp' as $$
declare n integer; begin delete from public.workspace_saved_views where id=p_view_id and user_id=auth.uid(); get diagnostics n=row_count; return n>0; end $$;

grant execute on function public.save_workspace_saved_view(uuid,text,text,jsonb,boolean,uuid) to authenticated;
grant execute on function public.delete_workspace_saved_view(uuid) to authenticated;

create or replace function public.save_company_work_settings(p_company_id uuid,p_payload jsonb)
returns public.company_work_settings language plpgsql security definer set search_path='public','pg_temp' as $$
declare r public.company_work_settings; days smallint[]; start_time time; end_time time; weekly numeric; holidays_v jsonb; notify_v jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_company_permission(p_company_id,'company.manage') then raise exception 'Company management permission required'; end if;
  select coalesce(array_agg(distinct x::smallint order by x::smallint),array[]::smallint[]) into days from jsonb_array_elements_text(coalesce(p_payload->'work_days','[]'::jsonb)) x where x::int between 0 and 6;
  if coalesce(array_length(days,1),0)=0 then raise exception 'Select at least one work day'; end if;
  start_time:=coalesce(nullif(p_payload->>'workday_start','')::time,'09:00'::time);
  end_time:=coalesce(nullif(p_payload->>'workday_end','')::time,'17:00'::time);
  if end_time<=start_time then raise exception 'Workday end must be after start'; end if;
  weekly:=coalesce(nullif(p_payload->>'default_weekly_hours','')::numeric,40);
  if weekly<1 or weekly>168 then raise exception 'Invalid weekly capacity'; end if;
  holidays_v:=coalesce(p_payload->'holidays','[]'::jsonb); if jsonb_typeof(holidays_v)<>'array' then raise exception 'Holidays must be an array'; end if;
  notify_v:=coalesce(p_payload->'notification_defaults','{}'::jsonb); if jsonb_typeof(notify_v)<>'object' then raise exception 'Notification defaults must be an object'; end if;
  insert into public.company_work_settings(company_id,timezone,work_days,workday_start,workday_end,default_weekly_hours,holidays,notification_defaults,updated_by)
  values(p_company_id,coalesce(nullif(trim(p_payload->>'timezone'),''),(select timezone from public.companies where id=p_company_id),'Africa/Cairo'),days,start_time,end_time,weekly,holidays_v,notify_v,auth.uid())
  on conflict(company_id) do update set timezone=excluded.timezone,work_days=excluded.work_days,workday_start=excluded.workday_start,workday_end=excluded.workday_end,default_weekly_hours=excluded.default_weekly_hours,holidays=excluded.holidays,notification_defaults=excluded.notification_defaults,updated_by=auth.uid(),updated_at=now()
  returning * into r;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(p_company_id,auth.uid(),'organization.work_settings_updated','company',p_company_id,jsonb_build_object('work_days',days,'workday_start',start_time,'workday_end',end_time,'default_weekly_hours',weekly));
  return r;
end $$;
grant execute on function public.save_company_work_settings(uuid,jsonb) to authenticated;

create or replace function public.save_member_work_preferences(p_membership_id uuid,p_payload jsonb)
returns public.member_work_preferences language plpgsql security definer set search_path='public','pg_temp' as $$
declare m public.company_memberships%rowtype; r public.member_work_preferences; project_ids uuid[]; notify_v jsonb; cal_v jsonb;
begin
  select * into m from public.company_memberships where id=p_membership_id; if not found then raise exception 'Member not found'; end if;
  if not (m.user_id=auth.uid() or app_private.has_company_permission(m.company_id,'members.manage') or app_private.is_platform_admin()) then raise exception 'Permission denied'; end if;
  select coalesce(array_agg(x::uuid),array[]::uuid[]) into project_ids from jsonb_array_elements_text(coalesce(p_payload->'default_project_ids','[]'::jsonb)) x;
  if exists(select 1 from unnest(project_ids) pid where not exists(select 1 from public.projects p where p.id=pid and p.company_id=m.company_id and p.archived_at is null)) then raise exception 'Invalid default project'; end if;
  notify_v:=coalesce(p_payload->'notification_preferences','{}'::jsonb); cal_v:=coalesce(p_payload->'calendar_preferences','{}'::jsonb);
  if jsonb_typeof(notify_v)<>'object' or jsonb_typeof(cal_v)<>'object' then raise exception 'Preferences must be objects'; end if;
  insert into public.member_work_preferences(membership_id,company_id,default_project_ids,notification_preferences,calendar_preferences,updated_by)
  values(m.id,m.company_id,project_ids,notify_v,cal_v,auth.uid())
  on conflict(membership_id) do update set default_project_ids=excluded.default_project_ids,notification_preferences=excluded.notification_preferences,calendar_preferences=excluded.calendar_preferences,updated_by=auth.uid(),updated_at=now()
  returning * into r;
  return r;
end $$;
grant execute on function public.save_member_work_preferences(uuid,jsonb) to authenticated;

create or replace function public.bulk_set_member_role(p_membership_ids uuid[],p_role_id uuid)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare item uuid; changed integer:=0; company_ids uuid[]; target_company uuid; target_slug text;
begin
  if coalesce(array_length(p_membership_ids,1),0)=0 then raise exception 'Select at least one member'; end if;
  if array_length(p_membership_ids,1)>200 then raise exception 'Bulk action limit is 200 members'; end if;
  select company_id,slug into target_company,target_slug from public.roles where id=p_role_id; if target_company is null then raise exception 'Role not found'; end if;
  if target_slug='owner' then raise exception 'Owner role cannot be assigned through bulk action'; end if;
  select array_agg(distinct company_id) into company_ids from public.company_memberships where id=any(p_membership_ids);
  if coalesce(array_length(company_ids,1),0)<>1 or company_ids[1]<>target_company then raise exception 'Members and role must belong to one company'; end if;
  if not app_private.has_company_permission(target_company,'members.manage') then raise exception 'Member management permission required'; end if;
  foreach item in array p_membership_ids loop perform public.set_member_role(item,p_role_id); changed:=changed+1; end loop;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(target_company,auth.uid(),'members.bulk_role_changed','role',p_role_id,jsonb_build_object('membership_ids',p_membership_ids,'role_id',p_role_id,'count',changed));
  return jsonb_build_object('ok',true,'changed',changed,'role_id',p_role_id);
end $$;

create or replace function public.bulk_set_member_status(p_membership_ids uuid[],p_status text)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare item uuid; changed integer:=0; company_ids uuid[];
begin
  if p_status not in ('active','suspended') then raise exception 'Bulk status supports active or suspended only'; end if;
  if coalesce(array_length(p_membership_ids,1),0)=0 then raise exception 'Select at least one member'; end if;
  if array_length(p_membership_ids,1)>200 then raise exception 'Bulk action limit is 200 members'; end if;
  select array_agg(distinct company_id) into company_ids from public.company_memberships where id=any(p_membership_ids); if coalesce(array_length(company_ids,1),0)<>1 then raise exception 'All members must belong to one company'; end if;
  if not app_private.has_company_permission(company_ids[1],'members.manage') then raise exception 'Member management permission required'; end if;
  foreach item in array p_membership_ids loop perform public.set_member_status(item,p_status); changed:=changed+1; end loop;
  insert into public.audit_events(company_id,actor_id,action,entity_type,metadata) values(company_ids[1],auth.uid(),'members.bulk_status_changed','company_membership',jsonb_build_object('membership_ids',p_membership_ids,'status',p_status,'count',changed));
  return jsonb_build_object('ok',true,'changed',changed,'status',p_status);
end $$;

create or replace function public.bulk_restore_member_access(p_items jsonb)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare item jsonb; mid uuid; company_ids uuid[]; changed integer:=0;
begin
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'Nothing to restore'; end if;
  if jsonb_array_length(p_items)>200 then raise exception 'Bulk action limit is 200 members'; end if;
  select array_agg(distinct m.company_id) into company_ids from public.company_memberships m join jsonb_array_elements(p_items) x on m.id=(x->>'membership_id')::uuid;
  if coalesce(array_length(company_ids,1),0)<>1 then raise exception 'All members must belong to one company'; end if;
  if not app_private.has_company_permission(company_ids[1],'members.manage') then raise exception 'Member management permission required'; end if;
  for item in select value from jsonb_array_elements(p_items) loop mid:=(item->>'membership_id')::uuid; if item?'role_id' and nullif(item->>'role_id','') is not null then perform public.set_member_role(mid,(item->>'role_id')::uuid); end if; if item?'status' and nullif(item->>'status','') is not null then perform public.set_member_status(mid,item->>'status'); end if; changed:=changed+1; end loop;
  insert into public.audit_events(company_id,actor_id,action,entity_type,metadata) values(company_ids[1],auth.uid(),'members.bulk_undo','company_membership',jsonb_build_object('count',changed));
  return jsonb_build_object('ok',true,'changed',changed);
end $$;
grant execute on function public.bulk_set_member_role(uuid[],uuid) to authenticated;
grant execute on function public.bulk_set_member_status(uuid[],text) to authenticated;
grant execute on function public.bulk_restore_member_access(jsonb) to authenticated;

create or replace function public.organization_runtime_revision(p_company_id uuid)
returns table(revision bigint,last_kind text,updated_at timestamptz) language sql stable set search_path='public','pg_temp' as $$
  select v.revision,v.last_kind,v.updated_at from public.organization_runtime_versions v where v.company_id=p_company_id and (app_private.is_company_member(p_company_id) or app_private.is_platform_admin());
$$;
grant execute on function public.organization_runtime_revision(uuid) to authenticated;

create or replace function app_private.bump_organization_runtime(p_company_id uuid,p_kind text)
returns void language plpgsql security definer set search_path='public','pg_temp' as $$
begin
  if p_company_id is null then return; end if;
  insert into public.organization_runtime_versions(company_id,revision,last_kind,updated_at) values(p_company_id,1,coalesce(nullif(p_kind,''),'organization'),now())
  on conflict(company_id) do update set revision=public.organization_runtime_versions.revision+1,last_kind=excluded.last_kind,updated_at=now();
end $$;

create or replace function app_private.bump_organization_runtime_trigger()
returns trigger language plpgsql security definer set search_path='public','pg_temp' as $$
declare cid uuid; begin
  cid:=coalesce(case when tg_op='DELETE' then old.company_id else new.company_id end,
                case when tg_table_name='organization_unit_memberships' then (select u.company_id from public.organization_units u where u.id=coalesce(new.unit_id,old.unit_id)) end,
                case when tg_table_name='role_permissions' then (select r.company_id from public.roles r where r.id=coalesce(new.role_id,old.role_id)) end,
                case when tg_table_name='role_addon_permissions' then (select a.company_id from public.role_addons a where a.id=coalesce(new.addon_id,old.addon_id)) end,
                case when tg_table_name='member_permission_overrides' then (select m.company_id from public.company_memberships m where m.id=coalesce(new.membership_id,old.membership_id)) end,
                case when tg_table_name='member_role_addons' then (select m.company_id from public.company_memberships m where m.id=coalesce(new.membership_id,old.membership_id)) end,
                case when tg_table_name='workspace_setting_drafts' then coalesce(new.company_id,old.company_id) end);
  perform app_private.bump_organization_runtime(cid,tg_table_name||'.'||lower(tg_op)); return coalesce(new,old);
end $$;

-- Ensure all organization mutations participate in cross-session revision tracking.
do $$ declare tbl text; begin
  foreach tbl in array array['companies','company_branding','company_subscriptions','company_entitlement_overrides','company_memberships','roles','role_permissions','role_addons','role_addon_permissions','member_role_addons','member_permission_overrides','organization_units','organization_unit_memberships','access_scope_rules','access_governance_settings','role_drafts','workspace_setting_drafts','company_work_settings','member_work_preferences'] loop
    if to_regclass('public.'||tbl) is not null then
      execute format('drop trigger if exists org_runtime_revision_%I on public.%I',tbl,tbl);
      execute format('create trigger org_runtime_revision_%I after insert or update or delete on public.%I for each row execute function app_private.bump_organization_runtime_trigger()',tbl,tbl);
    end if;
  end loop;
end $$;

create or replace function public.organization_health_snapshot(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','auth','pg_temp' as $$
declare
  c public.companies%rowtype; b public.company_branding%rowtype; ws public.company_work_settings%rowtype; gov public.access_governance_settings%rowtype;
  issues jsonb:='[]'::jsonb; steps jsonb:='[]'::jsonb; score integer:=100;
  roles_n int:=0; empty_roles int:=0; members_n int:=0; no_manager int:=0; first_login int:=0; expiring int:=0; dead_manager int:=0; expired_invites int:=0; override_heavy int:=0; units_n int:=0; project_n int:=0; storage_used bigint:=0; limits record; active_members int:=0;
  identity_ok boolean; branding_ok boolean; work_ok boolean; roles_ok boolean; org_ok boolean; team_ok boolean; governance_ok boolean; projects_ok boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (app_private.is_company_member(p_company_id) or app_private.is_platform_admin()) then raise exception 'Company membership required'; end if;
  select * into c from public.companies where id=p_company_id; if not found then raise exception 'Company not found'; end if;
  select * into b from public.company_branding where company_id=p_company_id;
  select * into ws from public.company_work_settings where company_id=p_company_id;
  select * into gov from public.access_governance_settings where company_id=p_company_id;
  select count(*) into roles_n from public.roles where company_id=p_company_id;
  select count(*) into empty_roles from public.roles r where r.company_id=p_company_id and r.slug<>'owner' and not exists(select 1 from public.role_permissions rp where rp.role_id=r.id and rp.allowed);
  select count(*),count(*) filter(where status='active') into members_n,active_members from public.company_memberships where company_id=p_company_id;
  select count(*) into no_manager from public.company_memberships m join public.roles r on r.id=m.role_id where m.company_id=p_company_id and m.status='active' and r.slug<>'owner' and m.manager_user_id is null;
  select count(*) into first_login from public.company_memberships m left join public.account_security s on s.user_id=m.user_id where m.company_id=p_company_id and m.status in ('active','invited') and coalesce(s.must_change_password,false);
  select count(*) into expiring from public.company_memberships where company_id=p_company_id and status='active' and access_ends_at between now() and now()+interval '14 days';
  select count(*) into dead_manager from public.company_memberships e join public.company_memberships mgr on mgr.company_id=e.company_id and mgr.user_id=e.manager_user_id where e.company_id=p_company_id and e.status='active' and mgr.status<>'active';
  select count(*) into expired_invites from public.company_invitations where company_id=p_company_id and status='pending' and expires_at<now();
  select count(*) into override_heavy from (select membership_id,count(*) n from public.member_permission_overrides mpo join public.company_memberships m on m.id=mpo.membership_id where m.company_id=p_company_id group by membership_id having count(*)>=6) q;
  select count(*) into units_n from public.organization_units where company_id=p_company_id and is_active;
  select count(*) into project_n from public.projects where company_id=p_company_id and archived_at is null;
  select coalesce(sum(size_bytes),0) into storage_used from public.document_versions where company_id=p_company_id and upload_state in ('uploading','ready');
  select * into limits from app_private.effective_company_limits(p_company_id);
  identity_ok:=coalesce(nullif(c.name,''),null) is not null and c.official_email is not null and c.country_code is not null and c.timezone is not null;
  branding_ok:=b.company_id is not null and coalesce(nullif(b.app_name,''),null) is not null;
  work_ok:=ws.company_id is not null;
  roles_ok:=roles_n>0 and empty_roles=0;
  org_ok:=units_n>0;
  team_ok:=active_members>0;
  governance_ok:=gov.company_id is not null;
  projects_ok:=project_n>0;

  steps:=jsonb_build_array(
    jsonb_build_object('key','identity','done',identity_ok,'route','settings','label_ar','هوية وبيانات الشركة','label_en','Company identity'),
    jsonb_build_object('key','branding','done',branding_ok,'route','settings','label_ar','الهوية البصرية','label_en','Branding'),
    jsonb_build_object('key','work','done',work_ok,'route','organization','label_ar','أيام وساعات العمل','label_en','Work schedule'),
    jsonb_build_object('key','roles','done',roles_ok,'route','roles','label_ar','الأدوار والصلاحيات','label_en','Roles & permissions'),
    jsonb_build_object('key','structure','done',org_ok,'route','organization','label_ar','الهيكل التنظيمي','label_en','Organization structure'),
    jsonb_build_object('key','team','done',team_ok,'route','team','label_ar','الفريق','label_en','Team'),
    jsonb_build_object('key','governance','done',governance_ok,'route','roles','label_ar','حوكمة الوصول','label_en','Access governance'),
    jsonb_build_object('key','projects','done',projects_ok,'route','projects','label_ar','المشاريع','label_en','Projects')
  );

  if not identity_ok then score:=score-14; issues:=issues||jsonb_build_array(jsonb_build_object('code','identity_incomplete','severity','warning','route','settings','title_ar','بيانات الشركة غير مكتملة','title_en','Company profile is incomplete','detail_ar','أكمل البريد الرسمي والدولة والمنطقة الزمنية.','detail_en','Complete official email, country, and timezone.')); end if;
  if not work_ok then score:=score-10; issues:=issues||jsonb_build_array(jsonb_build_object('code','work_settings_missing','severity','warning','route','organization','title_ar','أيام وساعات العمل غير محددة','title_en','Work schedule is not configured','detail_ar','حدد أيام وساعات العمل قبل بناء التقويم والتوزيع الذكي.','detail_en','Configure working days and hours before calendar and smart assignment.')); end if;
  if empty_roles>0 then score:=score-least(15,empty_roles*5); issues:=issues||jsonb_build_array(jsonb_build_object('code','empty_roles','severity','danger','route','roles','count',empty_roles,'title_ar','أدوار بدون صلاحيات','title_en','Roles without permissions','detail_ar','يوجد أدوار لا تمنح أي صلاحية فعلية.','detail_en','Some roles grant no effective permissions.')); end if;
  if no_manager>0 then score:=score-least(12,no_manager*2); issues:=issues||jsonb_build_array(jsonb_build_object('code','members_no_manager','severity','warning','route','team','count',no_manager,'title_ar','أعضاء بدون مدير مباشر','title_en','Members without direct manager','detail_ar','ربط المدير الآن يمنع مشاكل التصعيد والموافقات لاحقًا.','detail_en','Assign managers now to avoid escalation and approval gaps later.')); end if;
  if first_login>0 then score:=score-least(8,first_login*2); issues:=issues||jsonb_build_array(jsonb_build_object('code','first_login_pending','severity','info','route','team','count',first_login,'title_ar','حسابات لم تكمل أول دخول','title_en','Accounts pending first login','detail_ar','تابع الحسابات التي ما زالت على كلمة المرور المؤقتة.','detail_en','Follow up on accounts still using temporary credentials.')); end if;
  if expiring>0 then score:=score-least(8,expiring); issues:=issues||jsonb_build_array(jsonb_build_object('code','access_expiring','severity','warning','route','team','count',expiring,'title_ar','صلاحيات وصول تنتهي قريبًا','title_en','Access expiring soon','detail_ar','راجع الأعضاء الذين ينتهي وصولهم خلال 14 يومًا.','detail_en','Review members whose access ends within 14 days.')); end if;
  if dead_manager>0 then score:=score-least(15,dead_manager*5); issues:=issues||jsonb_build_array(jsonb_build_object('code','inactive_manager','severity','danger','route','organization','count',dead_manager,'title_ar','مدير غير نشط مرتبط بموظفين','title_en','Inactive manager still has reports','detail_ar','انقل التقارير إلى مدير نشط.','detail_en','Reassign reports to an active manager.')); end if;
  if expired_invites>0 then score:=score-least(5,expired_invites); issues:=issues||jsonb_build_array(jsonb_build_object('code','expired_invitations','severity','info','route','team','count',expired_invites,'title_ar','دعوات منتهية','title_en','Expired invitations','detail_ar','أعد الإرسال أو ألغِ الدعوات القديمة.','detail_en','Resend or revoke stale invitations.')); end if;
  if override_heavy>0 then score:=score-least(10,override_heavy*3); issues:=issues||jsonb_build_array(jsonb_build_object('code','override_heavy','severity','warning','route','roles','count',override_heavy,'title_ar','استثناءات فردية كثيرة','title_en','Too many member exceptions','detail_ar','الأفضل تحويل الاستثناءات المتكررة إلى Role Add-on.','detail_en','Convert recurring exceptions into role add-ons.')); end if;
  if not org_ok then score:=score-10; issues:=issues||jsonb_build_array(jsonb_build_object('code','organization_missing','severity','warning','route','organization','title_ar','الهيكل التنظيمي لم يبدأ','title_en','Organization structure not started','detail_ar','أنشئ إدارة أو فريقًا واحدًا على الأقل.','detail_en','Create at least one department or team.')); end if;
  if limits.max_members is not null and active_members>=limits.max_members then issues:=issues||jsonb_build_array(jsonb_build_object('code','member_limit','severity','danger','route','settings','title_ar','تم الوصول لحد أعضاء الباقة','title_en','Member plan limit reached','detail_ar','لن يمكن تفعيل أعضاء إضافيين قبل رفع الحد.','detail_en','Additional members cannot be activated until the limit changes.')); end if;
  if limits.max_projects is not null and project_n>=limits.max_projects then issues:=issues||jsonb_build_array(jsonb_build_object('code','project_limit','severity','warning','route','settings','title_ar','تم الوصول لحد المشاريع','title_en','Project plan limit reached','detail_ar','راجع الخطة قبل إنشاء مشروع جديد.','detail_en','Review the plan before creating another project.')); end if;
  if limits.max_storage_bytes is not null and limits.max_storage_bytes>0 and storage_used>=limits.max_storage_bytes*0.85 then issues:=issues||jsonb_build_array(jsonb_build_object('code','storage_near_limit','severity',case when storage_used>=limits.max_storage_bytes then 'danger' else 'warning' end,'route','settings','title_ar','التخزين يقترب من الحد','title_en','Storage is near its limit','detail_ar','راجع الملفات أو حد التخزين قبل توقف الرفع.','detail_en','Review files or storage limits before uploads are blocked.')); end if;
  score:=greatest(0,least(100,score));
  return jsonb_build_object('score',score,'steps',steps,'issues',issues,'metrics',jsonb_build_object('roles',roles_n,'empty_roles',empty_roles,'members',members_n,'active_members',active_members,'units',units_n,'projects',project_n,'pending_first_login',first_login,'expiring_access',expiring,'expired_invitations',expired_invites,'heavy_overrides',override_heavy,'storage_bytes',storage_used),'generated_at',now());
end $$;
grant execute on function public.organization_health_snapshot(uuid) to authenticated;

-- Keep the public API locked to authenticated callers only for this phase's RPC surface.
revoke all on function public.save_company_work_settings(uuid,jsonb) from public,anon;
revoke all on function public.save_member_work_preferences(uuid,jsonb) from public,anon;
revoke all on function public.organization_health_snapshot(uuid) from public,anon;
revoke all on function public.organization_runtime_revision(uuid) from public,anon;
revoke all on function public.bulk_set_member_role(uuid[],uuid) from public,anon;
revoke all on function public.bulk_set_member_status(uuid[],text) from public,anon;
revoke all on function public.bulk_restore_member_access(jsonb) from public,anon;
