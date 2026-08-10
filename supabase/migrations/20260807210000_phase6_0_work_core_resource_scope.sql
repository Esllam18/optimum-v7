-- Optimum 6.0 — Work Core & Resource Scope
-- Requires the Optimum 5.8 organization/access foundation.

insert into public.permissions(key,module,description_ar,description_en,entitlement_key,scope_mode)
values
 ('tasks.approve','tasks','مراجعة واعتماد عناصر العمل','Review and approve work items','module.tasks','company'),
 ('tasks.manage_templates','tasks','إدارة قوالب العمل','Manage work templates','module.tasks','company'),
 ('tasks.manage_milestones','tasks','إدارة المراحل الرئيسية','Manage delivery milestones','module.tasks','company'),
 ('tasks.manage_automations','tasks','إدارة أتمتة العمل','Manage work automations','module.tasks','company'),
 ('tasks.view_workload','tasks','عرض عبء العمل والسعة','View team workload and capacity','module.tasks','company')
on conflict(key) do update set module=excluded.module,description_ar=excluded.description_ar,description_en=excluded.description_en,entitlement_key=excluded.entitlement_key,scope_mode=excluded.scope_mode;

insert into public.role_permissions(role_id,permission_key,allowed)
select distinct rp.role_id,p.key,true
from public.role_permissions rp
cross join (values ('tasks.approve'),('tasks.manage_templates'),('tasks.manage_milestones'),('tasks.manage_automations'),('tasks.view_workload')) p(key)
where rp.permission_key='tasks.manage' and rp.allowed
on conflict(role_id,permission_key) do update set allowed=true;

alter table public.tasks add column if not exists task_type text not null default 'task';
alter table public.tasks add column if not exists owner_user_id uuid references public.profiles(id);
alter table public.tasks add column if not exists reviewer_user_id uuid references public.profiles(id);
alter table public.tasks add column if not exists approver_user_id uuid references public.profiles(id);
alter table public.tasks add column if not exists estimated_minutes integer not null default 0;
alter table public.tasks add column if not exists actual_minutes integer not null default 0;
alter table public.tasks add column if not exists required_skills text[] not null default array[]::text[];
alter table public.tasks add column if not exists labels text[] not null default array[]::text[];
alter table public.tasks add column if not exists sla_due_at timestamptz;
alter table public.tasks add column if not exists source_type text;
alter table public.tasks add column if not exists source_id uuid;
alter table public.tasks add column if not exists lock_version integer not null default 1;
alter table public.tasks add column if not exists milestone_id uuid; -- FK is added with the calendar/milestone stage.

do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.tasks'::regclass and conname='tasks_task_type_check') then
  alter table public.tasks add constraint tasks_task_type_check check(task_type=any(array['task','review','approval','inspection','issue','follow_up']));
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.tasks'::regclass and conname='tasks_estimated_minutes_check') then alter table public.tasks add constraint tasks_estimated_minutes_check check(estimated_minutes between 0 and 100000); end if;
 if not exists(select 1 from pg_constraint where conrelid='public.tasks'::regclass and conname='tasks_actual_minutes_check') then alter table public.tasks add constraint tasks_actual_minutes_check check(actual_minutes between 0 and 100000); end if;
 if not exists(select 1 from pg_constraint where conrelid='public.tasks'::regclass and conname='tasks_lock_version_check') then alter table public.tasks add constraint tasks_lock_version_check check(lock_version>=1); end if;
end $$;

create table if not exists public.task_dependencies(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 blocker_task_id uuid not null references public.tasks(id) on delete cascade,
 blocked_task_id uuid not null references public.tasks(id) on delete cascade,
 dependency_type text not null default 'finish_to_start' check(dependency_type='finish_to_start'),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(blocker_task_id,blocked_task_id),
 check(blocker_task_id<>blocked_task_id)
);

create table if not exists public.task_watchers(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 task_id uuid not null references public.tasks(id) on delete cascade,
 user_id uuid not null references public.profiles(id),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(task_id,user_id)
);

