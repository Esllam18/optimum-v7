begin;

create table if not exists public.project_blueprints(
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  code text not null,
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  project_type text,
  folder_template_id uuid references public.folder_templates(id) on delete set null,
  defaults jsonb not null default '{}'::jsonb,
  naming_rules jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,code)
);

alter table public.projects add column if not exists blueprint_id uuid references public.project_blueprints(id) on delete set null;
create index if not exists project_blueprints_company_active_idx on public.project_blueprints(company_id,is_active,code);
create index if not exists projects_blueprint_idx on public.projects(blueprint_id) where blueprint_id is not null;

alter table public.project_blueprints enable row level security;
drop policy if exists project_blueprints_select on public.project_blueprints;
create policy project_blueprints_select on public.project_blueprints for select to authenticated using(company_id is null or app_private.is_company_member(company_id));
revoke all on public.project_blueprints from anon,authenticated;
grant select on public.project_blueprints to authenticated;

-- Build two extra global folder structures in addition to the existing Standard Engineering template.
do $$
declare t_fiber uuid;t_build uuid;begin
  select id into t_fiber from public.folder_templates where company_id is null and name_en='Fiber Delivery Structure' limit 1;
  if t_fiber is null then
    insert into public.folder_templates(company_id,name_ar,name_en,description_ar,description_en,is_default,is_active)
    values(null,'هيكل مشاريع الألياف','Fiber Delivery Structure','هيكل معلومات جاهز لمشاريع الألياف من المسح حتى التسليم.','Information structure for fiber delivery from survey to handover.',false,true) returning id into t_fiber;
    insert into public.folder_template_nodes(template_id,code,name_ar,name_en,sort_order,is_system,allows_children) values
      (t_fiber,'01','الإدارة والعقود','Administration & Contracts',10,true,true),
      (t_fiber,'02','المسح والموقع','Survey & Site',20,true,true),
      (t_fiber,'03','التصميم','Design',30,true,true),
      (t_fiber,'04','الاعتمادات','Approvals',40,true,true),
      (t_fiber,'05','التنفيذ','Implementation',50,true,true),
      (t_fiber,'06','الاختبارات','Testing',60,true,true),
      (t_fiber,'07','As-Built','As-Built',70,true,true),
      (t_fiber,'08','التسليم','Handover',80,true,true);
  end if;
  select id into t_build from public.folder_templates where company_id is null and name_en='Construction Delivery Structure' limit 1;
  if t_build is null then
    insert into public.folder_templates(company_id,name_ar,name_en,description_ar,description_en,is_default,is_active)
    values(null,'هيكل مشاريع الإنشاءات','Construction Delivery Structure','هيكل تحكم مستندي لمشاريع الإنشاءات.','Document-control structure for construction delivery.',false,true) returning id into t_build;
    insert into public.folder_template_nodes(template_id,code,name_ar,name_en,sort_order,is_system,allows_children) values
      (t_build,'01','العقود','Contracts',10,true,true),
      (t_build,'02','التصميم','Design',20,true,true),
      (t_build,'03','المخططات المقدمة','Submittals',30,true,true),
      (t_build,'04','طلبات المعلومات','RFIs',40,true,true),
      (t_build,'05','الموقع والتنفيذ','Site Execution',50,true,true),
      (t_build,'06','الجودة','QA/QC',60,true,true),
      (t_build,'07','التقدم والتقارير','Progress & Reports',70,true,true),
      (t_build,'08','As-Built','As-Built',80,true,true),
      (t_build,'09','التسليم','Handover',90,true,true);
  end if;

  insert into public.project_blueprints(company_id,code,name_ar,name_en,description_ar,description_en,project_type,folder_template_id,defaults,naming_rules,is_active,is_default)
  select null,'standard-engineering','هندسي قياسي','Standard Engineering','هيكل هندسي عام مناسب كبداية لمعظم المشاريع.','General engineering workspace with a comprehensive information structure.','engineering',ft.id,'{"status":"active"}'::jsonb,'{"project_code":"UPPER","document_code":"PROJECT-DISCIPLINE-SEQUENCE"}'::jsonb,true,true
  from public.folder_templates ft where ft.company_id is null and ft.is_default and ft.is_active
  on conflict(company_id,code) do nothing;

  insert into public.project_blueprints(company_id,code,name_ar,name_en,description_ar,description_en,project_type,folder_template_id,defaults,naming_rules,is_active,is_default)
  values
    (null,'fiber-delivery','تسليم شبكات الألياف','Fiber Delivery','من المسح والتصميم حتى الاختبار وAs-Built والتسليم.','Survey, design, implementation, testing, as-built and handover.','fiber',t_fiber,'{"status":"active"}'::jsonb,'{"project_code":"UPPER","document_code":"PROJECT-FIBER-TYPE-SEQUENCE"}'::jsonb,true,false),
    (null,'construction-delivery','تسليم مشاريع الإنشاءات','Construction Delivery','تحكم مستندي للمخططات والاعتمادات وRFI والجودة والتسليم.','Document control for submittals, approvals, RFIs, QA/QC and handover.','construction',t_build,'{"status":"active"}'::jsonb,'{"project_code":"UPPER","document_code":"PROJECT-DISCIPLINE-TYPE-SEQUENCE"}'::jsonb,true,false)
  on conflict(company_id,code) do nothing;
