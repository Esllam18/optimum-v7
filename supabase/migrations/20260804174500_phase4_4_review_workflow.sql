begin;
alter type public.engineering_mark_status add value if not exists 'in_progress';
alter type public.engineering_mark_status add value if not exists 'reopened';
alter table public.engineering_review_marks
  add column if not exists title text,
  add column if not exists priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  add column if not exists assigned_to uuid references public.profiles(id),
  add column if not exists target_kind text check (target_kind in ('node','route','text','sheet')),
  add column if not exists target_id text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists due_at timestamptz;
create table if not exists public.engineering_review_mark_updates (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  mark_id uuid not null references public.engineering_review_marks(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  old_status public.engineering_mark_status,
  new_status public.engineering_mark_status,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists engineering_mark_updates_mark_idx on public.engineering_review_mark_updates(mark_id,created_at);
create index if not exists engineering_mark_updates_company_idx on public.engineering_review_mark_updates(company_id,created_at desc);
alter table public.engineering_review_mark_updates enable row level security;
drop policy if exists engineering_mark_updates_select on public.engineering_review_mark_updates;
create policy engineering_mark_updates_select on public.engineering_review_mark_updates for select to authenticated
using (app_private.has_company_permission(company_id,'drawings.view'));
create or replace function public.add_engineering_review_mark(
  p_revision_id uuid,p_x numeric,p_y numeric,p_body text,p_title text default null,p_priority text default 'normal',p_target_kind text default 'sheet',p_target_id text default null,p_assigned_to uuid default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.engineering_revisions%rowtype;v_id uuid;
begin
  select * into r from public.engineering_revisions where id=p_revision_id;
  if not found then raise exception 'Revision not found'; end if;
  if not app_private.has_company_permission(r.company_id,'drawings.review') then raise exception 'Permission denied'; end if;
  if p_priority not in ('low','normal','high','critical') then raise exception 'Invalid priority'; end if;
  if p_target_kind not in ('node','route','text','sheet') then raise exception 'Invalid target'; end if;
  if p_assigned_to is not null and not exists(select 1 from public.company_memberships m where m.company_id=r.company_id and m.user_id=p_assigned_to and m.status='active') then raise exception 'Assignee is not an active company member'; end if;
  insert into public.engineering_review_marks(company_id,drawing_id,revision_id,x,y,title,body,priority,target_kind,target_id,assigned_to,created_by)
  values(r.company_id,r.drawing_id,p_revision_id,p_x,p_y,nullif(trim(p_title),''),trim(p_body),p_priority,p_target_kind,p_target_id,p_assigned_to,auth.uid()) returning id into v_id;
  insert into public.engineering_review_mark_updates(company_id,mark_id,body,new_status,created_by) values(r.company_id,v_id,trim(p_body),'open',auth.uid());
  return v_id;
end;$$;
create or replace function public.update_engineering_review_mark(
  p_mark_id uuid,p_status public.engineering_mark_status default null,p_title text default null,p_body text default null,p_priority text default null,p_assigned_to uuid default null,p_due_at timestamptz default null,p_update_note text default null
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.engineering_review_marks%rowtype;v_old public.engineering_mark_status;v_new public.engineering_mark_status;
begin
  select * into m from public.engineering_review_marks where id=p_mark_id for update;
  if not found then raise exception 'Review mark not found'; end if;
  if not app_private.has_company_permission(m.company_id,'drawings.review') then raise exception 'Permission denied'; end if;
  if p_priority is not null and p_priority not in ('low','normal','high','critical') then raise exception 'Invalid priority'; end if;
  if p_assigned_to is not null and not exists(select 1 from public.company_memberships cm where cm.company_id=m.company_id and cm.user_id=p_assigned_to and cm.status='active') then raise exception 'Assignee is not an active company member'; end if;
  v_old:=m.status;v_new:=coalesce(p_status,m.status);
  update public.engineering_review_marks set status=v_new,title=case when p_title is null then title else nullif(trim(p_title),'') end,body=case when p_body is null then body else trim(p_body) end,priority=coalesce(p_priority,priority),assigned_to=coalesce(p_assigned_to,assigned_to),due_at=coalesce(p_due_at,due_at),updated_at=now(),resolved_by=case when v_new='resolved' then auth.uid() when v_new in ('open','reopened','in_progress') then null else resolved_by end,resolved_at=case when v_new='resolved' then now() when v_new in ('open','reopened','in_progress') then null else resolved_at end where id=p_mark_id;
  if nullif(trim(coalesce(p_update_note,'')),'') is not null or v_old is distinct from v_new then
    insert into public.engineering_review_mark_updates(company_id,mark_id,body,old_status,new_status,created_by) values(m.company_id,p_mark_id,coalesce(nullif(trim(p_update_note),''),'Status updated'),v_old,v_new,auth.uid());
  end if;
end;$$;
create or replace function public.resolve_engineering_review_mark(p_mark_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin perform public.update_engineering_review_mark(p_mark_id,'resolved',null,null,null,null,null,'Review mark resolved');end;$$;
revoke all on function public.add_engineering_review_mark(uuid,numeric,numeric,text,text,text,text,text,uuid) from public;
grant execute on function public.add_engineering_review_mark(uuid,numeric,numeric,text,text,text,text,text,uuid) to authenticated;
revoke all on function public.update_engineering_review_mark(uuid,public.engineering_mark_status,text,text,text,uuid,timestamptz,text) from public;
grant execute on function public.update_engineering_review_mark(uuid,public.engineering_mark_status,text,text,text,uuid,timestamptz,text) to authenticated;
revoke all on function public.resolve_engineering_review_mark(uuid) from public;
grant execute on function public.resolve_engineering_review_mark(uuid) to authenticated;
commit;