create table if not exists public.work_runtime_versions(
 company_id uuid primary key references public.companies(id) on delete cascade,
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);

create index if not exists tasks_labels_gin on public.tasks using gin(labels);
create index if not exists tasks_required_skills_gin on public.tasks using gin(required_skills);
create index if not exists tasks_owner_status_due_idx on public.tasks(company_id,owner_user_id,status,due_at);
create index if not exists tasks_sla_idx on public.tasks(company_id,sla_due_at) where sla_due_at is not null;
create index if not exists tasks_source_idx on public.tasks(company_id,source_type,source_id) where source_type is not null;
create index if not exists tasks_type_status_idx on public.tasks(company_id,task_type,status,due_at);
create index if not exists task_dependencies_blocked_idx on public.task_dependencies(company_id,blocked_task_id);
create index if not exists task_dependencies_blocker_idx on public.task_dependencies(company_id,blocker_task_id);
create index if not exists task_watchers_task_idx on public.task_watchers(task_id);
create index if not exists task_watchers_user_idx on public.task_watchers(company_id,user_id);

create or replace function app_private.bump_work_runtime(p_company_id uuid) returns void language sql security definer set search_path='public','pg_temp' as $$
 insert into public.work_runtime_versions(company_id,revision,updated_at) values(p_company_id,1,now()) on conflict(company_id) do update set revision=public.work_runtime_versions.revision+1,updated_at=now();
$$;
create or replace function app_private.work_runtime_trigger() returns trigger language plpgsql security definer set search_path='public','pg_temp' as $$ declare v_company uuid; begin v_company:=coalesce(new.company_id,old.company_id); if v_company is not null then perform app_private.bump_work_runtime(v_company); end if; return coalesce(new,old); end; $$;
create or replace function app_private.task_lock_version() returns trigger language plpgsql set search_path='public','pg_temp' as $$ begin if to_jsonb(new) is distinct from to_jsonb(old) then new.lock_version:=old.lock_version+1; end if; return new; end; $$;
create or replace function app_private.validate_task_scope() returns trigger language plpgsql security definer set search_path='public','pg_temp' as $$ begin
 if new.project_id is not null and not exists(select 1 from public.projects p where p.id=new.project_id and p.company_id=new.company_id) then raise exception 'Project belongs to another company'; end if;
 if new.site_id is not null and not exists(select 1 from public.sites s where s.id=new.site_id and s.company_id=new.company_id and (new.project_id is null or s.project_id=new.project_id)) then raise exception 'Site belongs to another project or company'; end if;
 if new.folder_id is not null and not exists(select 1 from public.folders f where f.id=new.folder_id and f.company_id=new.company_id and f.trashed_at is null and (new.project_id is null or f.project_id=new.project_id) and (new.site_id is null or f.site_id=new.site_id)) then raise exception 'Folder belongs to another scope'; end if;
 if new.document_id is not null and not exists(select 1 from public.documents d where d.id=new.document_id and d.company_id=new.company_id and d.state='active' and (new.project_id is null or d.project_id=new.project_id) and (new.site_id is null or d.site_id=new.site_id)) then raise exception 'Document belongs to another scope'; end if; return new; end $$;