end $$;

create or replace function app_private.instantiate_default_folders(p_project_id uuid,p_site_id uuid default null)
returns void language plpgsql security definer set search_path='public','pg_temp'
as $$
declare v_company uuid;v_creator uuid;v_template uuid;v_node record;v_parent_folder uuid;begin
  select p.company_id,p.created_by,coalesce(pb.folder_template_id,(select ft.id from public.folder_templates ft where ft.company_id=p.company_id and ft.is_default and ft.is_active order by ft.created_at limit 1),(select ft.id from public.folder_templates ft where ft.company_id is null and ft.is_default and ft.is_active order by ft.created_at limit 1))
  into v_company,v_creator,v_template
  from public.projects p left join public.project_blueprints pb on pb.id=p.blueprint_id
  where p.id=p_project_id;
  if v_company is null or v_template is null then return;end if;
  if p_site_id is not null then select created_by into v_creator from public.sites where id=p_site_id and project_id=p_project_id;end if;
  for v_node in with recursive tree as(
    select n.*,0 lvl from public.folder_template_nodes n where n.template_id=v_template and n.parent_id is null
    union all select n.*,t.lvl+1 from public.folder_template_nodes n join tree t on n.parent_id=t.id
  ) select * from tree order by lvl,sort_order,id loop
    v_parent_folder:=null;
    if v_node.parent_id is not null then select id into v_parent_folder from public.folders where project_id=p_project_id and site_id is not distinct from p_site_id and template_node_id=v_node.parent_id and trashed_at is null limit 1;end if;
    if not exists(select 1 from public.folders where project_id=p_project_id and site_id is not distinct from p_site_id and template_node_id=v_node.id and trashed_at is null) then
      insert into public.folders(company_id,project_id,site_id,parent_id,template_node_id,name,code,sort_order,is_system,created_by)
      values(v_company,p_project_id,p_site_id,v_parent_folder,v_node.id,v_node.name_en,v_node.code,v_node.sort_order,true,v_creator);
    end if;
  end loop;
end $$;

