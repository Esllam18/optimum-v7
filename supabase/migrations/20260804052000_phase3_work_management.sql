begin;

-- Optimum Phase 3: Work Management

DO $$ BEGIN
  CREATE TYPE public.task_status AS ENUM ('todo','in_progress','blocked','done','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.task_priority AS ENUM ('low','medium','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.task_visibility AS ENUM ('company','private');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.task_recurrence_frequency AS ENUM ('none','daily','weekly','monthly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.task_attachment_state AS ENUM ('uploading','ready','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

insert into public.permissions(key,module,description_ar,description_en) values
('tasks.view','tasks','عرض المهام المتاحة للمستخدم','View available tasks'),
('tasks.view_all','tasks','عرض جميع مهام الشركة','View all company tasks'),
('tasks.create','tasks','إنشاء مهام','Create tasks'),
('tasks.assign','tasks','تعيين المهام للأعضاء والأدوار','Assign tasks to members and roles'),
('tasks.edit','tasks','تعديل المهام','Edit tasks'),
('tasks.complete','tasks','تحديث حالة المهام وإكمالها','Update and complete tasks'),
('tasks.claim','tasks','استلام المهام المفتوحة','Claim open tasks'),
('tasks.comment','tasks','إضافة تعليقات على المهام','Comment on tasks'),
('tasks.attach','tasks','إضافة مرفقات للمهام','Attach files to tasks'),
('tasks.manage','tasks','إدارة جميع المهام والإعدادات المتقدمة','Manage all tasks and advanced settings')
on conflict (key) do update set module=excluded.module,description_ar=excluded.description_ar,description_en=excluded.description_en;

create table if not exists public.task_series (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 240),
  description text,
  priority public.task_priority not null default 'medium',
  visibility public.task_visibility not null default 'company',
  project_id uuid references public.projects(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  folder_id uuid references public.folders(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  frequency public.task_recurrence_frequency not null,
  recurrence_interval integer not null default 1 check (recurrence_interval between 1 and 365),
  next_start_at timestamptz,
  next_due_at timestamptz,
  ends_at timestamptz,
  checklist_template jsonb not null default '[]'::jsonb,
  open_unassigned boolean not null default false,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (frequency <> 'none'),
  check (visibility='company' or open_unassigned=false)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  task_number bigint generated always as identity,
  company_id uuid not null references public.companies(id) on delete cascade,
  series_id uuid references public.task_series(id) on delete set null,
  occurrence_at timestamptz,
  project_id uuid references public.projects(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  folder_id uuid references public.folders(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  title text not null check (char_length(trim(title)) between 2 and 240),
  description text,
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'medium',
  visibility public.task_visibility not null default 'company',
  open_unassigned boolean not null default false,
  claimed_by uuid references public.profiles(id),
  start_at timestamptz,
  due_at timestamptz,
  progress smallint not null default 0 check (progress between 0 and 100),
  blocked_reason text,
  completion_note text,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  cancelled_at timestamptz,
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector,
  check (due_at is null or start_at is null or due_at >= start_at),
  check (visibility='company' or open_unassigned=false),
  unique(series_id, occurrence_at)
);

create table if not exists public.task_series_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  series_id uuid not null references public.task_series(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role_id uuid references public.roles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((user_id is not null)::int + (role_id is not null)::int = 1)
);

create table if not exists public.task_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role_id uuid references public.roles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((user_id is not null)::int + (role_id is not null)::int = 1)
);

create unique index if not exists task_assignments_user_unique on public.task_assignments(task_id,user_id) where user_id is not null;
create unique index if not exists task_assignments_role_unique on public.task_assignments(task_id,role_id) where role_id is not null;
create unique index if not exists task_series_assignments_user_unique on public.task_series_assignments(series_id,user_id) where user_id is not null;
create unique index if not exists task_series_assignments_role_unique on public.task_series_assignments(series_id,role_id) where role_id is not null;

create table if not exists public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  position integer not null default 0,
  is_completed boolean not null default false,
  completed_by uuid references public.profiles(id),
  completed_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (char_length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  comment_id uuid references public.task_comments(id) on delete set null,
  storage_bucket text not null default 'task-attachments',
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  upload_state public.task_attachment_state not null default 'uploading',
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

create table if not exists public.task_events (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  event_type text not null,
  from_status public.task_status,
  to_status public.task_status,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tasks_company_status_due_idx on public.tasks(company_id,status,due_at);
create index if not exists tasks_company_created_idx on public.tasks(company_id,created_at desc);
create index if not exists tasks_created_by_idx on public.tasks(created_by);
create index if not exists tasks_claimed_by_idx on public.tasks(claimed_by) where claimed_by is not null;
create index if not exists tasks_project_idx on public.tasks(project_id) where project_id is not null;
create index if not exists tasks_site_idx on public.tasks(site_id) where site_id is not null;
create index if not exists tasks_folder_idx on public.tasks(folder_id) where folder_id is not null;
create index if not exists tasks_document_idx on public.tasks(document_id) where document_id is not null;
create index if not exists tasks_search_idx on public.tasks using gin(search_vector);
create index if not exists task_assignments_company_user_idx on public.task_assignments(company_id,user_id) where user_id is not null;
create index if not exists task_assignments_company_role_idx on public.task_assignments(company_id,role_id) where role_id is not null;
create index if not exists task_checklist_task_position_idx on public.task_checklist_items(task_id,position);
create index if not exists task_comments_task_created_idx on public.task_comments(task_id,created_at);
create index if not exists task_attachments_task_created_idx on public.task_attachments(task_id,created_at);
create index if not exists task_events_task_created_idx on public.task_events(task_id,created_at desc);
create index if not exists task_series_company_active_idx on public.task_series(company_id,is_active,next_due_at,next_start_at);

create or replace function app_private.validate_task_scope()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.project_id is not null and not exists(select 1 from public.projects p where p.id=new.project_id and p.company_id=new.company_id) then raise exception 'Project belongs to another company'; end if;
  if new.site_id is not null and not exists(select 1 from public.sites s where s.id=new.site_id and s.company_id=new.company_id and (new.project_id is null or s.project_id=new.project_id)) then raise exception 'Site belongs to another project or company'; end if;
  if new.folder_id is not null and not exists(select 1 from public.folders f where f.id=new.folder_id and f.company_id=new.company_id and f.trashed_at is null and (new.project_id is null or f.project_id=new.project_id) and (new.site_id is null or f.site_id=new.site_id)) then raise exception 'Folder belongs to another scope'; end if;
  if new.document_id is not null and not exists(select 1 from public.documents d where d.id=new.document_id and d.company_id=new.company_id and d.state='active' and (new.project_id is null or d.project_id=new.project_id) and (new.site_id is null or d.site_id=new.site_id)) then raise exception 'Document belongs to another scope'; end if;
  return new;
end; $$;

create or replace function app_private.update_task_search_vector()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  new.search_vector := to_tsvector('simple', concat_ws(' ',new.title,new.description,new.task_number::text,new.status::text,new.priority::text));
  return new;
end; $$;

create or replace function app_private.can_view_task(p_task_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.tasks t
    left join public.company_memberships m on m.company_id=t.company_id and m.user_id=auth.uid() and m.status='active'
    where t.id=p_task_id and m.id is not null and app_private.company_is_operational(t.company_id)
      and app_private.has_company_permission(t.company_id,'tasks.view')
      and (
        app_private.has_company_permission(t.company_id,'tasks.view_all')
        or t.created_by=auth.uid()
        or t.claimed_by=auth.uid()
        or (t.visibility='company' and t.open_unassigned=true)
        or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.user_id=auth.uid())
        or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.role_id=m.role_id)
      )
  );
$$;

create or replace function app_private.can_edit_task(p_task_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.tasks t
    left join public.company_memberships m on m.company_id=t.company_id and m.user_id=auth.uid() and m.status='active'
    where t.id=p_task_id and m.id is not null and app_private.company_is_operational(t.company_id)
      and (
        app_private.has_company_permission(t.company_id,'tasks.manage')
        or (app_private.has_company_permission(t.company_id,'tasks.edit') and (
          t.created_by=auth.uid() or t.claimed_by=auth.uid()
          or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.user_id=auth.uid())
          or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.role_id=m.role_id)
        ))
      )
  );
$$;

create or replace function app_private.can_complete_task(p_task_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.tasks t
    left join public.company_memberships m on m.company_id=t.company_id and m.user_id=auth.uid() and m.status='active'
    where t.id=p_task_id and m.id is not null and app_private.company_is_operational(t.company_id)
      and (
        app_private.has_company_permission(t.company_id,'tasks.manage')
        or (app_private.has_company_permission(t.company_id,'tasks.complete') and (
          t.created_by=auth.uid() or t.claimed_by=auth.uid()
          or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.user_id=auth.uid())
          or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.role_id=m.role_id)
        ))
      )
  );
