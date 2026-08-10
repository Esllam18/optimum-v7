-- Optimum 6.8.0 — Project & Document Control OS
-- Unifies project/site mutations, hardens file/storage scope, introduces
-- Project/Site/Document 360 snapshots, resource-aware notifications,
-- document control metadata, storage intelligence, and entity deep-link resolution.

begin;

-- ---------------------------------------------------------------------------
-- Rich project/site/document metadata. Additive and backwards compatible.
-- ---------------------------------------------------------------------------
alter table public.projects
  add column if not exists project_type text,
  add column if not exists client_name text,
  add column if not exists manager_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists planned_start_date date,
  add column if not exists target_end_date date,
  add column if not exists actual_start_date date,
  add column if not exists actual_end_date date,
  add column if not exists progress_percent smallint not null default 0;

alter table public.sites
  add column if not exists status text not null default 'active',
  add column if not exists manager_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists address text,
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6),
  add column if not exists timezone text,
  add column if not exists start_date date,
  add column if not exists target_end_date date;

alter table public.documents
  add column if not exists control_status text not null default 'working',
  add column if not exists discipline text,
  add column if not exists owner_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists review_due_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='projects_progress_percent_check') then
    alter table public.projects add constraint projects_progress_percent_check check(progress_percent between 0 and 100);
  end if;
  if not exists(select 1 from pg_constraint where conname='sites_status_check') then
    alter table public.sites add constraint sites_status_check check(status in ('planned','active','on_hold','completed','archived'));
  end if;
  if not exists(select 1 from pg_constraint where conname='sites_latitude_check') then
    alter table public.sites add constraint sites_latitude_check check(latitude is null or latitude between -90 and 90);
  end if;
  if not exists(select 1 from pg_constraint where conname='sites_longitude_check') then
    alter table public.sites add constraint sites_longitude_check check(longitude is null or longitude between -180 and 180);
  end if;
  if not exists(select 1 from pg_constraint where conname='documents_control_status_check') then
    alter table public.documents add constraint documents_control_status_check check(control_status in ('working','in_review','approved','rejected','superseded'));
  end if;
end $$;

create index if not exists projects_manager_idx on public.projects(manager_user_id) where manager_user_id is not null;
create index if not exists projects_target_end_idx on public.projects(company_id,target_end_date) where archived_at is null and target_end_date is not null;
create index if not exists sites_manager_idx on public.sites(manager_user_id) where manager_user_id is not null;
create index if not exists sites_company_status_idx on public.sites(company_id,status,project_id);
create index if not exists documents_control_status_idx on public.documents(company_id,control_status,project_id) where state='active';
create index if not exists documents_owner_idx on public.documents(owner_user_id) where owner_user_id is not null and state='active';
create index if not exists documents_review_due_idx on public.documents(company_id,review_due_at) where state='active' and review_due_at is not null;

-- ---------------------------------------------------------------------------
-- Parent lifecycle guard shared by Files, Work and Engineering.
-- ---------------------------------------------------------------------------
create or replace function app_private.project_context_operational(p_project_id uuid,p_site_id uuid default null)
returns boolean language sql stable security definer
set search_path='public','pg_temp'
as $$
  select exists(
    select 1 from public.projects p
    where p.id=p_project_id and p.archived_at is null and p.status<>'archived'
      and (p_site_id is null or exists(
        select 1 from public.sites s where s.id=p_site_id and s.project_id=p.id
          and s.archived_at is null and coalesce(s.status,'active')<>'archived'
      ))
  );
$$;