create or replace function public.save_project(p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();v_id uuid:=nullif(p_payload->>'id','')::uuid;v_company uuid:=nullif(p_payload->>'company_id','')::uuid;
  v_row public.projects%rowtype;v_manager uuid:=nullif(p_payload->>'manager_user_id','')::uuid;v_blueprint uuid:=nullif(p_payload->>'blueprint_id','')::uuid;
  v_status public.project_status:=coalesce(nullif(p_payload->>'status','')::public.project_status,'active');v_blueprint_type text;
begin
  if v_uid is null then raise exception 'Authentication required';end if;
  if v_status='archived' then raise exception 'Use archive_project for archival';end if;
  if v_blueprint is not null then select project_type into v_blueprint_type from public.project_blueprints where id=v_blueprint and is_active and (company_id is null or company_id=v_company);if not found then raise exception 'Blueprint not available';end if;end if;
  if v_id is null then
    if v_company is null or not app_private.user_has_company_permission(v_uid,v_company,'projects.create') then raise exception 'Permission denied';end if;
    if v_manager is not null and not exists(select 1 from public.company_memberships m where m.company_id=v_company and m.user_id=v_manager and m.status='active') then raise exception 'Project manager must be an active company member';end if;
    insert into public.projects(company_id,code,name,description,status,created_by,project_type,client_name,manager_user_id,planned_start_date,target_end_date,progress_percent,blueprint_id)
    values(v_company,trim(p_payload->>'code'),trim(p_payload->>'name'),nullif(trim(p_payload->>'description'),''),v_status,v_uid,coalesce(nullif(trim(p_payload->>'project_type'),''),v_blueprint_type),nullif(trim(p_payload->>'client_name'),''),v_manager,nullif(p_payload->>'planned_start_date','')::date,nullif(p_payload->>'target_end_date','')::date,greatest(0,least(coalesce((p_payload->>'progress_percent')::int,0),100)),v_blueprint)
    returning * into v_row;
  else
    select * into v_row from public.projects where id=v_id for update;if not found then raise exception 'Project not found';end if;
    if not app_private.user_has_resource_permission(v_uid,v_row.company_id,'projects.edit',v_row.id,null,null,null) then raise exception 'Permission denied';end if;
    if v_row.archived_at is not null then raise exception 'Archived project must be reactivated before editing';end if;
    if v_manager is not null and not exists(select 1 from public.company_memberships m where m.company_id=v_row.company_id and m.user_id=v_manager and m.status='active') then raise exception 'Project manager must be an active company member';end if;
    update public.projects set code=trim(p_payload->>'code'),name=trim(p_payload->>'name'),description=nullif(trim(p_payload->>'description'),''),status=v_status,project_type=nullif(trim(p_payload->>'project_type'),''),client_name=nullif(trim(p_payload->>'client_name'),''),manager_user_id=v_manager,planned_start_date=nullif(p_payload->>'planned_start_date','')::date,target_end_date=nullif(p_payload->>'target_end_date','')::date,progress_percent=greatest(0,least(coalesce((p_payload->>'progress_percent')::int,progress_percent),100)) where id=v_row.id returning * into v_row;
  end if;
  perform app_private.notify_resource_members(v_row.company_id,v_uid,case when v_id is null then 'project.created' else 'project.updated' end,case when v_id is null then 'تم إنشاء مشروع' else 'تم تحديث مشروع' end,case when v_id is null then 'Project created' else 'Project updated' end,v_row.name,v_row.name,'project',v_row.id,'projects.view',v_row.id,null,null,null);
  return to_jsonb(v_row);
end $$;

create or replace function public.save_project_blueprint(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='public','app_private','pg_temp'
as $$
declare v_id uuid:=nullif(p_payload->>'id','')::uuid;v_company uuid:=nullif(p_payload->>'company_id','')::uuid;v public.project_blueprints%rowtype;begin
  if auth.uid() is null or v_company is null or not app_private.user_has_company_permission(auth.uid(),v_company,'projects.create') or not app_private.user_has_company_permission(auth.uid(),v_company,'files.manage') then raise exception 'Permission denied';end if;
  if v_id is null then insert into public.project_blueprints(company_id,code,name_ar,name_en,description_ar,description_en,project_type,folder_template_id,defaults,naming_rules,is_active,is_default,created_by) values(v_company,lower(trim(p_payload->>'code')),trim(p_payload->>'name_ar'),trim(p_payload->>'name_en'),nullif(trim(p_payload->>'description_ar'),''),nullif(trim(p_payload->>'description_en'),''),nullif(trim(p_payload->>'project_type'),''),nullif(p_payload->>'folder_template_id','')::uuid,coalesce(p_payload->'defaults','{}'::jsonb),coalesce(p_payload->'naming_rules','{}'::jsonb),coalesce((p_payload->>'is_active')::boolean,true),coalesce((p_payload->>'is_default')::boolean,false),auth.uid()) returning * into v;else select * into v from public.project_blueprints where id=v_id and company_id=v_company for update;if not found then raise exception 'Blueprint not found';end if;update public.project_blueprints set code=lower(trim(p_payload->>'code')),name_ar=trim(p_payload->>'name_ar'),name_en=trim(p_payload->>'name_en'),description_ar=nullif(trim(p_payload->>'description_ar'),''),description_en=nullif(trim(p_payload->>'description_en'),''),project_type=nullif(trim(p_payload->>'project_type'),''),folder_template_id=nullif(p_payload->>'folder_template_id','')::uuid,defaults=coalesce(p_payload->'defaults',defaults),naming_rules=coalesce(p_payload->'naming_rules',naming_rules),is_active=coalesce((p_payload->>'is_active')::boolean,is_active),is_default=coalesce((p_payload->>'is_default')::boolean,is_default),updated_at=now() where id=v.id returning * into v;end if;return to_jsonb(v);end $$;

-- Scoped trash notifications replace company-wide name leakage.
create or replace function public.trash_document(p_document_id uuid)
returns void language plpgsql security definer set search_path='public','app_private','pg_temp'
as $$ declare d public.documents%rowtype;b uuid:=gen_random_uuid();begin select * into d from public.documents where id=p_document_id and state<>'trashed' for update;if not found then raise exception 'Document not found';end if;if not app_private.user_has_resource_permission(auth.uid(),d.company_id,'files.archive',d.project_id,d.site_id,d.folder_id,null) then raise exception 'Permission denied';end if;update public.documents set state='trashed',trashed_at=now(),trashed_by=auth.uid(),trash_batch_id=b,trash_origin='direct',trash_root_folder_id=null where id=d.id;perform app_private.notify_resource_members(d.company_id,auth.uid(),'document.trashed','تم نقل ملف إلى السلة','A file was moved to trash',d.display_name,d.display_name,'document',d.id,'files.view',d.project_id,d.site_id,d.folder_id,null);end $$;

create or replace function public.trash_folder(p_folder_id uuid)
returns void language plpgsql security definer set search_path='public','app_private','pg_temp'
as $$ declare f public.folders%rowtype;b uuid:=gen_random_uuid();begin select * into f from public.folders where id=p_folder_id and trashed_at is null for update;if not found then raise exception 'Folder not found';end if;if f.is_system then raise exception 'System folders cannot be deleted';end if;if not app_private.user_has_resource_permission(auth.uid(),f.company_id,'files.archive',f.project_id,f.site_id,f.id,null) then raise exception 'Permission denied';end if;with recursive d as(select id from public.folders where id=f.id union all select x.id from public.folders x join d on x.parent_id=d.id) update public.documents set state='trashed',trashed_at=now(),trashed_by=auth.uid(),trash_batch_id=b,trash_origin='ancestor',trash_root_folder_id=f.id where folder_id in(select id from d) and state<>'trashed';with recursive d as(select id from public.folders where id=f.id union all select x.id from public.folders x join d on x.parent_id=d.id) update public.folders set trashed_at=now(),trashed_by=auth.uid(),trash_batch_id=b,trash_origin=case when id=f.id then 'direct' else 'ancestor' end,trash_root_folder_id=f.id where id in(select id from d) and trashed_at is null;perform app_private.notify_resource_members(f.company_id,auth.uid(),'folder.trashed','تم نقل مجلد إلى السلة','A folder was moved to trash',f.name,f.name,'folder',f.id,'files.view',f.project_id,f.site_id,f.id,null);end $$;

-- Fix Project 360 management visibility to resource scope, not company-wide role capability.
create or replace function public.project_360(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','app_private','pg_temp'
as $$ declare p public.projects%rowtype;v_manage boolean;begin select * into p from public.projects where id=p_project_id;if not found or not app_private.user_has_resource_permission(auth.uid(),p.company_id,'projects.view',p.id,null,null,null) then raise exception 'Permission denied';end if;v_manage:=app_private.user_has_resource_permission(auth.uid(),p.company_id,'projects.edit',p.id,null,null,null);return jsonb_build_object('project',to_jsonb(p),'blueprint',(select jsonb_build_object('id',b.id,'code',b.code,'name_ar',b.name_ar,'name_en',b.name_en) from public.project_blueprints b where b.id=p.blueprint_id),'manager_name',(select full_name from public.profiles where id=p.manager_user_id),'stats',jsonb_build_object('sites',(select count(*) from public.sites s where s.project_id=p.id and s.archived_at is null),'folders',(select count(*) from public.folders f where f.project_id=p.id and f.trashed_at is null and app_private.user_has_resource_permission(auth.uid(),p.company_id,'files.view',p.id,f.site_id,f.id,null)),'documents',(select count(*) from public.documents d where d.project_id=p.id and d.state='active' and app_private.user_has_resource_permission(auth.uid(),p.company_id,'files.view',p.id,d.site_id,d.folder_id,null)),'storage_bytes',(select coalesce(sum(v.size_bytes),0) from public.document_versions v join public.documents d on d.id=v.document_id where d.project_id=p.id and v.upload_state='ready' and app_private.user_has_resource_permission(auth.uid(),p.company_id,'files.view',p.id,d.site_id,d.folder_id,null)),'open_tasks',(select count(*) from public.tasks t where t.project_id=p.id and t.status not in ('done','cancelled') and app_private.can_view_task(t.id)),'overdue_tasks',(select count(*) from public.tasks t where t.project_id=p.id and t.status not in ('done','cancelled') and t.due_at<now() and app_private.can_view_task(t.id)),'blocked_tasks',(select count(*) from public.tasks t where t.project_id=p.id and t.status='blocked' and app_private.can_view_task(t.id)),'drawings',(select count(*) from public.engineering_drawings d where d.project_id=p.id and d.archived_at is null and app_private.can_view_engineering_drawing(d.id)),'milestones',(select count(*) from public.work_milestones m where m.project_id=p.id)),'sites',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code,'name',s.name,'status',s.status,'manager_user_id',s.manager_user_id,'manager_name',pr.full_name,'address',s.address,'archived_at',s.archived_at) order by s.archived_at nulls first,s.name) from public.sites s left join public.profiles pr on pr.id=s.manager_user_id where s.project_id=p.id and app_private.user_has_resource_permission(auth.uid(),p.company_id,'projects.view',p.id,s.id,null,null)),'[]'::jsonb),'health',jsonb_build_object('score',greatest(0,100-least(35,(select count(*)*5 from public.tasks t where t.project_id=p.id and t.status not in ('done','cancelled') and t.due_at<now() and app_private.can_view_task(t.id)))-least(25,(select count(*)*5 from public.tasks t where t.project_id=p.id and t.status='blocked' and app_private.can_view_task(t.id)))),'archived',p.archived_at is not null),'recent_activity',case when app_private.user_has_company_permission(auth.uid(),p.company_id,'audit.view') then coalesce((select jsonb_agg(x order by x.created_at desc) from(select a.id,a.action,a.entity_type,a.entity_id,a.actor_id,a.metadata,a.created_at from public.audit_events a where a.company_id=p.company_id and(a.entity_id=p.id or a.metadata#>>'{after,project_id}'=p.id::text or a.metadata#>>'{before,project_id}'=p.id::text) order by a.created_at desc limit 15)x),'[]'::jsonb) else '[]'::jsonb end,'can_manage',v_manage);end $$;

-- Public Data API is read-only for project/site domain; mutations must pass commands.
revoke insert,update,delete on public.projects from authenticated;
revoke insert,update,delete on public.sites from authenticated;

drop policy if exists projects_insert on public.projects;
drop policy if exists projects_update on public.projects;
drop policy if exists sites_insert on public.sites;
drop policy if exists sites_update on public.sites;

revoke all on function public.save_project_blueprint(jsonb) from public,anon;
grant execute on function public.save_project_blueprint(jsonb) to authenticated;

commit;