$$;

create or replace function app_private.task_next_timestamp(p_value timestamptz,p_frequency public.task_recurrence_frequency,p_interval integer)
returns timestamptz language sql immutable set search_path=public,pg_temp as $$
  select case p_frequency when 'daily' then p_value + make_interval(days=>p_interval)
    when 'weekly' then p_value + make_interval(weeks=>p_interval)
    when 'monthly' then p_value + make_interval(months=>p_interval)
    else null end;
$$;

create or replace function app_private.copy_task_assignments(p_task_id uuid,p_series_id uuid,p_company_id uuid,p_actor uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.task_assignments(company_id,task_id,user_id,role_id,assigned_by)
  select p_company_id,p_task_id,user_id,role_id,p_actor from public.task_series_assignments where series_id=p_series_id
  on conflict do nothing;
end; $$;

create or replace function app_private.copy_task_checklist(p_task_id uuid,p_company_id uuid,p_actor uuid,p_template jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_item jsonb; v_pos integer:=0;
begin
  if p_template is null or jsonb_typeof(p_template)<>'array' then return; end if;
  for v_item in select value from jsonb_array_elements(p_template) loop
    if char_length(trim(coalesce(v_item->>'body',v_item#>>'{}',''))) > 0 then
      insert into public.task_checklist_items(company_id,task_id,body,position,created_by)
      values(p_company_id,p_task_id,left(trim(coalesce(v_item->>'body',v_item#>>'{}')),500),v_pos,p_actor);
      v_pos:=v_pos+1;
    end if;
  end loop;
end; $$;

create trigger tasks_validate_scope before insert or update of company_id,project_id,site_id,folder_id,document_id on public.tasks for each row execute function app_private.validate_task_scope();
create trigger task_series_validate_scope before insert or update of company_id,project_id,site_id,folder_id,document_id on public.task_series for each row execute function app_private.validate_task_scope();
create trigger tasks_search_vector before insert or update of title,description,status,priority on public.tasks for each row execute function app_private.update_task_search_vector();
create trigger tasks_set_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create trigger task_series_set_updated_at before update on public.task_series for each row execute function public.set_updated_at();
create trigger task_checklist_set_updated_at before update on public.task_checklist_items for each row execute function public.set_updated_at();
create trigger task_comments_set_updated_at before update on public.task_comments for each row execute function public.set_updated_at();

create or replace function public.create_task(
  p_company_id uuid,p_title text,p_description text default null,p_priority public.task_priority default 'medium',
  p_project_id uuid default null,p_site_id uuid default null,p_folder_id uuid default null,p_document_id uuid default null,
  p_start_at timestamptz default null,p_due_at timestamptz default null,p_visibility public.task_visibility default 'company',
  p_open_unassigned boolean default false,p_assignee_user_ids uuid[] default array[]::uuid[],p_assignee_role_ids uuid[] default array[]::uuid[],
  p_checklist jsonb default '[]'::jsonb,p_recurrence public.task_recurrence_frequency default 'none',p_recurrence_interval integer default 1,p_recurrence_ends_at timestamptz default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_task uuid;v_series uuid;v_user uuid;v_role uuid;v_occ timestamptz:=coalesce(p_start_at,p_due_at,now());
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.company_is_operational(p_company_id) or not app_private.has_company_permission(p_company_id,'tasks.create') then raise exception 'Permission denied'; end if;
  if char_length(trim(p_title))<2 then raise exception 'Task title is required'; end if;
  if p_due_at is not null and p_start_at is not null and p_due_at<p_start_at then raise exception 'Due date must be after start date'; end if;
  if p_visibility='private' and (p_open_unassigned or cardinality(p_assignee_user_ids)>0 or cardinality(p_assignee_role_ids)>0) then raise exception 'Private tasks cannot be assigned'; end if;
  if (cardinality(p_assignee_user_ids)>0 or cardinality(p_assignee_role_ids)>0) and not app_private.has_company_permission(p_company_id,'tasks.assign') then raise exception 'Permission denied'; end if;
  if p_open_unassigned and p_visibility<>'company' then raise exception 'Open tasks must be visible to the company'; end if;
  if p_recurrence<>'none' then
    insert into public.task_series(company_id,title,description,priority,visibility,project_id,site_id,folder_id,document_id,frequency,recurrence_interval,next_start_at,next_due_at,ends_at,checklist_template,open_unassigned,created_by)
    values(p_company_id,trim(p_title),nullif(trim(p_description),''),p_priority,p_visibility,p_project_id,p_site_id,p_folder_id,p_document_id,p_recurrence,greatest(p_recurrence_interval,1),
      case when p_start_at is null then null else app_private.task_next_timestamp(p_start_at,p_recurrence,greatest(p_recurrence_interval,1)) end,
      case when p_due_at is null then app_private.task_next_timestamp(v_occ,p_recurrence,greatest(p_recurrence_interval,1)) else app_private.task_next_timestamp(p_due_at,p_recurrence,greatest(p_recurrence_interval,1)) end,
      p_recurrence_ends_at,coalesce(p_checklist,'[]'::jsonb),p_open_unassigned,auth.uid()) returning id into v_series;
    foreach v_user in array coalesce(p_assignee_user_ids,array[]::uuid[]) loop
      if not exists(select 1 from public.company_memberships m where m.company_id=p_company_id and m.user_id=v_user and m.status='active') then raise exception 'Assignee is not an active company member'; end if;
      insert into public.task_series_assignments(company_id,series_id,user_id,assigned_by) values(p_company_id,v_series,v_user,auth.uid());
    end loop;
    foreach v_role in array coalesce(p_assignee_role_ids,array[]::uuid[]) loop
      if not exists(select 1 from public.roles r where r.company_id=p_company_id and r.id=v_role) then raise exception 'Role belongs to another company'; end if;
      insert into public.task_series_assignments(company_id,series_id,role_id,assigned_by) values(p_company_id,v_series,v_role,auth.uid());
    end loop;
  end if;
  insert into public.tasks(company_id,series_id,occurrence_at,project_id,site_id,folder_id,document_id,title,description,priority,visibility,open_unassigned,start_at,due_at,created_by,updated_by)
  values(p_company_id,v_series,case when v_series is null then null else v_occ end,p_project_id,p_site_id,p_folder_id,p_document_id,trim(p_title),nullif(trim(p_description),''),p_priority,p_visibility,p_open_unassigned,p_start_at,p_due_at,auth.uid(),auth.uid()) returning id into v_task;
  if v_series is not null then perform app_private.copy_task_assignments(v_task,v_series,p_company_id,auth.uid());
  else
    foreach v_user in array coalesce(p_assignee_user_ids,array[]::uuid[]) loop
      if not exists(select 1 from public.company_memberships m where m.company_id=p_company_id and m.user_id=v_user and m.status='active') then raise exception 'Assignee is not an active company member'; end if;
      insert into public.task_assignments(company_id,task_id,user_id,assigned_by) values(p_company_id,v_task,v_user,auth.uid());
    end loop;
    foreach v_role in array coalesce(p_assignee_role_ids,array[]::uuid[]) loop
      if not exists(select 1 from public.roles r where r.company_id=p_company_id and r.id=v_role) then raise exception 'Role belongs to another company'; end if;
      insert into public.task_assignments(company_id,task_id,role_id,assigned_by) values(p_company_id,v_task,v_role,auth.uid());
    end loop;
  end if;
  perform app_private.copy_task_checklist(v_task,p_company_id,auth.uid(),p_checklist);
  insert into public.task_events(company_id,task_id,actor_id,event_type,metadata) values(p_company_id,v_task,auth.uid(),'task.created',jsonb_build_object('title',trim(p_title)));
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(p_company_id,auth.uid(),'task.created','task',v_task,jsonb_build_object('title',trim(p_title)));
  insert into public.notifications(company_id,user_id,type,title_ar,title_en,body_ar,body_en,entity_type,entity_id)
    select distinct p_company_id,m.user_id,'task.assigned','مهمة جديدة','New task',trim(p_title),trim(p_title),'task',v_task
    from public.company_memberships m left join public.task_assignments a on a.task_id=v_task and (a.user_id=m.user_id or a.role_id=m.role_id)
    where m.company_id=p_company_id and m.status='active' and m.user_id<>auth.uid() and a.id is not null;
  return v_task;
end; $$;

create or replace function public.update_task(
  p_task_id uuid,p_title text,p_description text,p_priority public.task_priority,p_project_id uuid,p_site_id uuid,p_folder_id uuid,p_document_id uuid,
  p_start_at timestamptz,p_due_at timestamptz,p_visibility public.task_visibility,p_open_unassigned boolean,
  p_assignee_user_ids uuid[] default array[]::uuid[],p_assignee_role_ids uuid[] default array[]::uuid[]
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_task public.tasks%rowtype;v_user uuid;v_role uuid;
begin
  select * into v_task from public.tasks where id=p_task_id for update;
  if not found or not app_private.can_edit_task(p_task_id) then raise exception 'Permission denied'; end if;
  if (cardinality(p_assignee_user_ids)>0 or cardinality(p_assignee_role_ids)>0 or exists(select 1 from public.task_assignments where task_id=p_task_id)) and not app_private.has_company_permission(v_task.company_id,'tasks.assign') and not app_private.has_company_permission(v_task.company_id,'tasks.manage') then raise exception 'Permission denied'; end if;
  if p_visibility='private' and (p_open_unassigned or cardinality(p_assignee_user_ids)>0 or cardinality(p_assignee_role_ids)>0) then raise exception 'Private tasks cannot be assigned'; end if;
  update public.tasks set title=trim(p_title),description=nullif(trim(p_description),''),priority=p_priority,project_id=p_project_id,site_id=p_site_id,folder_id=p_folder_id,document_id=p_document_id,start_at=p_start_at,due_at=p_due_at,visibility=p_visibility,open_unassigned=p_open_unassigned,updated_by=auth.uid() where id=p_task_id;
  if app_private.has_company_permission(v_task.company_id,'tasks.assign') or app_private.has_company_permission(v_task.company_id,'tasks.manage') then
    delete from public.task_assignments where task_id=p_task_id;
    foreach v_user in array coalesce(p_assignee_user_ids,array[]::uuid[]) loop
      if not exists(select 1 from public.company_memberships m where m.company_id=v_task.company_id and m.user_id=v_user and m.status='active') then raise exception 'Assignee is not an active company member'; end if;
      insert into public.task_assignments(company_id,task_id,user_id,assigned_by) values(v_task.company_id,p_task_id,v_user,auth.uid());
    end loop;
    foreach v_role in array coalesce(p_assignee_role_ids,array[]::uuid[]) loop
      if not exists(select 1 from public.roles r where r.company_id=v_task.company_id and r.id=v_role) then raise exception 'Role belongs to another company'; end if;
      insert into public.task_assignments(company_id,task_id,role_id,assigned_by) values(v_task.company_id,p_task_id,v_role,auth.uid());
    end loop;
  end if;
  insert into public.task_events(company_id,task_id,actor_id,event_type,metadata) values(v_task.company_id,p_task_id,auth.uid(),'task.updated','{}');
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(v_task.company_id,auth.uid(),'task.updated','task',p_task_id,'{}');
end; $$;

create or replace function public.set_task_status(p_task_id uuid,p_status public.task_status,p_completion_note text default null,p_blocked_reason text default null,p_progress integer default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_task public.tasks%rowtype;v_old public.task_status;
begin
  select * into v_task from public.tasks where id=p_task_id for update;
  if not found or not app_private.can_complete_task(p_task_id) then raise exception 'Permission denied'; end if;
  v_old:=v_task.status;
  update public.tasks set status=p_status,
    progress=case when p_status='done' then 100 when p_progress is not null then least(greatest(p_progress,0),100) when p_status='todo' then 0 else progress end,
    blocked_reason=case when p_status='blocked' then nullif(trim(p_blocked_reason),'') else null end,
    completion_note=case when p_status='done' then nullif(trim(p_completion_note),'') else completion_note end,
    completed_at=case when p_status='done' then now() else null end,
    completed_by=case when p_status='done' then auth.uid() else null end,
    cancelled_at=case when p_status='cancelled' then now() else null end,
    updated_by=auth.uid()
  where id=p_task_id;
  insert into public.task_events(company_id,task_id,actor_id,event_type,from_status,to_status,metadata) values(v_task.company_id,p_task_id,auth.uid(),'task.status_changed',v_old,p_status,jsonb_build_object('completion_note',p_completion_note,'blocked_reason',p_blocked_reason));
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(v_task.company_id,auth.uid(),'task.status_changed','task',p_task_id,jsonb_build_object('from',v_old,'to',p_status));
  perform app_private.notify_company_members(v_task.company_id,auth.uid(),'task.status_changed','تم تحديث حالة مهمة','Task status updated',v_task.title,v_task.title,'task',p_task_id);
end; $$;

create or replace function public.claim_task(p_task_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_task public.tasks%rowtype;
begin
  select * into v_task from public.tasks where id=p_task_id for update;
  if not found or v_task.visibility<>'company' or not v_task.open_unassigned then raise exception 'Task is not open for claiming'; end if;
  if not app_private.has_company_permission(v_task.company_id,'tasks.claim') then raise exception 'Permission denied'; end if;
  if v_task.claimed_by is not null and v_task.claimed_by<>auth.uid() then raise exception 'Task was claimed by another member'; end if;
  update public.tasks set claimed_by=auth.uid(),open_unassigned=false,updated_by=auth.uid() where id=p_task_id;
  insert into public.task_assignments(company_id,task_id,user_id,assigned_by) values(v_task.company_id,p_task_id,auth.uid(),auth.uid()) on conflict do nothing;
  insert into public.task_events(company_id,task_id,actor_id,event_type) values(v_task.company_id,p_task_id,auth.uid(),'task.claimed');
end; $$;

create or replace function public.add_task_comment(p_task_id uuid,p_body text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_task public.tasks%rowtype;v_id uuid;
begin
  select * into v_task from public.tasks where id=p_task_id;
  if not found or not app_private.can_view_task(p_task_id) or not app_private.has_company_permission(v_task.company_id,'tasks.comment') then raise exception 'Permission denied'; end if;
  insert into public.task_comments(company_id,task_id,author_id,body) values(v_task.company_id,p_task_id,auth.uid(),trim(p_body)) returning id into v_id;
  insert into public.task_events(company_id,task_id,actor_id,event_type,metadata) values(v_task.company_id,p_task_id,auth.uid(),'task.comment_added',jsonb_build_object('comment_id',v_id));
  perform app_private.notify_company_members(v_task.company_id,auth.uid(),'task.comment_added','تعليق جديد على مهمة','New task comment',v_task.title,v_task.title,'task',p_task_id);
  return v_id;
end; $$;

create or replace function public.toggle_task_checklist_item(p_item_id uuid,p_completed boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_item public.task_checklist_items%rowtype;
begin
  select * into v_item from public.task_checklist_items where id=p_item_id for update;
  if not found or not app_private.can_complete_task(v_item.task_id) then raise exception 'Permission denied'; end if;
  update public.task_checklist_items set is_completed=p_completed,completed_by=case when p_completed then auth.uid() else null end,completed_at=case when p_completed then now() else null end where id=p_item_id;
  insert into public.task_events(company_id,task_id,actor_id,event_type,metadata) values(v_item.company_id,v_item.task_id,auth.uid(),'task.checklist_changed',jsonb_build_object('item_id',p_item_id,'completed',p_completed));
end; $$;

create or replace function public.add_task_checklist_item(p_task_id uuid,p_body text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_task public.tasks%rowtype;v_id uuid;v_pos integer;
begin
  select * into v_task from public.tasks where id=p_task_id;
  if not found or not app_private.can_edit_task(p_task_id) then raise exception 'Permission denied'; end if;
  select coalesce(max(position),-1)+1 into v_pos from public.task_checklist_items where task_id=p_task_id;
  insert into public.task_checklist_items(company_id,task_id,body,position,created_by) values(v_task.company_id,p_task_id,trim(p_body),v_pos,auth.uid()) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.begin_task_attachment_upload(p_task_id uuid,p_original_filename text,p_mime_type text,p_size_bytes bigint,p_comment_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_task public.tasks%rowtype;v_id uuid:=gen_random_uuid();v_path text;
begin
  select * into v_task from public.tasks where id=p_task_id;
  if not found or not app_private.can_view_task(p_task_id) or not app_private.has_company_permission(v_task.company_id,'tasks.attach') then raise exception 'Permission denied'; end if;
  if p_size_bytes<=0 or p_size_bytes>104857600 then raise exception 'Invalid attachment size'; end if;
  v_path:=v_task.company_id::text||'/'||p_task_id::text||'/'||v_id::text||'/'||app_private.safe_storage_filename(p_original_filename);
  insert into public.task_attachments(id,company_id,task_id,comment_id,storage_path,original_filename,mime_type,size_bytes,uploaded_by)
  values(v_id,v_task.company_id,p_task_id,p_comment_id,v_path,p_original_filename,coalesce(nullif(p_mime_type,''),'application/octet-stream'),p_size_bytes,auth.uid());
  return jsonb_build_object('attachment_id',v_id,'storage_bucket','task-attachments','storage_path',v_path);
end; $$;

create or replace function public.finalize_task_attachment_upload(p_attachment_id uuid)
returns void language plpgsql security definer set search_path=public,storage,pg_temp as $$
declare v_att public.task_attachments%rowtype;
begin
  select * into v_att from public.task_attachments where id=p_attachment_id and upload_state='uploading' for update;
  if not found then raise exception 'Attachment reservation not found'; end if;
  if v_att.uploaded_by<>auth.uid() and not app_private.has_company_permission(v_att.company_id,'tasks.manage') then raise exception 'Permission denied'; end if;
  if not exists(select 1 from storage.objects where bucket_id=v_att.storage_bucket and name=v_att.storage_path) then raise exception 'Uploaded object was not found'; end if;
  update public.task_attachments set upload_state='ready',finalized_at=now() where id=p_attachment_id;
  insert into public.task_events(company_id,task_id,actor_id,event_type,metadata) values(v_att.company_id,v_att.task_id,auth.uid(),'task.attachment_added',jsonb_build_object('attachment_id',v_att.id,'filename',v_att.original_filename));
end; $$;

create or replace function public.abort_task_attachment_upload(p_attachment_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_att public.task_attachments%rowtype;
begin
  select * into v_att from public.task_attachments where id=p_attachment_id and upload_state='uploading' for update;
  if not found then return; end if;
  if v_att.uploaded_by<>auth.uid() and not app_private.has_company_permission(v_att.company_id,'tasks.manage') then raise exception 'Permission denied'; end if;
  delete from public.task_attachments where id=p_attachment_id;
end; $$;

create or replace function public.materialize_recurring_tasks(p_company_id uuid,p_until timestamptz default now()+interval '30 days')
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.task_series%rowtype;v_task uuid;v_occ timestamptz;v_count integer:=0;v_start timestamptz;v_due timestamptz;
begin
  if not app_private.has_company_permission(p_company_id,'tasks.view') then raise exception 'Permission denied'; end if;
  for s in select * from public.task_series where company_id=p_company_id and is_active=true for update loop
    v_start:=s.next_start_at;v_due:=s.next_due_at;
    while coalesce(v_start,v_due)>now()-interval '1 day' and coalesce(v_start,v_due)<=p_until and (s.ends_at is null or coalesce(v_start,v_due)<=s.ends_at) and v_count<500 loop
      v_occ:=coalesce(v_start,v_due);
      insert into public.tasks(company_id,series_id,occurrence_at,project_id,site_id,folder_id,document_id,title,description,priority,visibility,open_unassigned,start_at,due_at,created_by,updated_by)
      values(s.company_id,s.id,v_occ,s.project_id,s.site_id,s.folder_id,s.document_id,s.title,s.description,s.priority,s.visibility,s.open_unassigned,v_start,v_due,s.created_by,s.created_by)
      on conflict(series_id,occurrence_at) do nothing returning id into v_task;
      if v_task is not null then
        perform app_private.copy_task_assignments(v_task,s.id,s.company_id,s.created_by);
        perform app_private.copy_task_checklist(v_task,s.company_id,s.created_by,s.checklist_template);
        insert into public.task_events(company_id,task_id,actor_id,event_type,metadata) values(s.company_id,v_task,null,'task.recurrence_created',jsonb_build_object('series_id',s.id));
        v_count:=v_count+1;
      end if;
      if v_start is not null then v_start:=app_private.task_next_timestamp(v_start,s.frequency,s.recurrence_interval); end if;
      if v_due is not null then v_due:=app_private.task_next_timestamp(v_due,s.frequency,s.recurrence_interval); end if;
    end loop;
    update public.task_series set next_start_at=v_start,next_due_at=v_due,is_active=case when ends_at is not null and coalesce(v_start,v_due)>ends_at then false else is_active end where id=s.id;
  end loop;
  return v_count;
end; $$;

create or replace function public.work_dashboard_metrics(p_company_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'my_todo',count(*) filter(where app_private.can_view_task(t.id) and t.status in('todo','in_progress','blocked')),
    'due_today',count(*) filter(where app_private.can_view_task(t.id) and t.status not in('done','cancelled') and t.due_at::date=current_date),
    'overdue',count(*) filter(where app_private.can_view_task(t.id) and t.status not in('done','cancelled') and t.due_at<now()),
    'blocked',count(*) filter(where app_private.can_view_task(t.id) and t.status='blocked'),
    'completed_this_week',count(*) filter(where app_private.can_view_task(t.id) and t.status='done' and t.completed_at>=date_trunc('week',now())),
    'company_open',count(*) filter(where app_private.has_company_permission(p_company_id,'tasks.view_all') and t.status not in('done','cancelled'))
  ) from public.tasks t where t.company_id=p_company_id;
$$;

create or replace function public.global_search(p_company_id uuid,p_query text,p_limit integer default 40)
returns table(entity_type text,entity_id uuid,title text,subtitle text,project_id uuid,site_id uuid,folder_id uuid,score real)
language sql stable security definer set search_path=public,pg_temp as $$
with q as(select trim(p_query) query,websearch_to_tsquery('simple',trim(p_query)) tsq),r as(
select 'document'::text,d.id,d.display_name,concat_ws(' · ',d.system_code,d.document_type),d.project_id,d.site_id,d.folder_id,greatest(ts_rank_cd(d.search_vector,q.tsq),case when d.display_name ilike '%'||q.query||'%' then 1 else 0 end)::real from public.documents d,q where d.company_id=p_company_id and d.state='active' and app_private.has_company_permission(p_company_id,'search.use') and(d.search_vector@@q.tsq or d.display_name ilike '%'||q.query||'%' or coalesce(d.system_code,'') ilike '%'||q.query||'%' or array_to_string(d.tags,' ') ilike '%'||q.query||'%')
union all select 'folder',f.id,f.name,coalesce(f.code,''),f.project_id,f.site_id,f.parent_id,case when f.name ilike '%'||q.query||'%' then 1 else .4 end::real from public.folders f,q where f.company_id=p_company_id and f.trashed_at is null and app_private.has_company_permission(p_company_id,'search.use') and(f.name ilike '%'||q.query||'%' or coalesce(f.code,'') ilike '%'||q.query||'%')
union all select 'project',p.id,p.name,p.code,p.id,null::uuid,null::uuid,case when p.name ilike '%'||q.query||'%' then 1 else .5 end::real from public.projects p,q where p.company_id=p_company_id and p.archived_at is null and app_private.has_company_permission(p_company_id,'search.use') and(p.name ilike '%'||q.query||'%' or p.code ilike '%'||q.query||'%')
union all select 'site',s.id,s.name,s.code,s.project_id,s.id,null::uuid,case when s.name ilike '%'||q.query||'%' then 1 else .5 end::real from public.sites s,q where s.company_id=p_company_id and s.archived_at is null and app_private.has_company_permission(p_company_id,'search.use') and(s.name ilike '%'||q.query||'%' or s.code ilike '%'||q.query||'%')
union all select 'task',t.id,t.title,concat('TSK-',t.task_number,' · ',t.status::text),t.project_id,t.site_id,t.folder_id,greatest(ts_rank_cd(t.search_vector,q.tsq),case when t.title ilike '%'||q.query||'%' then 1 else 0 end)::real from public.tasks t,q where t.company_id=p_company_id and app_private.has_company_permission(p_company_id,'search.use') and app_private.can_view_task(t.id) and(t.search_vector@@q.tsq or t.title ilike '%'||q.query||'%' or t.description ilike '%'||q.query||'%'))
select r.* from r order by score desc,title limit least(greatest(p_limit,1),100);
$$;

-- RLS
alter table public.task_series enable row level security;
alter table public.tasks enable row level security;
alter table public.task_series_assignments enable row level security;
alter table public.task_assignments enable row level security;
alter table public.task_checklist_items enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_attachments enable row level security;
alter table public.task_events enable row level security;

create policy task_series_select on public.task_series for select to authenticated using (app_private.has_company_permission(company_id,'tasks.view') and (visibility='company' or created_by=auth.uid()));
create policy tasks_select on public.tasks for select to authenticated using (app_private.can_view_task(id));
create policy task_assignments_select on public.task_assignments for select to authenticated using (app_private.can_view_task(task_id));
create policy task_series_assignments_select on public.task_series_assignments for select to authenticated using (exists(select 1 from public.task_series s where s.id=series_id and app_private.has_company_permission(s.company_id,'tasks.view') and (s.visibility='company' or s.created_by=auth.uid())));
create policy task_checklist_select on public.task_checklist_items for select to authenticated using (app_private.can_view_task(task_id));
create policy task_comments_select on public.task_comments for select to authenticated using (deleted_at is null and app_private.can_view_task(task_id));
create policy task_attachments_select on public.task_attachments for select to authenticated using (upload_state='ready' and app_private.can_view_task(task_id));
create policy task_events_select on public.task_events for select to authenticated using (app_private.can_view_task(task_id));

-- Storage bucket and policies
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('task-attachments','task-attachments',false,104857600,null)
on conflict(id) do update set public=false,file_size_limit=104857600;

drop policy if exists task_attachments_insert on storage.objects;
drop policy if exists task_attachments_select on storage.objects;
drop policy if exists task_attachments_delete on storage.objects;
create policy task_attachments_insert on storage.objects for insert to authenticated with check(
  bucket_id='task-attachments' and exists(select 1 from public.task_attachments a where a.storage_path=objects.name and a.uploaded_by=auth.uid() and a.upload_state='uploading')
);
create policy task_attachments_select on storage.objects for select to authenticated using(
  bucket_id='task-attachments' and exists(select 1 from public.task_attachments a where a.storage_path=objects.name and a.upload_state='ready' and app_private.can_view_task(a.task_id))
);
create policy task_attachments_delete on storage.objects for delete to authenticated using(
  bucket_id='task-attachments' and exists(select 1 from public.task_attachments a where a.storage_path=objects.name and (a.uploaded_by=auth.uid() or app_private.has_company_permission(a.company_id,'tasks.manage')))
);

-- Role defaults for existing companies
insert into public.role_permissions(role_id,permission_key,allowed)
select r.id,p.key,true from public.roles r cross join public.permissions p
where p.module='tasks' and (
  r.slug in('owner','admin','manager')
  or (r.slug in('engineer','supervisor') and p.key in('tasks.view','tasks.create','tasks.edit','tasks.complete','tasks.claim','tasks.comment','tasks.attach'))
  or (r.slug='viewer' and p.key='tasks.view')
)
on conflict(role_id,permission_key) do update set allowed=excluded.allowed;

create or replace function app_private.seed_company_roles(p_company_id uuid)
returns table(owner_role_id uuid) language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner uuid;v_admin uuid;v_manager uuid;v_engineer uuid;v_supervisor uuid;v_viewer uuid;
begin
  insert into public.roles(company_id,name_ar,name_en,slug,is_default,is_protected) values(p_company_id,'صاحب الشركة','Owner','owner',true,true) returning id into v_owner;
  insert into public.roles(company_id,name_ar,name_en,slug,is_default,is_protected) values(p_company_id,'مدير النظام','Admin','admin',true,true) returning id into v_admin;
  insert into public.roles(company_id,name_ar,name_en,slug,is_default,is_protected) values(p_company_id,'مدير','Manager','manager',true,true) returning id into v_manager;
  insert into public.roles(company_id,name_ar,name_en,slug,is_default,is_protected) values(p_company_id,'مهندس','Engineer','engineer',true,true) returning id into v_engineer;
  insert into public.roles(company_id,name_ar,name_en,slug,is_default,is_protected) values(p_company_id,'مشرف','Supervisor','supervisor',true,true) returning id into v_supervisor;
  insert into public.roles(company_id,name_ar,name_en,slug,is_default,is_protected) values(p_company_id,'مشاهد','Viewer','viewer',true,true) returning id into v_viewer;
  insert into public.role_permissions(role_id,permission_key,allowed) select v_owner,key,true from public.permissions;
  insert into public.role_permissions(role_id,permission_key,allowed) select v_admin,key,true from public.permissions where key<>'company.manage';
  insert into public.role_permissions(role_id,permission_key,allowed) select v_manager,key,true from public.permissions where key in ('company.view','members.view','roles.view','projects.view','projects.create','projects.edit','projects.archive','audit.view','files.view','files.upload','files.create_folder','files.rename','files.move','files.archive','files.restore','files.download','files.manage','search.use','notifications.view','tasks.view','tasks.view_all','tasks.create','tasks.assign','tasks.edit','tasks.complete','tasks.claim','tasks.comment','tasks.attach','tasks.manage');
  insert into public.role_permissions(role_id,permission_key,allowed) select v_engineer,key,true from public.permissions where key in ('company.view','members.view','projects.view','files.view','files.upload','files.create_folder','files.rename','files.move','files.download','search.use','notifications.view','tasks.view','tasks.create','tasks.edit','tasks.complete','tasks.claim','tasks.comment','tasks.attach');
  insert into public.role_permissions(role_id,permission_key,allowed) select v_supervisor,key,true from public.permissions where key in ('company.view','members.view','projects.view','files.view','files.upload','files.create_folder','files.download','search.use','notifications.view','tasks.view','tasks.create','tasks.edit','tasks.complete','tasks.claim','tasks.comment','tasks.attach');
  insert into public.role_permissions(role_id,permission_key,allowed) select v_viewer,key,true from public.permissions where key in ('company.view','projects.view','files.view','files.download','search.use','notifications.view','tasks.view');
  owner_role_id:=v_owner;return next;
end; $$;

-- Grants: public API is RPC-only for writes.
revoke all on public.task_series,public.tasks,public.task_series_assignments,public.task_assignments,public.task_checklist_items,public.task_comments,public.task_attachments,public.task_events from anon;
grant select on public.task_series,public.tasks,public.task_series_assignments,public.task_assignments,public.task_checklist_items,public.task_comments,public.task_attachments,public.task_events to authenticated;
revoke all on function public.create_task(uuid,text,text,public.task_priority,uuid,uuid,uuid,uuid,timestamptz,timestamptz,public.task_visibility,boolean,uuid[],uuid[],jsonb,public.task_recurrence_frequency,integer,timestamptz) from public;
grant execute on function public.create_task(uuid,text,text,public.task_priority,uuid,uuid,uuid,uuid,timestamptz,timestamptz,public.task_visibility,boolean,uuid[],uuid[],jsonb,public.task_recurrence_frequency,integer,timestamptz) to authenticated;
revoke all on function public.update_task(uuid,text,text,public.task_priority,uuid,uuid,uuid,uuid,timestamptz,timestamptz,public.task_visibility,boolean,uuid[],uuid[]) from public;
grant execute on function public.update_task(uuid,text,text,public.task_priority,uuid,uuid,uuid,uuid,timestamptz,timestamptz,public.task_visibility,boolean,uuid[],uuid[]) to authenticated;
revoke all on function public.set_task_status(uuid,public.task_status,text,text,integer) from public; grant execute on function public.set_task_status(uuid,public.task_status,text,text,integer) to authenticated;
revoke all on function public.claim_task(uuid) from public; grant execute on function public.claim_task(uuid) to authenticated;
revoke all on function public.add_task_comment(uuid,text) from public; grant execute on function public.add_task_comment(uuid,text) to authenticated;
revoke all on function public.toggle_task_checklist_item(uuid,boolean) from public; grant execute on function public.toggle_task_checklist_item(uuid,boolean) to authenticated;
revoke all on function public.add_task_checklist_item(uuid,text) from public; grant execute on function public.add_task_checklist_item(uuid,text) to authenticated;
revoke all on function public.begin_task_attachment_upload(uuid,text,text,bigint,uuid) from public; grant execute on function public.begin_task_attachment_upload(uuid,text,text,bigint,uuid) to authenticated;
revoke all on function public.finalize_task_attachment_upload(uuid) from public; grant execute on function public.finalize_task_attachment_upload(uuid) to authenticated;
revoke all on function public.abort_task_attachment_upload(uuid) from public; grant execute on function public.abort_task_attachment_upload(uuid) to authenticated;
revoke all on function public.materialize_recurring_tasks(uuid,timestamptz) from public; grant execute on function public.materialize_recurring_tasks(uuid,timestamptz) to authenticated;
revoke all on function public.work_dashboard_metrics(uuid) from public; grant execute on function public.work_dashboard_metrics(uuid) to authenticated;

commit;
