-- Optimum 6.4 — Human-readable activity feed + enterprise audit ledger.

create or replace function app_private.task_event_audit_bridge()
returns trigger language plpgsql security definer set search_path='public','pg_temp' as $$
begin
 if new.event_type in ('task.claimed','task.comment_added','task.checklist_changed','task.attachment_added','task.recurrence_created') then
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(new.company_id,new.actor_id,new.event_type,'task',new.task_id,new.metadata||jsonb_build_object('task_event_id',new.id));
 end if;
 perform app_private.bump_work_runtime(new.company_id);
 return new;
end; $$;

drop trigger if exists task_events_audit_bridge on public.task_events;
create trigger task_events_audit_bridge after insert on public.task_events for each row execute function app_private.task_event_audit_bridge();

create or replace function public.work_activity_feed(p_company_id uuid,p_mode text default 'feed',p_filters jsonb default '{}'::jsonb,p_limit integer default 60,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='public','app_private','pg_temp' as $$
declare v_limit integer:=greatest(1,least(coalesce(p_limit,60),200));v_offset integer:=greatest(coalesce(p_offset,0),0);v_result jsonb;
begin
 if not app_private.has_company_permission(p_company_id,'audit.view') then raise exception 'Permission denied'; end if;
 with rows as (
  select a.id,a.action,a.entity_type,a.entity_id,a.metadata,a.created_at,a.actor_id,p.full_name actor_name,p.avatar_path actor_avatar_path,
   case when a.entity_type='task' then (select t.title from public.tasks t where t.id=a.entity_id)
        when a.entity_type in ('company_membership','company_memberships') then (select pr.full_name from public.company_memberships m join public.profiles pr on pr.id=m.user_id where m.id=a.entity_id)
        when a.entity_type in ('role','roles') then (select coalesce(r.name_en,r.name_ar) from public.roles r where r.id=a.entity_id)
        when a.entity_type in ('project','projects') then (select prj.name from public.projects prj where prj.id=a.entity_id)
        when a.entity_type in ('document','documents') then (select d.display_name from public.documents d where d.id=a.entity_id)
        when a.entity_type in ('folder','folders') then (select f.name from public.folders f where f.id=a.entity_id)
        else null end entity_title,
   case when a.action='task.created' then 'task_created'
        when a.action='task.status_changed' then 'task_status_changed'
        when a.action='task.updated' then 'task_updated'
        when a.action='task.comment_added' then 'task_comment_added'
        when a.action='task.claimed' then 'task_claimed'
        when a.action='task.checklist_changed' then 'task_checklist_changed'
        when a.action='task.attachment_added' then 'task_attachment_added'
        when a.action='task.recurrence_created' then 'task_recurrence_created'
        when a.action like 'member.%' or a.entity_type in ('company_membership','company_memberships') then 'member_changed'
        when a.action like 'role.%' or a.entity_type in ('role','roles') then 'role_changed'
        when a.action like 'engineering.%' then 'engineering_changed'
        when a.entity_type in ('documents','document','document_versions') then 'file_changed'
        when a.entity_type in ('folders','folder') then 'folder_changed'
        else 'system_changed' end human_key
  from public.audit_events a left join public.profiles p on p.id=a.actor_id
  where a.company_id=p_company_id
   and (coalesce(p_filters->>'search','')='' or a.action ilike '%'||(p_filters->>'search')||'%' or a.entity_type ilike '%'||(p_filters->>'search')||'%' or coalesce(p.full_name,'') ilike '%'||(p_filters->>'search')||'%' or a.metadata::text ilike '%'||(p_filters->>'search')||'%')
   and (coalesce(p_filters->>'action','') in ('','all') or a.action=p_filters->>'action')
   and (coalesce(p_filters->>'actor_id','')='' or a.actor_id=nullif(p_filters->>'actor_id','')::uuid)
   and (coalesce(p_filters->>'from','')='' or a.created_at>=nullif(p_filters->>'from','')::timestamptz)
   and (coalesce(p_filters->>'to','')='' or a.created_at<=nullif(p_filters->>'to','')::timestamptz)
   and (p_mode='audit' or a.action not like '%.insert' or a.entity_type not in ('folders','roles'))
  order by a.created_at desc
 ), page as (select * from rows limit v_limit offset v_offset)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),'total',(select count(*) from rows),'offset',v_offset,'limit',v_limit,'has_more',(select count(*) from rows)>v_offset+v_limit) into v_result;
 return v_result;
end; $$;

revoke all on function app_private.task_event_audit_bridge() from public,anon,authenticated;
revoke all on function public.work_activity_feed(uuid,text,jsonb,integer,integer) from public,anon;
grant execute on function public.work_activity_feed(uuid,text,jsonb,integer,integer) to authenticated;
