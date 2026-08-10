-- Optimum 6.5 — Templates, automations and autonomous recurrence scheduler.

create table if not exists public.task_templates(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 name text not null check(char_length(trim(name)) between 2 and 160),
 description text,
 task_type text not null default 'task' check(task_type in ('task','review','approval','inspection','issue','follow_up')),
 priority public.task_priority not null default 'medium',
 estimated_minutes integer not null default 0 check(estimated_minutes between 0 and 100000),
 required_skills text[] not null default array[]::text[],
 labels text[] not null default array[]::text[],
 checklist_template jsonb not null default '[]'::jsonb,
 default_payload jsonb not null default '{}'::jsonb,
 is_active boolean not null default true,
 created_by uuid not null references public.profiles(id),
 updated_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(company_id,name)
);

create table if not exists public.work_automation_rules(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 name text not null check(char_length(trim(name)) between 2 and 180),
 trigger_type text not null check(trigger_type in ('task.created','task.status_changed','task.overdue')),
 conditions jsonb not null default '{}'::jsonb,
 actions jsonb not null default '[]'::jsonb,
 is_active boolean not null default true,
 created_by uuid not null references public.profiles(id),
 updated_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.work_automation_runs(
 id bigint generated always as identity primary key,
 company_id uuid not null references public.companies(id) on delete cascade,
 rule_id uuid not null references public.work_automation_rules(id) on delete cascade,
 entity_type text not null,
 entity_id uuid,
 trigger_type text not null,
 dedupe_key text not null,
 status text not null default 'succeeded' check(status in ('succeeded','skipped','failed')),
 result jsonb not null default '{}'::jsonb,
 error_text text,
 created_at timestamptz not null default now(),
 unique(rule_id,dedupe_key)
);

create index if not exists task_templates_company_active_idx on public.task_templates(company_id,is_active,name);
create index if not exists work_automation_rules_company_trigger_idx on public.work_automation_rules(company_id,trigger_type,is_active);
create index if not exists work_automation_runs_company_created_idx on public.work_automation_runs(company_id,created_at desc);

alter table public.task_templates enable row level security;
alter table public.work_automation_rules enable row level security;
alter table public.work_automation_runs enable row level security;
drop policy if exists task_templates_select on public.task_templates;
create policy task_templates_select on public.task_templates for select to authenticated using(app_private.has_company_permission(company_id,'tasks.view'));
drop policy if exists work_automation_rules_select on public.work_automation_rules;
create policy work_automation_rules_select on public.work_automation_rules for select to authenticated using(app_private.has_company_permission(company_id,'tasks.manage_automations') or app_private.has_company_permission(company_id,'tasks.manage'));
drop policy if exists work_automation_runs_select on public.work_automation_runs;
create policy work_automation_runs_select on public.work_automation_runs for select to authenticated using(app_private.has_company_permission(company_id,'tasks.manage_automations') or app_private.has_company_permission(company_id,'tasks.manage'));

create or replace function public.save_task_template(p_payload jsonb)
returns uuid language plpgsql security definer set search_path='public','app_private','pg_temp' as $$
declare v_id uuid:=nullif(p_payload->>'id','')::uuid;v_company uuid:=nullif(p_payload->>'company_id','')::uuid;v_existing_company uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if v_id is not null then select company_id into v_existing_company from public.task_templates where id=v_id; if v_existing_company is not null and v_existing_company<>v_company then raise exception 'Task template belongs to another company'; end if; end if;
 if not app_private.has_company_permission(v_company,'tasks.manage_templates') and not app_private.has_company_permission(v_company,'tasks.manage') then raise exception 'Permission denied'; end if;
 insert into public.task_templates(id,company_id,name,description,task_type,priority,estimated_minutes,required_skills,labels,checklist_template,default_payload,is_active,created_by,updated_by)
 values(coalesce(v_id,gen_random_uuid()),v_company,trim(p_payload->>'name'),nullif(trim(p_payload->>'description'),''),coalesce(nullif(p_payload->>'task_type',''),'task'),coalesce(nullif(p_payload->>'priority','')::public.task_priority,'medium'),coalesce(nullif(p_payload->>'estimated_minutes','')::integer,0),coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'required_skills','[]'::jsonb))),array[]::text[]),coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'labels','[]'::jsonb))),array[]::text[]),coalesce(p_payload->'checklist_template','[]'::jsonb),coalesce(p_payload->'default_payload','{}'::jsonb),coalesce((p_payload->>'is_active')::boolean,true),auth.uid(),auth.uid())
 on conflict(id) do update set name=excluded.name,description=excluded.description,task_type=excluded.task_type,priority=excluded.priority,estimated_minutes=excluded.estimated_minutes,required_skills=excluded.required_skills,labels=excluded.labels,checklist_template=excluded.checklist_template,default_payload=excluded.default_payload,is_active=excluded.is_active,updated_by=auth.uid(),updated_at=now()
 where public.task_templates.company_id=v_company returning id into v_id;
 if v_id is null then raise exception 'Task template could not be saved'; end if;
 perform app_private.bump_work_runtime(v_company);return v_id;
