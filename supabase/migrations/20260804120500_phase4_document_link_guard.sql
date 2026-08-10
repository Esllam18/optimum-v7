begin;

create unique index engineering_source_link_unique
on public.engineering_document_links(drawing_id)
where relation_type = 'source';

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

  if p_relation_type = 'source' then
    delete from public.engineering_document_links
    where drawing_id = p_drawing_id and relation_type = 'source';
  end if;

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

revoke all on function public.link_engineering_document(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.link_engineering_document(uuid, uuid, uuid, text) to authenticated;

commit;
