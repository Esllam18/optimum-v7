begin;

create table public.engineering_document_links(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  drawing_id uuid not null references public.engineering_drawings(id) on delete cascade,
  revision_id uuid references public.engineering_revisions(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  relation_type text not null check (relation_type in ('source','export','boq','reference')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (drawing_id, revision_id, document_id, relation_type)
);

create index engineering_document_links_drawing_idx on public.engineering_document_links(drawing_id, created_at desc);
create index engineering_document_links_revision_idx on public.engineering_document_links(revision_id) where revision_id is not null;
create index engineering_document_links_document_idx on public.engineering_document_links(document_id);
create index engineering_document_links_company_idx on public.engineering_document_links(company_id);

alter table public.engineering_document_links enable row level security;
create policy engineering_document_links_select
on public.engineering_document_links for select to authenticated
using (app_private.has_company_permission(company_id, 'drawings.view'));

create or replace function public.link_engineering_document(
  p_drawing_id uuid,
  p_revision_id uuid,
  p_document_id uuid,
  p_relation_type text
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  d public.engineering_drawings%rowtype;
  doc public.documents%rowtype;
  v_id uuid;
  v_permission text;
begin
  select * into d from public.engineering_drawings where id = p_drawing_id and archived_at is null;
  if not found then raise exception 'Drawing not found'; end if;

  v_permission := case when p_relation_type in ('export','boq') then 'drawings.export' else 'drawings.edit' end;
  if not app_private.has_company_permission(d.company_id, v_permission) then raise exception 'Permission denied'; end if;
  if p_relation_type not in ('source','export','boq','reference') then raise exception 'Invalid document relation'; end if;

  select * into doc from public.documents where id = p_document_id and state = 'active';
  if not found
     or doc.company_id <> d.company_id
     or doc.project_id <> d.project_id
     or doc.site_id is distinct from d.site_id then
    raise exception 'Document scope is invalid';
  end if;

  if p_revision_id is not null and not exists (
    select 1 from public.engineering_revisions r
    where r.id = p_revision_id and r.drawing_id = p_drawing_id
  ) then raise exception 'Revision scope is invalid'; end if;

  insert into public.engineering_document_links(
    company_id, drawing_id, revision_id, document_id, relation_type, created_by
  ) values (
    d.company_id, p_drawing_id, p_revision_id, p_document_id, p_relation_type, auth.uid()
  )
  on conflict (drawing_id, revision_id, document_id, relation_type)
  do update set created_at = now()
  returning id into v_id;

  if p_relation_type = 'source' then
    update public.engineering_drawings
       set source_document_id = p_document_id, updated_by = auth.uid()
     where id = p_drawing_id;
  end if;

  insert into public.audit_events(company_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    d.company_id, auth.uid(), 'engineering.document_linked', 'engineering_drawing', p_drawing_id,
    jsonb_build_object('document_id', p_document_id, 'revision_id', p_revision_id, 'relation_type', p_relation_type)
  );
  return v_id;
end;
$$;

create or replace function public.unlink_engineering_document(p_link_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare l public.engineering_document_links%rowtype;
begin
  select * into l from public.engineering_document_links where id = p_link_id for update;
  if not found then raise exception 'Document link not found'; end if;
  if not app_private.has_company_permission(l.company_id, 'drawings.edit') then raise exception 'Permission denied'; end if;

  delete from public.engineering_document_links where id = p_link_id;
  if l.relation_type = 'source' then
    update public.engineering_drawings
       set source_document_id = null, updated_by = auth.uid()
     where id = l.drawing_id and source_document_id = l.document_id;
  end if;
end;
$$;

revoke all on function public.link_engineering_document(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.link_engineering_document(uuid, uuid, uuid, text) to authenticated;
revoke all on function public.unlink_engineering_document(uuid) from public, anon;
grant execute on function public.unlink_engineering_document(uuid) to authenticated;

commit;