end; $$;

create or replace function app_private.work_automation_matches(p_task public.tasks,p_conditions jsonb)
returns boolean language sql stable set search_path='public','pg_temp' as $$
 select (coalesce(p_conditions->>'status','')='' or p_task.status::text=p_conditions->>'status')
    and (coalesce(p_conditions->>'priority','')='' or p_task.priority::text=p_conditions->>'priority')
    and (coalesce(p_conditions->>'task_type','')='' or p_task.task_type=p_conditions->>'task_type')
    and (coalesce(p_conditions->>'project_id','')='' or p_task.project_id=nullif(p_conditions->>'project_id','')::uuid);
$$;

create or replace function public.save_work_automation_rule(p_payload jsonb)
returns uuid language plpgsql security definer set search_path='public','app_private','pg_temp' as $$
declare v_id uuid:=nullif(p_payload->>'id','')::uuid;v_company uuid:=nullif(p_payload->>'company_id','')::uuid;v_existing_company uuid;v_conditions jsonb:=coalesce(p_payload->'conditions','{}'::jsonb);v_actions jsonb:=coalesce(p_payload->'actions','[]'::jsonb);v_project uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if v_id is not null then select company_id into v_existing_company from public.work_automation_rules where id=v_id; if v_existing_company is not null and v_existing_company<>v_company then raise exception 'Automation rule belongs to another company'; end if; end if;
 if not (app_private.has_company_permission(v_company,'tasks.manage_automations') or app_private.has_company_permission(v_company,'tasks.manage')) then raise exception 'Permission denied'; end if;
 if coalesce(p_payload->>'trigger_type','') not in ('task.created','task.status_changed','task.overdue') then raise exception 'Unsupported automation trigger'; end if;
 if jsonb_typeof(v_conditions)<>'object' then raise exception 'Automation conditions must be an object'; end if;
 if exists(select 1 from jsonb_object_keys(v_conditions) k where k not in ('status','priority','task_type','project_id')) then raise exception 'Unsupported automation condition'; end if;
 if jsonb_typeof(v_actions)<>'array' or jsonb_array_length(v_actions)=0 then raise exception 'Automation actions must be a non-empty array'; end if;
 if exists(select 1 from jsonb_array_elements(v_actions) a where jsonb_typeof(a)<>'object' or coalesce(a->>'type','') not in ('notify_owner','notify_manager','set_priority')) then raise exception 'Unsupported automation action'; end if;
 if exists(select 1 from jsonb_array_elements(v_actions) a where a->>'type'='set_priority' and coalesce(a->>'priority','') not in ('low','medium','high','urgent')) then raise exception 'Invalid automation priority'; end if;
 if coalesce(v_conditions->>'status','')<>'' then perform (v_conditions->>'status')::public.task_status; end if;
 if coalesce(v_conditions->>'priority','')<>'' then perform (v_conditions->>'priority')::public.task_priority; end if;
 if coalesce(v_conditions->>'task_type','')<>'' and v_conditions->>'task_type' not in ('task','review','approval','inspection','issue','follow_up') then raise exception 'Invalid automation task type'; end if;
 v_project:=nullif(v_conditions->>'project_id','')::uuid;
 if v_project is not null and (not exists(select 1 from public.projects p where p.id=v_project and p.company_id=v_company) or not app_private.resource_permission_for_row(v_company,'tasks.view',v_project,null,null,null)) then raise exception 'Invalid automation project scope'; end if;
 insert into public.work_automation_rules(id,company_id,name,trigger_type,conditions,actions,is_active,created_by,updated_by)
 values(coalesce(v_id,gen_random_uuid()),v_company,trim(p_payload->>'name'),p_payload->>'trigger_type',v_conditions,v_actions,coalesce((p_payload->>'is_active')::boolean,true),auth.uid(),auth.uid())
 on conflict(id) do update set name=excluded.name,trigger_type=excluded.trigger_type,conditions=excluded.conditions,actions=excluded.actions,is_active=excluded.is_active,updated_by=auth.uid(),updated_at=now()
 where public.work_automation_rules.company_id=v_company returning id into v_id;
 if v_id is null then raise exception 'Automation rule could not be saved'; end if;
 perform app_private.bump_work_runtime(v_company);return v_id;
