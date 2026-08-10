begin;

-- Clone any selected, immutable revision into a new editable draft. The source
-- row is locked before the drawing row, matching the publication workflow and
-- preventing a publication/create race from replacing the new current draft.
create or replace function public.create_engineering_revision_from(
  p_source_revision_id uuid,
  p_change_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.engineering_revisions%rowtype;
  v_drawing public.engineering_drawings%rowtype;
  v_revision_id uuid;
  v_revision_number integer;
  v_revision_code_number integer;
  v_revision_code text;
  v_change_note text;
  v_is_restore boolean;
begin
  if auth.uid() is null then
    raise exception 'Permission denied';
  end if;

  select r.*
    into v_source
    from public.engineering_revisions r
   where r.id = p_source_revision_id
   for update;

  if not found then
    raise exception 'Revision not found';
  end if;

  if not app_private.has_company_permission(v_source.company_id, 'drawings.edit') then
    raise exception 'Permission denied';
  end if;

  select d.*
    into v_drawing
    from public.engineering_drawings d
   where d.id = v_source.drawing_id
     and d.company_id = v_source.company_id
     and d.archived_at is null
   for update;

  if not found then
    raise exception 'Drawing not found';
  end if;

  -- The drawing lock serializes all revision creation for this drawing. This
  -- check therefore enforces the existing one-editable-draft workflow.
  if exists (
    select 1
      from public.engineering_revisions r
     where r.drawing_id = v_drawing.id
       and r.status = 'draft'
  ) then
    raise exception 'A draft revision already exists';
  end if;

  select coalesce(max(r.revision_number), 0) + 1
    into v_revision_number
    from public.engineering_revisions r
   where r.drawing_id = v_drawing.id;

  -- Normal drawings start at R0 while the internal revision_number starts at
  -- 1. Reading existing codes also keeps legacy drawings that started at R1
  -- monotonic and prevents the next generated code from going backwards.
  select coalesce(
           max((substring(r.revision_code from '^R([0-9]+)$'))::integer),
           -1
         ) + 1
    into v_revision_code_number
    from public.engineering_revisions r
   where r.drawing_id = v_drawing.id;

  v_revision_code := 'R' || v_revision_code_number::text;
  v_change_note := nullif(btrim(p_change_note), '');
  v_is_restore := v_drawing.current_revision_id is distinct from v_source.id;

  insert into public.engineering_revisions (
    company_id,
    drawing_id,
    revision_number,
    revision_code,
    status,
    snapshot,
    sheet_settings,
    boq_snapshot,
    change_note,
    created_by
  ) values (
    v_drawing.company_id,
    v_drawing.id,
    v_revision_number,
    v_revision_code,
    'draft',
    v_source.snapshot,
    v_source.sheet_settings,
    v_source.boq_snapshot,
    v_change_note,
    auth.uid()
  )
  returning id into v_revision_id;

  insert into public.engineering_revision_boq (
    company_id,
    revision_id,
    item_code,
    category,
    description_ar,
    description_en,
    unit,
    quantity,
    source_kind,
    metadata
  )
  select
    v_drawing.company_id,
    v_revision_id,
    b.item_code,
    b.category,
    b.description_ar,
    b.description_en,
    b.unit,
    b.quantity,
    b.source_kind,
    b.metadata
  from public.engineering_revision_boq b
  where b.revision_id = v_source.id;

  update public.engineering_drawings
     set current_revision_id = v_revision_id,
         status = 'draft',
         updated_by = auth.uid()
   where id = v_drawing.id;

  insert into public.audit_events (
    company_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_drawing.company_id,
    auth.uid(),
    case
      when v_is_restore then 'engineering.revision_restored'
      else 'engineering.revision_created'
    end,
    'engineering_drawing',
    v_drawing.id,
    jsonb_strip_nulls(jsonb_build_object(
      'revision_id', v_revision_id,
      'revision_number', v_revision_number,
      'revision_code', v_revision_code,
      'source_revision_id', v_source.id,
      'source_revision_number', v_source.revision_number,
      'source_revision_code', v_source.revision_code,
      'source_revision_status', v_source.status,
      'change_note', v_change_note,
      'restored_previous_version', v_is_restore
    ))
  );

  return jsonb_build_object(
    'drawing_id', v_drawing.id,
    'revision_id', v_revision_id,
    'revision_number', v_revision_number,
    'revision_code', v_revision_code,
    'source_revision_id', v_source.id,
    'source_revision_code', v_source.revision_code,
    'restored_previous_version', v_is_restore
  );
end;
$$;

-- Keep the original API stable, but route it through the same corrected,
-- serialized clone path using the drawing's current revision as the source.
create or replace function public.create_engineering_revision(
  p_drawing_id uuid,
  p_change_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_revision_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Permission denied';
  end if;

  select r.id
    into v_source_revision_id
    from public.engineering_drawings d
    join public.engineering_revisions r
      on r.id = d.current_revision_id
     and r.drawing_id = d.id
     and r.company_id = d.company_id
   where d.id = p_drawing_id
     and d.archived_at is null;

  if not found then
    raise exception 'Drawing or current revision not found';
  end if;

  return public.create_engineering_revision_from(
    v_source_revision_id,
    p_change_note
  );
end;
$$;

revoke all on function public.create_engineering_revision_from(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_engineering_revision_from(uuid, text)
  to authenticated;

revoke all on function public.create_engineering_revision(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_engineering_revision(uuid, text)
  to authenticated;

comment on function public.create_engineering_revision_from(uuid, text) is
  'Creates a new editable draft by cloning a selected engineering revision and its BOQ.';

commit;
