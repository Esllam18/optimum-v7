-- Optimum V7 engineering draft save fast path.
-- Safe design goals:
-- 1) preserve optimistic locking and existing authorization semantics;
-- 2) do not rewrite BOQ rows when the BOQ snapshot is unchanged;
-- 3) update BOQ set-wise and only mutate rows whose values changed;
-- 4) skip the drawing-row touch only for a true no-op; real revision changes still refresh drawing updated_at;
-- 5) preserve the existing RPC signature and response fields; additive flags are informational.

create or replace function public.save_engineering_draft(
  p_revision_id uuid,
  p_snapshot jsonb,
  p_sheet_settings jsonb,
  p_boq jsonb default '[]'::jsonb,
  p_change_note text default null,
  p_expected_lock_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  r public.engineering_revisions%rowtype;
  v_new_lock integer;
  v_boq_changed boolean;
  v_revision_changed boolean;
begin
  select * into r
  from public.engineering_revisions
  where id=p_revision_id
  for update;

  if not found then raise exception 'Revision not found'; end if;
  if not exists(
    select 1 from public.engineering_drawings d
    where d.id=r.drawing_id
      and app_private.user_has_resource_permission(auth.uid(),r.company_id,'drawings.edit',d.project_id,d.site_id,d.folder_id,d.id)
  ) then raise exception 'Permission denied'; end if;
  if r.status<>'draft' then raise exception 'Only draft revisions can be edited'; end if;
  if p_expected_lock_version is not null and r.lock_version<>p_expected_lock_version then raise exception 'Revision changed by another user'; end if;
  if jsonb_typeof(p_snapshot)<>'object'
    or jsonb_typeof(coalesce(p_sheet_settings,'{}'::jsonb))<>'object'
    or jsonb_typeof(coalesce(p_boq,'[]'::jsonb))<>'array'
  then raise exception 'Invalid engineering payload'; end if;

  v_boq_changed := coalesce(p_boq,'[]'::jsonb) is distinct from coalesce(r.boq_snapshot,'[]'::jsonb);
  v_revision_changed := p_snapshot is distinct from r.snapshot
    or coalesce(p_sheet_settings,'{}'::jsonb) is distinct from coalesce(r.sheet_settings,'{}'::jsonb)
    or v_boq_changed
    or (nullif(trim(p_change_note),'') is not null and nullif(trim(p_change_note),'') is distinct from r.change_note);

  if v_revision_changed then
    update public.engineering_revisions
    set snapshot=p_snapshot,
        sheet_settings=coalesce(p_sheet_settings,'{}'::jsonb),
        boq_snapshot=coalesce(p_boq,'[]'::jsonb),
        change_note=coalesce(nullif(trim(p_change_note),''),change_note),
        lock_version=lock_version+1
    where id=p_revision_id
    returning lock_version into v_new_lock;
  else
    v_new_lock := r.lock_version;
  end if;

  if v_boq_changed then
    with normalized as (
      select distinct on (item_code,source_kind)
        item_code,category,description_ar,description_en,unit,quantity,source_kind,metadata
      from (
        select
          coalesce(nullif(item->>'code',''),'CUSTOM') item_code,
          coalesce(nullif(item->>'category',''),'other') category,
          coalesce(nullif(item->>'description_ar',''),item->>'name_ar','بند هندسي') description_ar,
          coalesce(nullif(item->>'description_en',''),item->>'name_en','Engineering item') description_en,
          coalesce(nullif(item->>'unit',''),'ea') unit,
          greatest(coalesce((item->>'quantity')::numeric,0),0) quantity,
          case when item->>'source_kind' in('auto','manual','adjustment') then item->>'source_kind' else 'auto' end source_kind,
          coalesce(item->'metadata','{}'::jsonb) metadata,
          ord
        from jsonb_array_elements(coalesce(p_boq,'[]'::jsonb)) with ordinality e(item,ord)
      ) x
      order by item_code,source_kind,ord desc
    )
    delete from public.engineering_revision_boq b
    where b.revision_id=p_revision_id
      and not exists(
        select 1 from normalized n
        where n.item_code=b.item_code and n.source_kind=b.source_kind
      );

    with normalized as (
      select distinct on (item_code,source_kind)
        item_code,category,description_ar,description_en,unit,quantity,source_kind,metadata
      from (
        select
          coalesce(nullif(item->>'code',''),'CUSTOM') item_code,
          coalesce(nullif(item->>'category',''),'other') category,
          coalesce(nullif(item->>'description_ar',''),item->>'name_ar','بند هندسي') description_ar,
          coalesce(nullif(item->>'description_en',''),item->>'name_en','Engineering item') description_en,
          coalesce(nullif(item->>'unit',''),'ea') unit,
          greatest(coalesce((item->>'quantity')::numeric,0),0) quantity,
          case when item->>'source_kind' in('auto','manual','adjustment') then item->>'source_kind' else 'auto' end source_kind,
          coalesce(item->'metadata','{}'::jsonb) metadata,
          ord
        from jsonb_array_elements(coalesce(p_boq,'[]'::jsonb)) with ordinality e(item,ord)
      ) x
      order by item_code,source_kind,ord desc
    )
    insert into public.engineering_revision_boq as b(
      company_id,revision_id,item_code,category,description_ar,description_en,unit,quantity,source_kind,metadata
    )
    select r.company_id,p_revision_id,n.item_code,n.category,n.description_ar,n.description_en,n.unit,n.quantity,n.source_kind,n.metadata
    from normalized n
    on conflict(revision_id,item_code,source_kind) do update
    set quantity=excluded.quantity,
        description_ar=excluded.description_ar,
        description_en=excluded.description_en,
        unit=excluded.unit,
        category=excluded.category,
        metadata=excluded.metadata
    where (b.quantity,b.description_ar,b.description_en,b.unit,b.category,b.metadata)
      is distinct from (excluded.quantity,excluded.description_ar,excluded.description_en,excluded.unit,excluded.category,excluded.metadata);
  end if;

  update public.engineering_drawings
  set updated_by=auth.uid(),current_revision_id=p_revision_id,status='draft'
  where id=r.drawing_id
    and (
      v_revision_changed
      or current_revision_id is distinct from p_revision_id
      or status is distinct from 'draft'
      or updated_by is distinct from auth.uid()
    );

  return jsonb_build_object(
    'revision_id',p_revision_id,
    'lock_version',v_new_lock,
    'saved_at',now(),
    'changed',v_revision_changed,
    'boq_changed',v_boq_changed
  );
end $$;