end; $$;

create or replace function app_private.execute_work_automations(p_task_id uuid,p_trigger_type text,p_actor_id uuid default null)
returns integer language plpgsql security definer set search_path='public','app_private','pg_temp' as $$
declare v_task public.tasks%rowtype;r public.work_automation_rules%rowtype;a jsonb;v_key text;v_count integer:=0;v_manager uuid;v_inserted bigint;v_original_sub text:=coalesce(current_setting('request.jwt.claim.sub',true),'');v_old_priority public.task_priority;
begin
 select * into v_task from public.tasks where id=p_task_id;if not found then return 0;end if;
 for r in select * from public.work_automation_rules where company_id=v_task.company_id and trigger_type=p_trigger_type and is_active order by created_at,id loop
  if not app_private.work_automation_matches(v_task,r.conditions) then continue;end if;
  v_key:=p_task_id::text||':'||p_trigger_type||':'||case when p_trigger_type='task.overdue' then current_date::text else coalesce(v_task.lock_version,1)::text end;v_inserted:=null;
  insert into public.work_automation_runs(company_id,rule_id,entity_type,entity_id,trigger_type,dedupe_key,status) values(v_task.company_id,r.id,'task',p_task_id,p_trigger_type,v_key,'skipped') on conflict(rule_id,dedupe_key) do nothing returning id into v_inserted;
  if v_inserted is null then continue;end if;
  begin
   for a in select value from jsonb_array_elements(r.actions) loop
    if a->>'type'='notify_owner' and v_task.owner_user_id is not null and app_private.user_has_resource_permission(v_task.owner_user_id,v_task.company_id,'tasks.view',v_task.project_id,v_task.site_id,v_task.folder_id,null) then
      insert into public.notifications(company_id,user_id,type,title_ar,title_en,body_ar,body_en,entity_type,entity_id) values(v_task.company_id,v_task.owner_user_id,'work_automation',coalesce(a->>'title_ar','تنبيه عمل'),coalesce(a->>'title_en','Work alert'),v_task.title,v_task.title,'task',p_task_id);
    elsif a->>'type'='notify_manager' then
      select manager_user_id into v_manager from public.company_memberships where company_id=v_task.company_id and user_id=v_task.owner_user_id and status='active' limit 1;
      if v_manager is not null and app_private.user_has_resource_permission(v_manager,v_task.company_id,'tasks.view',v_task.project_id,v_task.site_id,v_task.folder_id,null) then insert into public.notifications(company_id,user_id,type,title_ar,title_en,body_ar,body_en,entity_type,entity_id) values(v_task.company_id,v_manager,'work_escalation',coalesce(a->>'title_ar','تصعيد مهمة'),coalesce(a->>'title_en','Work escalation'),v_task.title,v_task.title,'task',p_task_id); end if;
    elsif a->>'type'='set_priority' then
      if coalesce(a->>'priority','') not in ('low','medium','high','urgent') then raise exception 'Invalid automation priority'; end if;
      if not (app_private.user_has_resource_permission(r.created_by,v_task.company_id,'tasks.manage',v_task.project_id,v_task.site_id,v_task.folder_id,null) or app_private.user_has_resource_permission(r.created_by,v_task.company_id,'tasks.edit',v_task.project_id,v_task.site_id,v_task.folder_id,null)) then raise exception 'Automation authority no longer has permission for this work scope'; end if;
      v_old_priority:=v_task.priority;perform set_config('request.jwt.claim.sub',r.created_by::text,true);update public.tasks set priority=(a->>'priority')::public.task_priority,updated_by=r.created_by where id=p_task_id and priority<>(a->>'priority')::public.task_priority;perform set_config('request.jwt.claim.sub',v_original_sub,true);
      if v_old_priority<>(a->>'priority')::public.task_priority then insert into public.task_events(company_id,task_id,actor_id,event_type,metadata) values(v_task.company_id,p_task_id,r.created_by,'task.updated',jsonb_build_object('automation_rule_id',r.id,'field','priority','from',v_old_priority,'to',a->>'priority'));insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(v_task.company_id,r.created_by,'task.updated','task',p_task_id,jsonb_build_object('automation_rule_id',r.id,'field','priority','from',v_old_priority,'to',a->>'priority'));v_task.priority:=(a->>'priority')::public.task_priority;end if;
    end if;
   end loop;
   update public.work_automation_runs set status='succeeded',result=jsonb_build_object('actions',jsonb_array_length(r.actions)),error_text=null where id=v_inserted;v_count:=v_count+1;
  exception when others then perform set_config('request.jwt.claim.sub',v_original_sub,true);update public.work_automation_runs set status='failed',error_text=left(sqlerrm,2000),result=jsonb_build_object('actions',jsonb_array_length(r.actions)) where id=v_inserted;end;
 end loop;
 perform set_config('request.jwt.claim.sub',v_original_sub,true);if v_count>0 then perform app_private.bump_work_runtime(v_task.company_id);end if;return v_count;