create or replace function app_private.validate_task_participants() returns trigger language plpgsql security definer set search_path='public','app_private','pg_temp' as $$ declare u uuid; begin foreach u in array array[new.owner_user_id,new.reviewer_user_id,new.approver_user_id] loop if u is null then continue; end if; if not exists(select 1 from public.company_memberships m where m.company_id=new.company_id and m.user_id=u and m.status='active' and coalesce(m.lifecycle_stage,'active') not in ('on_leave','offboarding','left','suspended')) then raise exception 'Work participant is not available'; end if; if not app_private.user_has_resource_permission(u,new.company_id,'tasks.view',new.project_id,new.site_id,new.folder_id,null) then raise exception 'Work participant cannot access this work scope'; end if; end loop; return new; end; $$;
create or replace function app_private.validate_task_assignment_participant() returns trigger language plpgsql security definer set search_path='public','app_private','pg_temp' as $$ declare t public.tasks%rowtype; begin if new.user_id is null then return new; end if; select * into t from public.tasks where id=new.task_id; if not found or t.company_id<>new.company_id then raise exception 'Invalid task assignment scope'; end if; if not exists(select 1 from public.company_memberships m where m.company_id=t.company_id and m.user_id=new.user_id and m.status='active' and coalesce(m.lifecycle_stage,'active') not in ('on_leave','offboarding','left','suspended')) then raise exception 'Assignee is not available for work'; end if; if not app_private.user_has_resource_permission(new.user_id,t.company_id,'tasks.view',t.project_id,t.site_id,t.folder_id,null) then raise exception 'Assignee cannot access this work scope'; end if; return new; end; $$;
create or replace function app_private.validate_task_dependency() returns trigger language plpgsql security definer set search_path='public','pg_temp' as $$ declare v_blocker_company uuid;v_blocked_company uuid;v_cycle boolean; begin select company_id into v_blocker_company from public.tasks where id=new.blocker_task_id;select company_id into v_blocked_company from public.tasks where id=new.blocked_task_id;if v_blocker_company is null or v_blocked_company is null or v_blocker_company<>v_blocked_company or new.company_id<>v_blocker_company then raise exception 'Dependency tasks must belong to the same company';end if;with recursive chain(id) as (select new.blocked_task_id union all select d.blocked_task_id from public.task_dependencies d join chain c on d.blocker_task_id=c.id where d.id<>coalesce(new.id,gen_random_uuid())) select exists(select 1 from chain where id=new.blocker_task_id) into v_cycle;if v_cycle then raise exception 'Task dependency cycle detected';end if;return new;end; $$;

create or replace function app_private.work_permission_for_row(p_company_id uuid,p_permission text,p_project_id uuid default null,p_site_id uuid default null,p_folder_id uuid default null,p_document_id uuid default null)
returns boolean language sql stable security definer set search_path='public','app_private','pg_temp' as $$
 select app_private.has_company_permission(p_company_id,p_permission) and app_private.resource_permission_for_row(p_company_id,p_permission,p_project_id,p_site_id,p_folder_id,null::uuid);
$$;

create or replace function app_private.can_view_task(p_task_id uuid)
returns boolean language sql stable security definer set search_path='public','app_private','pg_temp' as $$
 select exists(select 1 from public.tasks t left join public.company_memberships m on m.company_id=t.company_id and m.user_id=auth.uid() and m.status='active' where t.id=p_task_id and m.id is not null and app_private.company_is_operational(t.company_id) and app_private.work_permission_for_row(t.company_id,'tasks.view',t.project_id,t.site_id,t.folder_id,t.document_id) and (app_private.has_company_permission(t.company_id,'tasks.view_all') or t.created_by=auth.uid() or t.owner_user_id=auth.uid() or t.claimed_by=auth.uid() or t.reviewer_user_id=auth.uid() or t.approver_user_id=auth.uid() or (t.visibility='company' and t.open_unassigned=true) or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.user_id=auth.uid()) or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.role_id=m.role_id) or exists(select 1 from public.task_watchers w where w.task_id=t.id and w.user_id=auth.uid())));
$$;

create or replace function app_private.can_edit_task(p_task_id uuid)
returns boolean language sql stable security definer set search_path='public','app_private','pg_temp' as $$
 select exists(select 1 from public.tasks t left join public.company_memberships m on m.company_id=t.company_id and m.user_id=auth.uid() and m.status='active' where t.id=p_task_id and m.id is not null and app_private.company_is_operational(t.company_id) and app_private.work_permission_for_row(t.company_id,case when app_private.has_company_permission(t.company_id,'tasks.manage') then 'tasks.manage' else 'tasks.edit' end,t.project_id,t.site_id,t.folder_id,t.document_id) and (app_private.has_company_permission(t.company_id,'tasks.manage') or (app_private.has_company_permission(t.company_id,'tasks.edit') and (t.created_by=auth.uid() or t.owner_user_id=auth.uid() or t.claimed_by=auth.uid() or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.user_id=auth.uid()) or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.role_id=m.role_id)))));