create or replace function app_private.enforce_project_context_operational()
returns trigger language plpgsql security definer
set search_path='public','pg_temp'
as $$
declare v_project uuid;v_site uuid;
begin
  if tg_op='DELETE' then return old; end if;
  v_project:=new.project_id;
  if tg_table_name='work_milestones' then v_site:=null; else v_site:=new.site_id; end if;
  if v_project is not null and not app_private.project_context_operational(v_project,v_site) then
    raise exception 'Project or site is archived. Reactivate it before changing linked work or files.';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['folders','documents','tasks','task_series','engineering_drawings','work_milestones'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists project_context_operational_guard on public.%I',t);
      execute format('create trigger project_context_operational_guard before insert or update on public.%I for each row execute function app_private.enforce_project_context_operational()',t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Operation-specific resource scope guard. Rename and Move no longer require
-- files.manage when the catalog explicitly grants files.rename/files.move.
-- ---------------------------------------------------------------------------
create or replace function app_private.enforce_resource_mutation_scope()
returns trigger language plpgsql security definer
set search_path='public','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  v_company uuid;v_project uuid;v_site uuid;v_folder uuid;v_drawing uuid;
  v_ok boolean:=true;
  v_other_changed boolean:=false;
begin
  if app_private.is_platform_admin() then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if v_uid is null then raise exception 'Authentication required'; end if;

  if tg_table_name='projects' then
    if tg_op='INSERT' then
      v_ok:=app_private.user_has_resource_permission(v_uid,new.company_id,'projects.create',new.id,null,null,null);
    elsif tg_op='DELETE' then
      v_ok:=app_private.user_has_resource_permission(v_uid,old.company_id,'projects.archive',old.id,null,null,null);
    elsif (new.archived_at is not null and old.archived_at is null) or (new.status='archived' and old.status<>'archived') then
      v_ok:=app_private.user_has_resource_permission(v_uid,new.company_id,'projects.archive',new.id,null,null,null);
    else
      v_ok:=app_private.user_has_resource_permission(v_uid,new.company_id,'projects.edit',new.id,null,null,null);
    end if;

  elsif tg_table_name='sites' then
    if tg_op='DELETE' then v_company:=old.company_id;v_project:=old.project_id;v_site:=old.id;
    else v_company:=new.company_id;v_project:=new.project_id;v_site:=new.id; end if;
    if tg_op='INSERT' then
      v_ok:=app_private.user_has_resource_permission(v_uid,v_company,'projects.create',v_project,v_site,null,null);
    elsif tg_op='DELETE' or (new.archived_at is not null and old.archived_at is null) then
      v_ok:=app_private.user_has_resource_permission(v_uid,v_company,'projects.archive',v_project,v_site,null,null);
    else
      v_ok:=app_private.user_has_resource_permission(v_uid,v_company,'projects.edit',v_project,v_site,null,null);
    end if;

  elsif tg_table_name='folders' then
    if tg_op='DELETE' then v_company:=old.company_id;v_project:=old.project_id;v_site:=old.site_id;v_folder:=old.id;
    else v_company:=new.company_id;v_project:=new.project_id;v_site:=new.site_id;v_folder:=new.id; end if;
    if tg_op='INSERT' then
      v_ok:=app_private.user_has_resource_permission(v_uid,v_company,'files.create_folder',v_project,v_site,new.parent_id,null);
    elsif tg_op='DELETE' then
      v_ok:=app_private.user_has_resource_permission(v_uid,v_company,'files.archive',v_project,v_site,v_folder,null);
    elsif new.trashed_at is not null and old.trashed_at is null then
      v_ok:=app_private.user_has_resource_permission(v_uid,v_company,'files.archive',v_project,v_site,v_folder,null);
    elsif new.trashed_at is null and old.trashed_at is not null then
      v_ok:=app_private.user_has_resource_permission(v_uid,v_company,'files.restore',v_project,v_site,v_folder,null);
    else
      if new.name is distinct from old.name then
        v_ok:=v_ok and app_private.user_has_resource_permission(v_uid,v_company,'files.rename',v_project,v_site,v_folder,null);
      end if;
      if new.parent_id is distinct from old.parent_id then
        v_ok:=v_ok and app_private.user_has_resource_permission(v_uid,v_company,'files.move',v_project,v_site,v_folder,null)
          and (new.parent_id is null or app_private.user_has_resource_permission(v_uid,v_company,'files.move',v_project,v_site,new.parent_id,null));
      end if;
      v_other_changed := new.company_id is distinct from old.company_id or new.project_id is distinct from old.project_id or new.site_id is distinct from old.site_id
        or new.code is distinct from old.code or new.sort_order is distinct from old.sort_order or new.is_system is distinct from old.is_system
        or new.template_node_id is distinct from old.template_node_id;
      if v_other_changed then
        v_ok:=v_ok and app_private.user_has_resource_permission(v_uid,v_company,'files.manage',v_project,v_site,v_folder,null);
      end if;
    end if;

  elsif tg_table_name='documents' then
    if tg_op='DELETE' then v_company:=old.company_id;v_project:=old.project_id;v_site:=old.site_id;v_folder:=old.folder_id;
    else v_company:=new.company_id;v_project:=new.project_id;v_site:=new.site_id;v_folder:=new.folder_id; end if;
    if tg_op='INSERT' then
      v_ok:=app_private.user_has_resource_permission(v_uid,v_company,'files.upload',v_project,v_site,v_folder,null);
    elsif tg_op='DELETE' then
      v_ok:=app_private.user_has_resource_permission(v_uid,v_company,'files.manage',v_project,v_site,v_folder,null);
    elsif new.state='trashed' and old.state<>'trashed' then
      v_ok:=app_private.user_has_resource_permission(v_uid,v_company,'files.archive',v_project,v_site,old.folder_id,null);
    elsif new.state='active' and old.state='trashed' then
      v_ok:=app_private.user_has_resource_permission(v_uid,v_company,'files.restore',v_project,v_site,new.folder_id,null);
    else
      if new.display_name is distinct from old.display_name then
        v_ok:=v_ok and app_private.user_has_resource_permission(v_uid,v_company,'files.rename',v_project,v_site,old.folder_id,null);
      end if;
      if new.folder_id is distinct from old.folder_id then
        v_ok:=v_ok and app_private.user_has_resource_permission(v_uid,v_company,'files.move',v_project,v_site,old.folder_id,null)
          and app_private.user_has_resource_permission(v_uid,v_company,'files.move',v_project,v_site,new.folder_id,null);
      end if;
      if new.current_version_id is distinct from old.current_version_id or new.version_count is distinct from old.version_count then
        v_ok:=v_ok and (app_private.user_has_resource_permission(v_uid,v_company,'files.upload',v_project,v_site,new.folder_id,null)
          or app_private.user_has_resource_permission(v_uid,v_company,'files.manage',v_project,v_site,new.folder_id,null));
      end if;
      v_other_changed := new.company_id is distinct from old.company_id or new.project_id is distinct from old.project_id or new.site_id is distinct from old.site_id
        or new.system_code is distinct from old.system_code or new.document_type is distinct from old.document_type or new.description is distinct from old.description
        or new.tags is distinct from old.tags or new.control_status is distinct from old.control_status or new.discipline is distinct from old.discipline
        or new.owner_user_id is distinct from old.owner_user_id or new.review_due_at is distinct from old.review_due_at
        or new.approved_at is distinct from old.approved_at or new.approved_by is distinct from old.approved_by;
      if v_other_changed then
        v_ok:=v_ok and app_private.user_has_resource_permission(v_uid,v_company,'files.manage',v_project,v_site,new.folder_id,null);
      end if;
    end if;

  elsif tg_table_name='tasks' then
    if tg_op='DELETE' then return old; end if;
    v_ok:=app_private.user_has_resource_permission(v_uid,new.company_id,case when tg_op='INSERT' then 'tasks.create' else 'tasks.edit' end,new.project_id,new.site_id,new.folder_id,null);
  elsif tg_table_name='engineering_drawings' then
    if tg_op='DELETE' then return old; end if;
    v_ok:=app_private.user_has_resource_permission(v_uid,new.company_id,case when tg_op='INSERT' then 'drawings.create' else 'drawings.edit' end,new.project_id,new.site_id,new.folder_id,new.id);
  else
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;

  if not coalesce(v_ok,false) then raise exception 'Resource access scope does not allow this operation'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Resource-aware notifications. Recipients only receive resource names when
-- their effective scope lets them view that resource.
-- ---------------------------------------------------------------------------
create or replace function app_private.notify_resource_members(
  p_company_id uuid,p_actor_id uuid,p_type text,p_title_ar text,p_title_en text,
  p_body_ar text,p_body_en text,p_entity_type text,p_entity_id uuid,
  p_view_permission text,p_project_id uuid default null,p_site_id uuid default null,
  p_folder_id uuid default null,p_drawing_id uuid default null
) returns void language sql security definer
set search_path='public','pg_temp'
as $$
  insert into public.notifications(company_id,user_id,type,title_ar,title_en,body_ar,body_en,entity_type,entity_id)
  select p_company_id,m.user_id,p_type,p_title_ar,p_title_en,p_body_ar,p_body_en,p_entity_type,p_entity_id
  from public.company_memberships m
  where m.company_id=p_company_id and m.status='active' and m.user_id<>p_actor_id
    and app_private.user_has_resource_permission(m.user_id,p_company_id,p_view_permission,p_project_id,p_site_id,p_folder_id,p_drawing_id);
$$;

-- ---------------------------------------------------------------------------
-- Unified project/site mutation commands.
-- ---------------------------------------------------------------------------
create or replace function public.save_project(p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();v_id uuid:=nullif(p_payload->>'id','')::uuid;v_company uuid:=nullif(p_payload->>'company_id','')::uuid;
  v_row public.projects%rowtype;v_manager uuid:=nullif(p_payload->>'manager_user_id','')::uuid;
  v_status public.project_status:=coalesce(nullif(p_payload->>'status','')::public.project_status,'active');
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if v_status='archived' then raise exception 'Use archive_project for archival'; end if;
  if v_id is null then
    if v_company is null or not app_private.user_has_company_permission(v_uid,v_company,'projects.create') then raise exception 'Permission denied'; end if;
    if v_manager is not null and not exists(select 1 from public.company_memberships m where m.company_id=v_company and m.user_id=v_manager and m.status='active') then raise exception 'Project manager must be an active company member'; end if;
    insert into public.projects(company_id,code,name,description,status,created_by,project_type,client_name,manager_user_id,planned_start_date,target_end_date,progress_percent)
    values(v_company,trim(p_payload->>'code'),trim(p_payload->>'name'),nullif(trim(p_payload->>'description'),''),v_status,v_uid,
      nullif(trim(p_payload->>'project_type'),''),nullif(trim(p_payload->>'client_name'),''),v_manager,
      nullif(p_payload->>'planned_start_date','')::date,nullif(p_payload->>'target_end_date','')::date,
      greatest(0,least(coalesce((p_payload->>'progress_percent')::int,0),100))) returning * into v_row;
  else
    select * into v_row from public.projects where id=v_id for update;
    if not found then raise exception 'Project not found'; end if;
    if not app_private.user_has_resource_permission(v_uid,v_row.company_id,'projects.edit',v_row.id,null,null,null) then raise exception 'Permission denied'; end if;
    if v_row.archived_at is not null then raise exception 'Archived project must be reactivated before editing'; end if;
    if v_manager is not null and not exists(select 1 from public.company_memberships m where m.company_id=v_row.company_id and m.user_id=v_manager and m.status='active') then raise exception 'Project manager must be an active company member'; end if;
    update public.projects set
      code=trim(p_payload->>'code'),name=trim(p_payload->>'name'),description=nullif(trim(p_payload->>'description'),''),status=v_status,
      project_type=nullif(trim(p_payload->>'project_type'),''),client_name=nullif(trim(p_payload->>'client_name'),''),manager_user_id=v_manager,
      planned_start_date=nullif(p_payload->>'planned_start_date','')::date,target_end_date=nullif(p_payload->>'target_end_date','')::date,
      progress_percent=greatest(0,least(coalesce((p_payload->>'progress_percent')::int,progress_percent),100))
    where id=v_row.id returning * into v_row;
  end if;
  perform app_private.notify_resource_members(v_row.company_id,v_uid,case when v_id is null then 'project.created' else 'project.updated' end,
    case when v_id is null then 'تم إنشاء مشروع' else 'تم تحديث مشروع' end,case when v_id is null then 'Project created' else 'Project updated' end,
    v_row.name,v_row.name,'project',v_row.id,'projects.view',v_row.id,null,null,null);
  return to_jsonb(v_row);
end $$;

create or replace function public.save_site(p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();v_id uuid:=nullif(p_payload->>'id','')::uuid;v_project uuid:=nullif(p_payload->>'project_id','')::uuid;
  v_company uuid;v_row public.sites%rowtype;v_manager uuid:=nullif(p_payload->>'manager_user_id','')::uuid;v_status text:=coalesce(nullif(p_payload->>'status',''),'active');
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if v_status='archived' then raise exception 'Use archive_site for archival'; end if;
  if v_id is null then
    select company_id into v_company from public.projects where id=v_project and archived_at is null;
    if v_company is null then raise exception 'Project not found'; end if;
    if not app_private.user_has_resource_permission(v_uid,v_company,'projects.create',v_project,null,null,null) then raise exception 'Permission denied'; end if;
    if v_manager is not null and not exists(select 1 from public.company_memberships m where m.company_id=v_company and m.user_id=v_manager and m.status='active') then raise exception 'Site manager must be an active company member'; end if;
    insert into public.sites(company_id,project_id,code,name,description,created_by,status,manager_user_id,address,latitude,longitude,timezone,start_date,target_end_date)
    values(v_company,v_project,trim(p_payload->>'code'),trim(p_payload->>'name'),nullif(trim(p_payload->>'description'),''),v_uid,v_status,v_manager,
      nullif(trim(p_payload->>'address'),''),nullif(p_payload->>'latitude','')::numeric,nullif(p_payload->>'longitude','')::numeric,nullif(trim(p_payload->>'timezone'),''),
      nullif(p_payload->>'start_date','')::date,nullif(p_payload->>'target_end_date','')::date) returning * into v_row;
  else
    select * into v_row from public.sites where id=v_id for update;
    if not found then raise exception 'Site not found'; end if;
    if not app_private.user_has_resource_permission(v_uid,v_row.company_id,'projects.edit',v_row.project_id,v_row.id,null,null) then raise exception 'Permission denied'; end if;
    if v_row.archived_at is not null then raise exception 'Archived site must be reactivated before editing'; end if;
    if v_manager is not null and not exists(select 1 from public.company_memberships m where m.company_id=v_row.company_id and m.user_id=v_manager and m.status='active') then raise exception 'Site manager must be an active company member'; end if;
    update public.sites set code=trim(p_payload->>'code'),name=trim(p_payload->>'name'),description=nullif(trim(p_payload->>'description'),''),status=v_status,
      manager_user_id=v_manager,address=nullif(trim(p_payload->>'address'),''),latitude=nullif(p_payload->>'latitude','')::numeric,
      longitude=nullif(p_payload->>'longitude','')::numeric,timezone=nullif(trim(p_payload->>'timezone'),''),start_date=nullif(p_payload->>'start_date','')::date,
      target_end_date=nullif(p_payload->>'target_end_date','')::date
    where id=v_row.id returning * into v_row;
  end if;
  perform app_private.notify_resource_members(v_row.company_id,v_uid,case when v_id is null then 'site.created' else 'site.updated' end,
    case when v_id is null then 'تم إنشاء موقع' else 'تم تحديث موقع' end,case when v_id is null then 'Site created' else 'Site updated' end,
    v_row.name,v_row.name,'site',v_row.id,'projects.view',v_row.project_id,v_row.id,null,null);
  return to_jsonb(v_row);
end $$;

create or replace function public.project_archive_impact(p_project_id uuid)
returns jsonb language plpgsql stable security definer
set search_path='public','app_private','pg_temp'
as $$
declare p public.projects%rowtype;
begin
  select * into p from public.projects where id=p_project_id;
  if not found or not app_private.user_has_resource_permission(auth.uid(),p.company_id,'projects.archive',p.id,null,null,null) then raise exception 'Permission denied'; end if;
  return jsonb_build_object(
    'project_id',p.id,'name',p.name,
    'active_sites',(select count(*) from public.sites s where s.project_id=p.id and s.archived_at is null),
    'open_tasks',(select count(*) from public.tasks t where t.project_id=p.id and t.status not in ('done','cancelled')),
    'blocked_tasks',(select count(*) from public.tasks t where t.project_id=p.id and t.status='blocked'),
    'active_drawings',(select count(*) from public.engineering_drawings d where d.project_id=p.id and d.archived_at is null),
    'documents',(select count(*) from public.documents d where d.project_id=p.id and d.state='active'),
    'storage_bytes',(select coalesce(sum(v.size_bytes),0) from public.document_versions v join public.documents d on d.id=v.document_id where d.project_id=p.id and v.upload_state='ready'),
    'milestones',(select count(*) from public.work_milestones m where m.project_id=p.id)
  );
end $$;

create or replace function public.archive_project(p_project_id uuid,p_force boolean default false)
returns jsonb language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare p public.projects%rowtype;impact jsonb;
begin
  select * into p from public.projects where id=p_project_id for update;
  if not found or not app_private.user_has_resource_permission(auth.uid(),p.company_id,'projects.archive',p.id,null,null,null) then raise exception 'Permission denied'; end if;
  impact:=public.project_archive_impact(p.id);
  if not p_force and ((impact->>'open_tasks')::int>0 or (impact->>'active_drawings')::int>0) then raise exception 'Project has active work. Review archive impact and confirm force archive.'; end if;
  update public.projects set status='archived',archived_at=now() where id=p.id returning * into p;
  perform app_private.notify_resource_members(p.company_id,auth.uid(),'project.archived','تمت أرشفة مشروع','Project archived',p.name,p.name,'project',p.id,'projects.view',p.id,null,null,null);
  return jsonb_build_object('project',to_jsonb(p),'impact',impact);
end $$;

create or replace function public.reactivate_project(p_project_id uuid)
returns jsonb language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare p public.projects%rowtype;
begin
  select * into p from public.projects where id=p_project_id for update;
  if not found or not app_private.user_has_resource_permission(auth.uid(),p.company_id,'projects.archive',p.id,null,null,null) then raise exception 'Permission denied'; end if;
  update public.projects set status='active',archived_at=null where id=p.id returning * into p;
  return to_jsonb(p);
end $$;

create or replace function public.site_archive_impact(p_site_id uuid)
returns jsonb language plpgsql stable security definer
set search_path='public','app_private','pg_temp'
as $$
declare s public.sites%rowtype;
begin
  select * into s from public.sites where id=p_site_id;
  if not found or not app_private.user_has_resource_permission(auth.uid(),s.company_id,'projects.archive',s.project_id,s.id,null,null) then raise exception 'Permission denied'; end if;
  return jsonb_build_object('site_id',s.id,'name',s.name,
    'open_tasks',(select count(*) from public.tasks t where t.site_id=s.id and t.status not in ('done','cancelled')),
    'active_drawings',(select count(*) from public.engineering_drawings d where d.site_id=s.id and d.archived_at is null),
    'documents',(select count(*) from public.documents d where d.site_id=s.id and d.state='active'),
    'storage_bytes',(select coalesce(sum(v.size_bytes),0) from public.document_versions v join public.documents d on d.id=v.document_id where d.site_id=s.id and v.upload_state='ready'));
end $$;

create or replace function public.archive_site(p_site_id uuid,p_force boolean default false)
returns jsonb language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare s public.sites%rowtype;impact jsonb;
begin
  select * into s from public.sites where id=p_site_id for update;
  if not found or not app_private.user_has_resource_permission(auth.uid(),s.company_id,'projects.archive',s.project_id,s.id,null,null) then raise exception 'Permission denied'; end if;
  impact:=public.site_archive_impact(s.id);
  if not p_force and ((impact->>'open_tasks')::int>0 or (impact->>'active_drawings')::int>0) then raise exception 'Site has active work. Review archive impact and confirm force archive.'; end if;
  update public.sites set status='archived',archived_at=now() where id=s.id returning * into s;
  return jsonb_build_object('site',to_jsonb(s),'impact',impact);
end $$;

create or replace function public.reactivate_site(p_site_id uuid)
returns jsonb language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare s public.sites%rowtype;
begin
  select * into s from public.sites where id=p_site_id for update;
  if not found or not app_private.user_has_resource_permission(auth.uid(),s.company_id,'projects.archive',s.project_id,s.id,null,null) then raise exception 'Permission denied'; end if;
  if exists(select 1 from public.projects p where p.id=s.project_id and p.archived_at is not null) then raise exception 'Reactivate the project first'; end if;
  update public.sites set status='active',archived_at=null where id=s.id returning * into s;
  return to_jsonb(s);
end $$;

-- ---------------------------------------------------------------------------
-- File mutations: explicit resource permissions + operational parent checks.
-- ---------------------------------------------------------------------------
create or replace function public.create_folder(p_project_id uuid,p_site_id uuid,p_parent_id uuid,p_name text,p_code text default null)
returns uuid language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare v_company uuid;v_id uuid;
begin
  select company_id into v_company from public.projects where id=p_project_id and archived_at is null;
  if v_company is null or not app_private.project_context_operational(p_project_id,p_site_id) then raise exception 'Project or site is not active'; end if;
  if not app_private.user_has_resource_permission(auth.uid(),v_company,'files.create_folder',p_project_id,p_site_id,p_parent_id,null) then raise exception 'Permission denied'; end if;
  insert into public.folders(company_id,project_id,site_id,parent_id,name,code,is_system,created_by)
  values(v_company,p_project_id,p_site_id,p_parent_id,trim(p_name),nullif(trim(p_code),''),false,auth.uid()) returning id into v_id;
  perform app_private.notify_resource_members(v_company,auth.uid(),'folder.created','تم إنشاء مجلد جديد','A new folder was created',trim(p_name),trim(p_name),'folder',v_id,'files.view',p_project_id,p_site_id,v_id,null);
  return v_id;
end $$;

create or replace function public.rename_folder(p_folder_id uuid,p_name text)
returns void language plpgsql security definer set search_path='public','app_private','pg_temp'
as $$ declare f public.folders%rowtype;begin
  select * into f from public.folders where id=p_folder_id and trashed_at is null;
  if not found then raise exception 'Folder not found'; end if;if f.is_system then raise exception 'System folders cannot be renamed'; end if;
  if not app_private.project_context_operational(f.project_id,f.site_id) then raise exception 'Project or site is archived'; end if;
  if not app_private.user_has_resource_permission(auth.uid(),f.company_id,'files.rename',f.project_id,f.site_id,f.id,null) then raise exception 'Permission denied'; end if;
  update public.folders set name=trim(p_name) where id=f.id;
  perform app_private.notify_resource_members(f.company_id,auth.uid(),'folder.renamed','تم تعديل اسم مجلد','A folder was renamed',trim(p_name),trim(p_name),'folder',f.id,'files.view',f.project_id,f.site_id,f.id,null);
end $$;

create or replace function public.move_folder(p_folder_id uuid,p_parent_id uuid)
returns void language plpgsql security definer set search_path='public','app_private','pg_temp'
as $$ declare f public.folders%rowtype;p public.folders%rowtype;begin
  select * into f from public.folders where id=p_folder_id and trashed_at is null;if not found then raise exception 'Folder not found'; end if;
  if f.is_system then raise exception 'System folders cannot be moved'; end if;if not app_private.project_context_operational(f.project_id,f.site_id) then raise exception 'Project or site is archived'; end if;
  if not app_private.user_has_resource_permission(auth.uid(),f.company_id,'files.move',f.project_id,f.site_id,f.id,null) then raise exception 'Permission denied'; end if;
  if p_parent_id is not null then select * into p from public.folders where id=p_parent_id and trashed_at is null;
    if not found or p.project_id<>f.project_id or p.site_id is distinct from f.site_id then raise exception 'Invalid destination'; end if;
    if not app_private.user_has_resource_permission(auth.uid(),f.company_id,'files.move',f.project_id,f.site_id,p.id,null) then raise exception 'Destination is outside your scope'; end if;
    if exists(with recursive d as(select id from public.folders where parent_id=f.id union all select x.id from public.folders x join d on x.parent_id=d.id) select 1 from d where id=p_parent_id) then raise exception 'Cannot move a folder inside itself'; end if;
  end if;
  update public.folders set parent_id=p_parent_id where id=f.id;
  perform app_private.notify_resource_members(f.company_id,auth.uid(),'folder.moved','تم نقل مجلد','A folder was moved',f.name,f.name,'folder',f.id,'files.view',f.project_id,f.site_id,f.id,null);
end $$;

create or replace function public.rename_document(p_document_id uuid,p_display_name text)
returns void language plpgsql security definer set search_path='public','app_private','pg_temp'
as $$ declare d public.documents%rowtype;begin
  select * into d from public.documents where id=p_document_id and state='active';if not found then raise exception 'Document not found'; end if;
  if not app_private.project_context_operational(d.project_id,d.site_id) then raise exception 'Project or site is archived'; end if;
  if not app_private.user_has_resource_permission(auth.uid(),d.company_id,'files.rename',d.project_id,d.site_id,d.folder_id,null) then raise exception 'Permission denied'; end if;
  update public.documents set display_name=trim(p_display_name) where id=d.id;
  perform app_private.notify_resource_members(d.company_id,auth.uid(),'document.renamed','تم تعديل اسم ملف','A file was renamed',trim(p_display_name),trim(p_display_name),'document',d.id,'files.view',d.project_id,d.site_id,d.folder_id,null);
end $$;

create or replace function public.move_document(p_document_id uuid,p_folder_id uuid)
returns void language plpgsql security definer set search_path='public','app_private','pg_temp'
as $$ declare d public.documents%rowtype;f public.folders%rowtype;begin
  select * into d from public.documents where id=p_document_id and state='active';select * into f from public.folders where id=p_folder_id and trashed_at is null;
  if d.id is null or f.id is null or d.company_id<>f.company_id or d.project_id<>f.project_id or d.site_id is distinct from f.site_id then raise exception 'Invalid destination'; end if;
  if not app_private.project_context_operational(d.project_id,d.site_id) then raise exception 'Project or site is archived'; end if;
  if not app_private.user_has_resource_permission(auth.uid(),d.company_id,'files.move',d.project_id,d.site_id,d.folder_id,null)
     or not app_private.user_has_resource_permission(auth.uid(),d.company_id,'files.move',d.project_id,d.site_id,f.id,null) then raise exception 'Permission denied'; end if;
  update public.documents set folder_id=f.id where id=d.id;
  perform app_private.notify_resource_members(d.company_id,auth.uid(),'document.moved','تم نقل ملف','A file was moved',d.display_name,d.display_name,'document',d.id,'files.view',d.project_id,d.site_id,f.id,null);
end $$;

-- Serialize quota reservation per company so concurrent uploads cannot exceed plan storage.
create or replace function public.begin_document_upload(p_folder_id uuid,p_display_name text,p_original_filename text,p_mime_type text,p_size_bytes bigint,p_document_type text default 'general',p_description text default null,p_tags text[] default array[]::text[],p_change_note text default null)
returns jsonb language plpgsql security definer set search_path='public','app_private','pg_temp'
as $$
declare f public.folders%rowtype;v_doc uuid:=gen_random_uuid();v_ver uuid:=gen_random_uuid();v_limit bigint;v_usage bigint;v_path text;begin
  select * into f from public.folders where id=p_folder_id and trashed_at is null;if not found then raise exception 'Folder not found'; end if;
  if not app_private.project_context_operational(f.project_id,f.site_id) then raise exception 'Project or site is archived'; end if;
  if not app_private.user_has_resource_permission(auth.uid(),f.company_id,'files.upload',f.project_id,f.site_id,f.id,null) then raise exception 'Permission denied'; end if;
  if p_size_bytes<=0 or p_size_bytes>1073741824 then raise exception 'Invalid file size'; end if;
  perform pg_advisory_xact_lock(hashtextextended(f.company_id::text,6810));
  select max_storage_bytes into v_limit from app_private.effective_company_limits(f.company_id);
  select coalesce(sum(size_bytes),0) into v_usage from public.document_versions where company_id=f.company_id and upload_state in('uploading','ready');
  if v_limit is not null and v_usage+p_size_bytes>v_limit then raise exception 'Storage limit reached'; end if;
  v_path:=f.company_id::text||'/'||f.project_id::text||'/'||coalesce(f.site_id::text,'project')||'/'||v_doc::text||'/'||v_ver::text||'/'||app_private.safe_storage_filename(p_original_filename);
  insert into public.documents(id,company_id,project_id,site_id,folder_id,display_name,document_type,description,tags,created_by)
  values(v_doc,f.company_id,f.project_id,f.site_id,f.id,trim(p_display_name),coalesce(nullif(trim(p_document_type),''),'general'),nullif(trim(p_description),''),coalesce(p_tags,array[]::text[]),auth.uid());
  insert into public.document_versions(id,company_id,document_id,version_number,version_label,original_filename,storage_path,mime_type,size_bytes,change_note,uploaded_by)
  values(v_ver,f.company_id,v_doc,1,'v1',p_original_filename,v_path,coalesce(nullif(p_mime_type,''),'application/octet-stream'),p_size_bytes,nullif(trim(p_change_note),''),auth.uid());
  return jsonb_build_object('document_id',v_doc,'version_id',v_ver,'version_number',1,'storage_bucket','company-files','storage_path',v_path);
end $$;

create or replace function public.begin_new_version_upload(p_document_id uuid,p_original_filename text,p_mime_type text,p_size_bytes bigint,p_change_note text default null)
returns jsonb language plpgsql security definer set search_path='public','app_private','pg_temp'
as $$
declare d public.documents%rowtype;v_ver uuid:=gen_random_uuid();v_number integer;v_limit bigint;v_usage bigint;v_path text;begin
  select * into d from public.documents where id=p_document_id and state='active' for update;if not found then raise exception 'Document not found'; end if;
  if not app_private.project_context_operational(d.project_id,d.site_id) then raise exception 'Project or site is archived'; end if;
  if not app_private.user_has_resource_permission(auth.uid(),d.company_id,'files.upload',d.project_id,d.site_id,d.folder_id,null) then raise exception 'Permission denied'; end if;
  if not app_private.company_entitlement_enabled(d.company_id,'feature.file_versioning') then raise exception 'File versioning is not enabled for this company'; end if;
  if p_size_bytes<=0 or p_size_bytes>1073741824 then raise exception 'Invalid file size'; end if;
  perform pg_advisory_xact_lock(hashtextextended(d.company_id::text,6810));
  select max_storage_bytes into v_limit from app_private.effective_company_limits(d.company_id);
  select coalesce(sum(size_bytes),0) into v_usage from public.document_versions where company_id=d.company_id and upload_state in('uploading','ready');
  if v_limit is not null and v_usage+p_size_bytes>v_limit then raise exception 'Storage limit reached'; end if;
  select coalesce(max(version_number),0)+1 into v_number from public.document_versions where document_id=d.id;
  v_path:=d.company_id::text||'/'||d.project_id::text||'/'||coalesce(d.site_id::text,'project')||'/'||d.id::text||'/'||v_ver::text||'/'||app_private.safe_storage_filename(p_original_filename);
  insert into public.document_versions(id,company_id,document_id,version_number,version_label,original_filename,storage_path,mime_type,size_bytes,change_note,uploaded_by)
  values(v_ver,d.company_id,d.id,v_number,'v'||v_number,p_original_filename,v_path,coalesce(nullif(p_mime_type,''),'application/octet-stream'),p_size_bytes,nullif(trim(p_change_note),''),auth.uid());
  return jsonb_build_object('document_id',d.id,'version_id',v_ver,'version_number',v_number,'storage_bucket','company-files','storage_path',v_path);
end $$;

create or replace function public.finalize_document_upload(p_version_id uuid,p_checksum_sha256 text default null)
returns void language plpgsql security definer set search_path='public','storage','app_private','pg_temp'
as $$
declare v public.document_versions%rowtype;d public.documents%rowtype;begin
  select * into v from public.document_versions where id=p_version_id and upload_state='uploading' for update;if not found then raise exception 'Upload reservation not found'; end if;
  select * into d from public.documents where id=v.document_id;if not found then raise exception 'Document not found'; end if;
  if not app_private.project_context_operational(d.project_id,d.site_id) then raise exception 'Project or site is archived'; end if;
  if v.uploaded_by<>auth.uid() and not app_private.user_has_resource_permission(auth.uid(),v.company_id,'files.manage',d.project_id,d.site_id,d.folder_id,null) then raise exception 'Permission denied'; end if;
  if v.uploaded_by=auth.uid() and not app_private.user_has_resource_permission(auth.uid(),v.company_id,'files.upload',d.project_id,d.site_id,d.folder_id,null) then raise exception 'Permission denied'; end if;
  if not exists(select 1 from storage.objects where bucket_id=v.storage_bucket and name=v.storage_path) then raise exception 'Uploaded object was not found'; end if;
  update public.document_versions set upload_state='ready',checksum_sha256=nullif(p_checksum_sha256,''),finalized_at=now() where id=v.id;
  update public.documents set current_version_id=v.id,version_count=(select count(*) from public.document_versions x where x.document_id=d.id and x.upload_state='ready') where id=d.id;
  perform app_private.notify_resource_members(v.company_id,auth.uid(),'document.version_ready','تم رفع إصدار جديد','A new file version was uploaded',d.display_name,d.display_name,'document',d.id,'files.view',d.project_id,d.site_id,d.folder_id,null);
end $$;

-- ---------------------------------------------------------------------------
-- Storage policies bind every object to a real reservation/document scope.
-- ---------------------------------------------------------------------------
create or replace function app_private.can_upload_company_file_object(p_name text)
returns boolean language sql stable security definer set search_path='public','storage','pg_temp'
as $$
  select exists(
    select 1 from public.document_versions v join public.documents d on d.id=v.document_id
    where v.storage_bucket='company-files' and v.storage_path=p_name and v.upload_state='uploading' and v.uploaded_by=auth.uid()
      and app_private.user_has_resource_permission(auth.uid(),d.company_id,'files.upload',d.project_id,d.site_id,d.folder_id,null)
      and app_private.project_context_operational(d.project_id,d.site_id)
  );
$$;
create or replace function app_private.can_download_company_file_object(p_name text)
returns boolean language sql stable security definer set search_path='public','storage','pg_temp'
as $$
  select exists(
    select 1 from public.document_versions v join public.documents d on d.id=v.document_id
    where v.storage_bucket='company-files' and v.storage_path=p_name and v.upload_state='ready'
      and app_private.user_has_resource_permission(auth.uid(),d.company_id,'files.download',d.project_id,d.site_id,d.folder_id,null)
  );
$$;
create or replace function app_private.can_delete_company_file_object(p_name text)
returns boolean language sql stable security definer set search_path='public','storage','pg_temp'
as $$
  select exists(
    select 1 from public.document_versions v join public.documents d on d.id=v.document_id
    where v.storage_bucket='company-files' and v.storage_path=p_name
      and ((v.upload_state='uploading' and v.uploaded_by=auth.uid())
        or app_private.user_has_resource_permission(auth.uid(),d.company_id,'files.manage',d.project_id,d.site_id,d.folder_id,null))
  );
$$;

drop policy if exists company_files_insert on storage.objects;
create policy company_files_insert on storage.objects for insert to authenticated
with check(bucket_id='company-files' and app_private.can_upload_company_file_object(name));
drop policy if exists company_files_select on storage.objects;
create policy company_files_select on storage.objects for select to authenticated
using(bucket_id='company-files' and app_private.can_download_company_file_object(name));
drop policy if exists company_files_delete on storage.objects;
create policy company_files_delete on storage.objects for delete to authenticated
using(bucket_id='company-files' and app_private.can_delete_company_file_object(name));

-- ---------------------------------------------------------------------------
-- Document control lifecycle.
-- ---------------------------------------------------------------------------
create or replace function public.set_document_control_status(p_document_id uuid,p_status text,p_review_due_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='public','app_private','pg_temp'
as $$
declare d public.documents%rowtype;begin
  if p_status not in ('working','in_review','approved','rejected','superseded') then raise exception 'Invalid document control status'; end if;
  select * into d from public.documents where id=p_document_id and state='active' for update;if not found then raise exception 'Document not found'; end if;
  if not app_private.user_has_resource_permission(auth.uid(),d.company_id,'files.manage',d.project_id,d.site_id,d.folder_id,null) then raise exception 'Permission denied'; end if;
  if not app_private.project_context_operational(d.project_id,d.site_id) then raise exception 'Project or site is archived'; end if;
  update public.documents set control_status=p_status,review_due_at=p_review_due_at,
    approved_at=case when p_status='approved' then now() else null end,
    approved_by=case when p_status='approved' then auth.uid() else null end
  where id=d.id returning * into d;
  perform app_private.notify_resource_members(d.company_id,auth.uid(),'document.control_status_changed','تم تحديث حالة المستند','Document control status updated',d.display_name,d.display_name,'document',d.id,'files.view',d.project_id,d.site_id,d.folder_id,null);
  return to_jsonb(d);
end $$;

-- ---------------------------------------------------------------------------
-- Read models: Project 360, Site 360, Document 360, storage intelligence.
-- ---------------------------------------------------------------------------
create or replace function public.project_360(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','app_private','pg_temp'
as $$
declare p public.projects%rowtype;v_manage boolean;begin
  select * into p from public.projects where id=p_project_id;if not found or not app_private.user_has_resource_permission(auth.uid(),p.company_id,'projects.view',p.id,null,null,null) then raise exception 'Permission denied'; end if;
  v_manage:=app_private.user_has_company_permission(auth.uid(),p.company_id,'projects.edit');
  return jsonb_build_object(
    'project',to_jsonb(p),
    'manager_name',(select full_name from public.profiles where id=p.manager_user_id),
    'stats',jsonb_build_object(
      'sites',(select count(*) from public.sites s where s.project_id=p.id and s.archived_at is null),
      'folders',(select count(*) from public.folders f where f.project_id=p.id and f.trashed_at is null and app_private.user_has_resource_permission(auth.uid(),p.company_id,'files.view',p.id,f.site_id,f.id,null)),
      'documents',(select count(*) from public.documents d where d.project_id=p.id and d.state='active' and app_private.user_has_resource_permission(auth.uid(),p.company_id,'files.view',p.id,d.site_id,d.folder_id,null)),
      'storage_bytes',(select coalesce(sum(v.size_bytes),0) from public.document_versions v join public.documents d on d.id=v.document_id where d.project_id=p.id and v.upload_state='ready' and app_private.user_has_resource_permission(auth.uid(),p.company_id,'files.view',p.id,d.site_id,d.folder_id,null)),
      'open_tasks',(select count(*) from public.tasks t where t.project_id=p.id and t.status not in ('done','cancelled') and app_private.can_view_task(t.id)),
      'overdue_tasks',(select count(*) from public.tasks t where t.project_id=p.id and t.status not in ('done','cancelled') and t.due_at<now() and app_private.can_view_task(t.id)),
      'blocked_tasks',(select count(*) from public.tasks t where t.project_id=p.id and t.status='blocked' and app_private.can_view_task(t.id)),
      'drawings',(select count(*) from public.engineering_drawings d where d.project_id=p.id and d.archived_at is null and app_private.can_view_engineering_drawing(d.id)),
      'milestones',(select count(*) from public.work_milestones m where m.project_id=p.id)
    ),
    'sites',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code,'name',s.name,'status',s.status,'manager_user_id',s.manager_user_id,'manager_name',pr.full_name,'address',s.address,'archived_at',s.archived_at) order by s.archived_at nulls first,s.name) from public.sites s left join public.profiles pr on pr.id=s.manager_user_id where s.project_id=p.id and app_private.user_has_resource_permission(auth.uid(),p.company_id,'projects.view',p.id,s.id,null,null)),'[]'::jsonb),
    'health',jsonb_build_object(
      'score',greatest(0,100-least(35,(select count(*)*5 from public.tasks t where t.project_id=p.id and t.status not in ('done','cancelled') and t.due_at<now() and app_private.can_view_task(t.id)))-least(25,(select count(*)*5 from public.tasks t where t.project_id=p.id and t.status='blocked' and app_private.can_view_task(t.id)))),
      'archived',p.archived_at is not null
    ),
    'recent_activity',case when app_private.user_has_company_permission(auth.uid(),p.company_id,'audit.view') then coalesce((select jsonb_agg(x order by x.created_at desc) from (select a.id,a.action,a.entity_type,a.entity_id,a.actor_id,a.metadata,a.created_at from public.audit_events a where a.company_id=p.company_id and (a.entity_id=p.id or a.metadata#>>'{after,project_id}'=p.id::text or a.metadata#>>'{before,project_id}'=p.id::text) order by a.created_at desc limit 15)x),'[]'::jsonb) else '[]'::jsonb end,
    'can_manage',v_manage
  );
end $$;

create or replace function public.site_360(p_site_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','app_private','pg_temp'
as $$
declare s public.sites%rowtype;p public.projects%rowtype;begin
  select * into s from public.sites where id=p_site_id;if not found then raise exception 'Site not found'; end if;select * into p from public.projects where id=s.project_id;
  if not app_private.user_has_resource_permission(auth.uid(),s.company_id,'projects.view',s.project_id,s.id,null,null) then raise exception 'Permission denied'; end if;
  return jsonb_build_object('site',to_jsonb(s),'project',jsonb_build_object('id',p.id,'code',p.code,'name',p.name),'manager_name',(select full_name from public.profiles where id=s.manager_user_id),
    'stats',jsonb_build_object(
      'folders',(select count(*) from public.folders f where f.site_id=s.id and f.trashed_at is null and app_private.user_has_resource_permission(auth.uid(),s.company_id,'files.view',s.project_id,s.id,f.id,null)),
      'documents',(select count(*) from public.documents d where d.site_id=s.id and d.state='active' and app_private.user_has_resource_permission(auth.uid(),s.company_id,'files.view',s.project_id,s.id,d.folder_id,null)),
      'storage_bytes',(select coalesce(sum(v.size_bytes),0) from public.document_versions v join public.documents d on d.id=v.document_id where d.site_id=s.id and v.upload_state='ready' and app_private.user_has_resource_permission(auth.uid(),s.company_id,'files.view',s.project_id,s.id,d.folder_id,null)),
      'open_tasks',(select count(*) from public.tasks t where t.site_id=s.id and t.status not in ('done','cancelled') and app_private.can_view_task(t.id)),
      'overdue_tasks',(select count(*) from public.tasks t where t.site_id=s.id and t.status not in ('done','cancelled') and t.due_at<now() and app_private.can_view_task(t.id)),
      'drawings',(select count(*) from public.engineering_drawings d where d.site_id=s.id and d.archived_at is null and app_private.can_view_engineering_drawing(d.id))
    ));
end $$;

create or replace function public.document_360(p_document_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','app_private','pg_temp'
as $$
declare d public.documents%rowtype;begin
  select * into d from public.documents where id=p_document_id;if not found or not app_private.user_has_resource_permission(auth.uid(),d.company_id,'files.view',d.project_id,d.site_id,d.folder_id,null) then raise exception 'Permission denied'; end if;
  return jsonb_build_object(
    'document',to_jsonb(d)-'search_vector',
    'project',(select jsonb_build_object('id',p.id,'code',p.code,'name',p.name) from public.projects p where p.id=d.project_id),
    'site',(select jsonb_build_object('id',s.id,'code',s.code,'name',s.name) from public.sites s where s.id=d.site_id),
    'folder',(select jsonb_build_object('id',f.id,'name',f.name,'code',f.code) from public.folders f where f.id=d.folder_id),
    'owner_name',(select full_name from public.profiles where id=d.owner_user_id),
    'versions',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'version_number',v.version_number,'version_label',v.version_label,'original_filename',v.original_filename,'mime_type',v.mime_type,'size_bytes',v.size_bytes,'checksum_sha256',v.checksum_sha256,'upload_state',v.upload_state,'change_note',v.change_note,'uploaded_by',v.uploaded_by,'uploader_name',p.full_name,'created_at',v.created_at,'finalized_at',v.finalized_at) order by v.version_number desc) from public.document_versions v left join public.profiles p on p.id=v.uploaded_by where v.document_id=d.id),'[]'::jsonb),
    'linked_tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'task_number',t.task_number,'title',t.title,'status',t.status,'priority',t.priority,'due_at',t.due_at)) from public.tasks t where t.document_id=d.id and app_private.can_view_task(t.id)),'[]'::jsonb),
    'linked_drawings',coalesce((select jsonb_agg(jsonb_build_object('id',ed.id,'drawing_no',ed.drawing_no,'title',ed.title,'revision_id',l.revision_id,'relation_type',l.relation_type)) from public.engineering_document_links l join public.engineering_drawings ed on ed.id=l.drawing_id where l.document_id=d.id and app_private.can_view_engineering_drawing(ed.id)),'[]'::jsonb),
    'recent_activity',case when app_private.user_has_company_permission(auth.uid(),d.company_id,'audit.view') then coalesce((select jsonb_agg(x order by x.created_at desc) from (select a.id,a.action,a.actor_id,a.metadata,a.created_at from public.audit_events a where a.company_id=d.company_id and a.entity_id=d.id order by a.created_at desc limit 20)x),'[]'::jsonb) else '[]'::jsonb end
  );
end $$;

create or replace function public.company_storage_intelligence(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','app_private','pg_temp'
as $$
begin
  if auth.uid() is null or not app_private.user_has_company_permission(auth.uid(),p_company_id,'files.view') then raise exception 'Permission denied'; end if;
  return jsonb_build_object(
    'used_bytes',(select coalesce(sum(v.size_bytes),0) from public.document_versions v join public.documents d on d.id=v.document_id where d.company_id=p_company_id and v.upload_state='ready' and app_private.user_has_resource_permission(auth.uid(),p_company_id,'files.view',d.project_id,d.site_id,d.folder_id,null)),
    'trash_bytes',(select coalesce(sum(v.size_bytes),0) from public.document_versions v join public.documents d on d.id=v.document_id where d.company_id=p_company_id and d.state='trashed' and v.upload_state='ready' and app_private.user_has_resource_permission(auth.uid(),p_company_id,'files.view',d.project_id,d.site_id,d.folder_id,null)),
    'old_version_bytes',(select coalesce(sum(v.size_bytes),0) from public.document_versions v join public.documents d on d.id=v.document_id where d.company_id=p_company_id and v.upload_state='ready' and v.id is distinct from d.current_version_id and app_private.user_has_resource_permission(auth.uid(),p_company_id,'files.view',d.project_id,d.site_id,d.folder_id,null)),
    'largest_files',coalesce((select jsonb_agg(x) from (select d.id,d.display_name,d.project_id,d.site_id,d.folder_id,v.size_bytes from public.documents d join public.document_versions v on v.id=d.current_version_id where d.company_id=p_company_id and d.state='active' and app_private.user_has_resource_permission(auth.uid(),p_company_id,'files.view',d.project_id,d.site_id,d.folder_id,null) order by v.size_bytes desc limit 10)x),'[]'::jsonb),
    'by_project',coalesce((select jsonb_agg(x order by x.bytes desc) from (select p.id,p.code,p.name,coalesce(sum(v.size_bytes),0) bytes from public.projects p left join public.documents d on d.project_id=p.id and d.state='active' left join public.document_versions v on v.document_id=d.id and v.upload_state='ready' where p.company_id=p_company_id and app_private.user_has_resource_permission(auth.uid(),p_company_id,'projects.view',p.id,null,null,null) group by p.id,p.code,p.name)x),'[]'::jsonb),
    'by_type',coalesce((select jsonb_agg(x order by x.bytes desc) from (select d.document_type,count(distinct d.id) documents,coalesce(sum(v.size_bytes),0) bytes from public.documents d left join public.document_versions v on v.document_id=d.id and v.upload_state='ready' where d.company_id=p_company_id and d.state='active' and app_private.user_has_resource_permission(auth.uid(),p_company_id,'files.view',d.project_id,d.site_id,d.folder_id,null) group by d.document_type)x),'[]'::jsonb),
    'max_storage_bytes',(select max_storage_bytes from app_private.effective_company_limits(p_company_id))
  );
end $$;

create or replace function public.document_search_v2(p_company_id uuid,p_query text,p_project_id uuid default null,p_site_id uuid default null,p_document_type text default null,p_limit integer default 50,p_offset integer default 0)
returns table(id uuid,display_name text,document_type text,control_status text,project_id uuid,site_id uuid,folder_id uuid,system_code text,tags text[],updated_at timestamptz,rank real)
language sql stable security definer set search_path='public','app_private','pg_temp'
as $$
  with q as(select websearch_to_tsquery('simple',trim(p_query)) tsq,trim(p_query) raw)
  select d.id,d.display_name,d.document_type,d.control_status,d.project_id,d.site_id,d.folder_id,d.system_code,d.tags,d.updated_at,
    (case when q.raw='' then 0 else ts_rank_cd(d.search_vector,q.tsq) end + case when d.display_name ilike '%'||q.raw||'%' then 1 else 0 end)::real rank
  from public.documents d cross join q
  where d.company_id=p_company_id and d.state='active'
    and (p_project_id is null or d.project_id=p_project_id) and (p_site_id is null or d.site_id=p_site_id)
    and (p_document_type is null or d.document_type=p_document_type)
    and app_private.user_has_resource_permission(auth.uid(),p_company_id,'files.view',d.project_id,d.site_id,d.folder_id,null)
    and (q.raw='' or d.search_vector @@ q.tsq or d.display_name ilike '%'||q.raw||'%' or coalesce(d.system_code,'') ilike '%'||q.raw||'%' or exists(select 1 from unnest(d.tags) t where t ilike '%'||q.raw||'%'))
  order by rank desc,d.updated_at desc limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(coalesce(p_offset,0),0);
$$;

create or replace function public.trash_query(p_company_id uuid,p_query text default null,p_project_id uuid default null,p_site_id uuid default null,p_limit integer default 100,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='public','app_private','pg_temp'
as $$
declare q text:=trim(coalesce(p_query,''));begin
  if auth.uid() is null or not app_private.user_has_company_permission(auth.uid(),p_company_id,'files.view') then raise exception 'Permission denied'; end if;
  return jsonb_build_object(
    'folders',coalesce((select jsonb_agg(x order by x.trashed_at desc) from (select f.id,f.name,f.code,f.project_id,f.site_id,f.parent_id,f.trashed_at,f.trashed_by,f.trash_batch_id,f.trash_origin,p.name project_name,s.name site_name,pr.full_name trashed_by_name from public.folders f join public.projects p on p.id=f.project_id left join public.sites s on s.id=f.site_id left join public.profiles pr on pr.id=f.trashed_by where f.company_id=p_company_id and f.trashed_at is not null and f.trash_origin<>'ancestor' and not f.is_system and (p_project_id is null or f.project_id=p_project_id) and (p_site_id is null or f.site_id=p_site_id) and (q='' or f.name ilike '%'||q||'%' or coalesce(f.code,'') ilike '%'||q||'%') and app_private.user_has_resource_permission(auth.uid(),p_company_id,'files.view',f.project_id,f.site_id,f.id,null) order by f.trashed_at desc limit greatest(1,least(coalesce(p_limit,100),200)) offset greatest(coalesce(p_offset,0),0))x),'[]'::jsonb),
    'documents',coalesce((select jsonb_agg(x order by x.trashed_at desc) from (select d.id,d.display_name,d.document_type,d.project_id,d.site_id,d.folder_id,d.trashed_at,d.trashed_by,d.trash_origin,p.name project_name,s.name site_name,pr.full_name trashed_by_name,(select size_bytes from public.document_versions v where v.id=d.current_version_id) size_bytes from public.documents d join public.projects p on p.id=d.project_id left join public.sites s on s.id=d.site_id left join public.profiles pr on pr.id=d.trashed_by where d.company_id=p_company_id and d.state='trashed' and d.trash_origin<>'ancestor' and (p_project_id is null or d.project_id=p_project_id) and (p_site_id is null or d.site_id=p_site_id) and (q='' or d.display_name ilike '%'||q||'%') and app_private.user_has_resource_permission(auth.uid(),p_company_id,'files.view',d.project_id,d.site_id,d.folder_id,null) order by d.trashed_at desc limit greatest(1,least(coalesce(p_limit,100),200)) offset greatest(coalesce(p_offset,0),0))x),'[]'::jsonb),
    'hidden_descendants',(select count(*) from public.folders f where f.company_id=p_company_id and f.trashed_at is not null and f.trash_origin='ancestor')+(select count(*) from public.documents d where d.company_id=p_company_id and d.state='trashed' and d.trash_origin='ancestor')
  );
end $$;

-- Deep-link resolver shared by Search / Notifications / Activity.
create or replace function public.resolve_entity_context(p_entity_type text,p_entity_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','app_private','pg_temp'
as $$
declare r jsonb;begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_entity_type in ('project','projects') then
    select jsonb_build_object('type','project','project_id',p.id,'page','projects') into r from public.projects p where p.id=p_entity_id and app_private.user_has_resource_permission(auth.uid(),p.company_id,'projects.view',p.id,null,null,null);
  elsif p_entity_type in ('site','sites') then
    select jsonb_build_object('type','site','project_id',s.project_id,'site_id',s.id,'page','projects') into r from public.sites s where s.id=p_entity_id and app_private.user_has_resource_permission(auth.uid(),s.company_id,'projects.view',s.project_id,s.id,null,null);
  elsif p_entity_type in ('folder','folders') then
    select jsonb_build_object('type','folder','project_id',f.project_id,'site_id',f.site_id,'folder_id',f.id,'page','files') into r from public.folders f where f.id=p_entity_id and app_private.user_has_resource_permission(auth.uid(),f.company_id,'files.view',f.project_id,f.site_id,f.id,null);
  elsif p_entity_type in ('document','documents') then
    select jsonb_build_object('type','document','project_id',d.project_id,'site_id',d.site_id,'folder_id',d.folder_id,'document_id',d.id,'page','files') into r from public.documents d where d.id=p_entity_id and app_private.user_has_resource_permission(auth.uid(),d.company_id,'files.view',d.project_id,d.site_id,d.folder_id,null);
  elsif p_entity_type in ('task','tasks') then
    select jsonb_build_object('type','task','project_id',t.project_id,'site_id',t.site_id,'folder_id',t.folder_id,'document_id',t.document_id,'task_id',t.id,'page','tasks') into r from public.tasks t where t.id=p_entity_id and app_private.can_view_task(t.id);
  elsif p_entity_type in ('engineering_drawing','engineering_drawings') then
    select jsonb_build_object('type','engineering_drawing','project_id',d.project_id,'site_id',d.site_id,'folder_id',d.folder_id,'drawing_id',d.id,'page','engineering') into r from public.engineering_drawings d where d.id=p_entity_id and app_private.can_view_engineering_drawing(d.id);
  end if;
  if r is null then raise exception 'Entity is unavailable or outside your access scope'; end if;
  return r;
end $$;

-- Explicit API surface grants. New Supabase projects no longer auto-expose tables/functions.
revoke all on function public.save_project(jsonb) from public,anon;
revoke all on function public.save_site(jsonb) from public,anon;
revoke all on function public.project_archive_impact(uuid) from public,anon;
revoke all on function public.archive_project(uuid,boolean) from public,anon;
revoke all on function public.reactivate_project(uuid) from public,anon;
revoke all on function public.site_archive_impact(uuid) from public,anon;
revoke all on function public.archive_site(uuid,boolean) from public,anon;
revoke all on function public.reactivate_site(uuid) from public,anon;
revoke all on function public.project_360(uuid) from public,anon;
revoke all on function public.site_360(uuid) from public,anon;
revoke all on function public.document_360(uuid) from public,anon;
revoke all on function public.company_storage_intelligence(uuid) from public,anon;
revoke all on function public.document_search_v2(uuid,text,uuid,uuid,text,integer,integer) from public,anon;
revoke all on function public.trash_query(uuid,text,uuid,uuid,integer,integer) from public,anon;
revoke all on function public.resolve_entity_context(text,uuid) from public,anon;
revoke all on function public.set_document_control_status(uuid,text,timestamptz) from public,anon;

grant execute on function public.save_project(jsonb),public.save_site(jsonb),public.project_archive_impact(uuid),public.archive_project(uuid,boolean),public.reactivate_project(uuid),public.site_archive_impact(uuid),public.archive_site(uuid,boolean),public.reactivate_site(uuid),public.project_360(uuid),public.site_360(uuid),public.document_360(uuid),public.company_storage_intelligence(uuid),public.document_search_v2(uuid,text,uuid,uuid,text,integer,integer),public.trash_query(uuid,text,uuid,uuid,integer,integer),public.resolve_entity_context(text,uuid),public.set_document_control_status(uuid,text,timestamptz) to authenticated;

commit;