end; $$;

create or replace function app_private.work_task_event_automation_trigger()
returns trigger language plpgsql security definer set search_path='public','app_private','pg_temp' as $$
begin
 if new.event_type in ('task.created','task.status_changed') then perform app_private.execute_work_automations(new.task_id,new.event_type,new.actor_id);end if;
 return new;
exception when others then
 insert into public.work_automation_runs(company_id,rule_id,entity_type,entity_id,trigger_type,dedupe_key,status,error_text)
 select new.company_id,r.id,'task',new.task_id,new.event_type,new.task_id::text||':trigger-error:'||new.id::text,'failed',sqlerrm from public.work_automation_rules r where r.company_id=new.company_id and r.trigger_type=new.event_type and r.is_active on conflict do nothing;
 return new;
end; $$;

drop trigger if exists task_events_automation on public.task_events;
create trigger task_events_automation after insert on public.task_events for each row execute function app_private.work_task_event_automation_trigger();

create or replace function public.test_work_automation_rule(p_rule_id uuid,p_task_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','app_private','pg_temp' as $$
declare r public.work_automation_rules%rowtype;t public.tasks%rowtype;
begin
 select * into r from public.work_automation_rules where id=p_rule_id;select * into t from public.tasks where id=p_task_id;
 if r.id is null or t.id is null or r.company_id<>t.company_id or not (app_private.has_company_permission(r.company_id,'tasks.manage_automations') or app_private.has_company_permission(r.company_id,'tasks.manage')) or not app_private.can_view_task(p_task_id) then raise exception 'Permission denied';end if;
 return jsonb_build_object('matches',app_private.work_automation_matches(t,r.conditions),'trigger',r.trigger_type,'actions',r.actions,'task',jsonb_build_object('id',t.id,'title',t.title,'status',t.status,'priority',t.priority,'task_type',t.task_type));
end; $$;

create or replace function app_private.work_scheduler_tick_internal(p_until timestamptz default (now()+interval '45 days'))
returns jsonb language plpgsql security definer set search_path='public','app_private','pg_temp' as $$
declare c record;v_recurring integer:=0;v_overdue integer:=0;t record;v_admin uuid;
begin
 select user_id into v_admin from public.platform_admins where is_active=true order by created_at limit 1;
 if v_admin is null then raise exception 'No active platform administrator is available for scheduler authority'; end if;
 perform set_config('request.jwt.claim.sub',v_admin::text,true);
 for c in select id from public.companies where app_private.company_is_operational(id) loop
  v_recurring:=v_recurring+app_private.materialize_company_recurring_tasks(c.id,p_until);
  for t in select id from public.tasks where company_id=c.id and status not in ('done','cancelled') and due_at<now() loop v_overdue:=v_overdue+app_private.execute_work_automations(t.id,'task.overdue',null);end loop;
 end loop;
 return jsonb_build_object('recurring_created',v_recurring,'overdue_automations',v_overdue,'ran_at',now());
end; $$;

create or replace function public.work_scheduler_tick(p_until timestamptz default (now()+interval '45 days'))
returns jsonb language plpgsql security definer set search_path='public','app_private','pg_temp' as $$
begin if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'Service role required';end if;return app_private.work_scheduler_tick_internal(p_until);end; $$;

do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
   if exists(select 1 from cron.job where jobname='optimum-work-scheduler') then perform cron.unschedule((select jobid from cron.job where jobname='optimum-work-scheduler' limit 1)); end if;
   perform cron.schedule('optimum-work-scheduler','*/15 * * * *',$cmd$select app_private.work_scheduler_tick_internal(now()+interval '45 days');$cmd$);
 end if;
end $$;

drop trigger if exists task_templates_updated_at on public.task_templates;
create trigger task_templates_updated_at before update on public.task_templates for each row execute function public.set_updated_at();
drop trigger if exists work_automation_rules_updated_at on public.work_automation_rules;
create trigger work_automation_rules_updated_at before update on public.work_automation_rules for each row execute function public.set_updated_at();
drop trigger if exists work_runtime_bump_task_templates on public.task_templates;
create trigger work_runtime_bump_task_templates after insert or update or delete on public.task_templates for each row execute function app_private.work_runtime_trigger();
drop trigger if exists work_runtime_bump_work_automation_rules on public.work_automation_rules;
create trigger work_runtime_bump_work_automation_rules after insert or update or delete on public.work_automation_rules for each row execute function app_private.work_runtime_trigger();

grant select on public.task_templates,public.work_automation_rules,public.work_automation_runs to authenticated;
revoke all on function public.save_task_template(jsonb) from public,anon;
revoke all on function public.save_work_automation_rule(jsonb) from public,anon;
revoke all on function public.test_work_automation_rule(uuid,uuid) from public,anon;
revoke all on function public.work_scheduler_tick(timestamptz) from public,anon,authenticated;
grant execute on function public.save_task_template(jsonb) to authenticated;
grant execute on function public.save_work_automation_rule(jsonb) to authenticated;
grant execute on function public.test_work_automation_rule(uuid,uuid) to authenticated;
grant execute on function public.work_scheduler_tick(timestamptz) to service_role;
revoke all on function app_private.execute_work_automations(uuid,text,uuid) from public,anon,authenticated;
revoke all on function app_private.work_scheduler_tick_internal(timestamptz) from public,anon,authenticated;