$$;

create or replace function app_private.can_complete_task(p_task_id uuid)
returns boolean language sql stable security definer set search_path='public','app_private','pg_temp' as $$
 select exists(select 1 from public.tasks t left join public.company_memberships m on m.company_id=t.company_id and m.user_id=auth.uid() and m.status='active' where t.id=p_task_id and m.id is not null and app_private.company_is_operational(t.company_id) and app_private.work_permission_for_row(t.company_id,case when app_private.has_company_permission(t.company_id,'tasks.manage') then 'tasks.manage' else 'tasks.complete' end,t.project_id,t.site_id,t.folder_id,t.document_id) and (app_private.has_company_permission(t.company_id,'tasks.manage') or (app_private.has_company_permission(t.company_id,'tasks.complete') and (t.created_by=auth.uid() or t.owner_user_id=auth.uid() or t.claimed_by=auth.uid() or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.user_id=auth.uid()) or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.role_id=m.role_id)))));
$$;

alter table public.task_dependencies enable row level security;
alter table public.task_watchers enable row level security;
alter table public.work_runtime_versions enable row level security;
drop policy if exists task_dependencies_select on public.task_dependencies;
create policy task_dependencies_select on public.task_dependencies for select to authenticated using(app_private.can_view_task(blocker_task_id) or app_private.can_view_task(blocked_task_id));
drop policy if exists task_watchers_select on public.task_watchers;
create policy task_watchers_select on public.task_watchers for select to authenticated using(app_private.can_view_task(task_id));
drop policy if exists work_runtime_versions_select on public.work_runtime_versions;
create policy work_runtime_versions_select on public.work_runtime_versions for select to authenticated using(app_private.is_company_member(company_id));
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated using(app_private.can_view_task(id) and app_private.resource_permission_for_row(company_id,'tasks.view',project_id,site_id,folder_id,null));

drop trigger if exists tasks_lock_version on public.tasks;
create trigger tasks_lock_version before update on public.tasks for each row execute function app_private.task_lock_version();
drop trigger if exists tasks_validate_scope on public.tasks;
create trigger tasks_validate_scope before insert or update of company_id,project_id,site_id,folder_id,document_id on public.tasks for each row execute function app_private.validate_task_scope();
drop trigger if exists tasks_validate_participants on public.tasks;
create trigger tasks_validate_participants before insert or update of company_id,project_id,site_id,folder_id,owner_user_id,reviewer_user_id,approver_user_id on public.tasks for each row execute function app_private.validate_task_participants();
drop trigger if exists task_assignments_validate_participant on public.task_assignments;
create trigger task_assignments_validate_participant before insert or update on public.task_assignments for each row execute function app_private.validate_task_assignment_participant();
drop trigger if exists task_dependencies_validate on public.task_dependencies;
create trigger task_dependencies_validate before insert or update on public.task_dependencies for each row execute function app_private.validate_task_dependency();

drop trigger if exists work_runtime_bump_tasks on public.tasks;
create trigger work_runtime_bump_tasks after insert or update or delete on public.tasks for each row execute function app_private.work_runtime_trigger();
drop trigger if exists work_runtime_bump_task_dependencies on public.task_dependencies;
create trigger work_runtime_bump_task_dependencies after insert or update or delete on public.task_dependencies for each row execute function app_private.work_runtime_trigger();
drop trigger if exists work_runtime_bump_task_watchers on public.task_watchers;
create trigger work_runtime_bump_task_watchers after insert or update or delete on public.task_watchers for each row execute function app_private.work_runtime_trigger();

revoke all privileges on table public.task_dependencies,public.task_watchers,public.work_runtime_versions from anon;
grant select on table public.task_dependencies,public.task_watchers,public.work_runtime_versions to authenticated;
