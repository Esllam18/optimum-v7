-- Optimum 6.9.0 — Site Delivery, Cabinets & Claim Packages
-- Makes cabinets first-class site workspaces and turns the site claim / final
-- dossier into a virtual, version-aware package instead of copied files.

begin;

-- ---------------------------------------------------------------------------
-- Cabinet domain + site claim package domain.
-- ---------------------------------------------------------------------------
create table if not exists public.site_cabinets(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  code text not null check(char_length(trim(code)) between 1 and 80),
  name text not null check(char_length(trim(name)) between 1 and 180),
  cabinet_type text not null default 'fiber_cabinet',
  status text not null default 'planned',
  description text,
  location_label text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  root_folder_id uuid references public.folders(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint site_cabinets_status_check check(status in ('planned','active','installed','testing','handover','completed','archived')),
  constraint site_cabinets_latitude_check check(latitude is null or latitude between -90 and 90),
  constraint site_cabinets_longitude_check check(longitude is null or longitude between -180 and 180)
);
create unique index if not exists site_cabinets_site_code_unique on public.site_cabinets(site_id,lower(code)) where archived_at is null;
create index if not exists site_cabinets_project_site_idx on public.site_cabinets(project_id,site_id,status);
create index if not exists site_cabinets_root_folder_idx on public.site_cabinets(root_folder_id) where root_folder_id is not null;

create table if not exists public.site_claim_packages(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  package_no text not null,
  title text not null,
  claim_type text not null default 'final',
  status text not null default 'collecting',
  period_from date,
  period_to date,
  notes text,
  locked_at timestamptz,
  locked_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_claim_packages_type_check check(claim_type in ('progress','final')),
  constraint site_claim_packages_status_check check(status in ('collecting','ready','submitted','approved','rejected','archived')),
  unique(site_id,package_no)
);
create unique index if not exists site_claim_default_final_unique on public.site_claim_packages(site_id,claim_type) where claim_type='final' and status<>'archived';
create index if not exists site_claim_packages_project_site_idx on public.site_claim_packages(project_id,site_id,status);

create table if not exists public.site_claim_requirements(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  package_id uuid not null references public.site_claim_packages(id) on delete cascade,
  requirement_key text not null,
  label_ar text not null,
  label_en text not null,
  category text not null default 'supporting',
  is_required boolean not null default true,
  min_items integer not null default 1 check(min_items between 0 and 1000),
  sort_order integer not null default 0,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(package_id,requirement_key)
);
create index if not exists site_claim_requirements_package_idx on public.site_claim_requirements(package_id,sort_order);

create table if not exists public.site_claim_items(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  package_id uuid not null references public.site_claim_packages(id) on delete cascade,
  requirement_id uuid not null references public.site_claim_requirements(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  selected_version_id uuid references public.document_versions(id) on delete restrict,
  cabinet_id uuid references public.site_cabinets(id) on delete set null,
  inclusion_mode text not null default 'manual',
  status text not null default 'included',
  note text,
  added_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_claim_items_mode_check check(inclusion_mode in ('manual','upload','auto')),
  constraint site_claim_items_status_check check(status in ('included','accepted','rejected')),
  unique(package_id,requirement_id,document_id)
);
create index if not exists site_claim_items_package_idx on public.site_claim_items(package_id,requirement_id);
create index if not exists site_claim_items_document_idx on public.site_claim_items(document_id);
create index if not exists site_claim_items_cabinet_idx on public.site_claim_items(cabinet_id) where cabinet_id is not null;
create index if not exists site_claim_items_version_idx on public.site_claim_items(selected_version_id) where selected_version_id is not null;

-- Updated-at and audit consistency.
drop trigger if exists site_cabinets_updated_at on public.site_cabinets;
create trigger site_cabinets_updated_at before update on public.site_cabinets for each row execute function public.set_updated_at();
drop trigger if exists site_claim_packages_updated_at on public.site_claim_packages;
create trigger site_claim_packages_updated_at before update on public.site_claim_packages for each row execute function public.set_updated_at();
drop trigger if exists site_claim_requirements_updated_at on public.site_claim_requirements;
create trigger site_claim_requirements_updated_at before update on public.site_claim_requirements for each row execute function public.set_updated_at();
drop trigger if exists site_claim_items_updated_at on public.site_claim_items;
create trigger site_claim_items_updated_at before update on public.site_claim_items for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['site_cabinets','site_claim_packages','site_claim_requirements','site_claim_items'] loop
    execute format('drop trigger if exists audit_%I on public.%I',t,t);
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function app_private.write_audit_event()',t,t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS / Data API: read can flow to the browser; all mutations go through RPCs.
-- ---------------------------------------------------------------------------
alter table public.site_cabinets enable row level security;
alter table public.site_claim_packages enable row level security;
alter table public.site_claim_requirements enable row level security;
alter table public.site_claim_items enable row level security;

drop policy if exists site_cabinets_select on public.site_cabinets;
create policy site_cabinets_select on public.site_cabinets for select to authenticated using(
  app_private.resource_permission_for_row(company_id,'projects.view',project_id,site_id,null,null)
);

drop policy if exists site_claim_packages_select on public.site_claim_packages;
create policy site_claim_packages_select on public.site_claim_packages for select to authenticated using(
  app_private.resource_permission_for_row(company_id,'files.view',project_id,site_id,null,null)
);

drop policy if exists site_claim_requirements_select on public.site_claim_requirements;
create policy site_claim_requirements_select on public.site_claim_requirements for select to authenticated using(
  exists(select 1 from public.site_claim_packages p where p.id=package_id and app_private.resource_permission_for_row(p.company_id,'files.view',p.project_id,p.site_id,null,null))
);

drop policy if exists site_claim_items_select on public.site_claim_items;
create policy site_claim_items_select on public.site_claim_items for select to authenticated using(
  exists(
    select 1 from public.site_claim_packages p join public.documents d on d.id=document_id
    where p.id=package_id and d.site_id=p.site_id
      and app_private.resource_permission_for_row(p.company_id,'files.view',p.project_id,p.site_id,d.folder_id,null)
  )
);

revoke all on public.site_cabinets,public.site_claim_packages,public.site_claim_requirements,public.site_claim_items from anon,authenticated;
grant select on public.site_cabinets,public.site_claim_packages,public.site_claim_requirements,public.site_claim_items to authenticated;
grant all on public.site_cabinets,public.site_claim_packages,public.site_claim_requirements,public.site_claim_items to service_role;

-- ---------------------------------------------------------------------------
-- Folder/cabinet context helpers.
-- ---------------------------------------------------------------------------
create or replace function app_private.cabinet_for_folder(p_folder_id uuid)
returns uuid language sql stable security definer set search_path='public','pg_temp'
as $$
  with recursive ancestors as(
    select f.id,f.parent_id from public.folders f where f.id=p_folder_id
    union all
    select p.id,p.parent_id from public.folders p join ancestors a on a.parent_id=p.id
  )
  select c.id from public.site_cabinets c join ancestors a on a.id=c.root_folder_id
  where c.archived_at is null order by c.created_at desc limit 1;
$$;

create or replace function app_private.folder_cabinet_operational(p_folder_id uuid)
returns boolean language sql stable security definer set search_path='public','pg_temp'
as $$
  select p_folder_id is null or not exists(
    with recursive ancestors as(
      select f.id,f.parent_id from public.folders f where f.id=p_folder_id
      union all select p.id,p.parent_id from public.folders p join ancestors a on a.parent_id=p.id
    )
    select 1 from public.site_cabinets c join ancestors a on a.id=c.root_folder_id
    where c.archived_at is not null or c.status='archived'
  );
$$;

create or replace function app_private.ensure_cabinet_parent_folder(p_site_id uuid,p_actor uuid)
returns uuid language plpgsql security definer set search_path='public','pg_temp'
as $$
declare s public.sites%rowtype;v_id uuid;
begin
  select * into s from public.sites where id=p_site_id;
  if not found then raise exception 'Site not found'; end if;
  select f.id into v_id from public.folders f
  where f.site_id=s.id and f.parent_id is null and f.trashed_at is null
    and (lower(f.name) in ('03 — cabinets','03 - cabinets','cabinets') or f.code='CAB')
  order by case when lower(f.name) like '03%' then 0 else 1 end,f.created_at limit 1;
  if v_id is null then
    insert into public.folders(company_id,project_id,site_id,parent_id,name,code,sort_order,is_system,created_by)
    values(s.company_id,s.project_id,s.id,null,'03 — Cabinets','CAB',30,true,p_actor) returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function app_private.seed_cabinet_workspace(p_cabinet_id uuid,p_actor uuid)
returns uuid language plpgsql security definer set search_path='public','pg_temp'
as $$
declare c public.site_cabinets%rowtype;v_parent uuid;v_root uuid;r record;
begin
  select * into c from public.site_cabinets where id=p_cabinet_id for update;
  if not found then raise exception 'Cabinet not found'; end if;
  v_parent:=app_private.ensure_cabinet_parent_folder(c.site_id,p_actor);
  v_root:=c.root_folder_id;
  if v_root is null then
    insert into public.folders(company_id,project_id,site_id,parent_id,name,code,sort_order,is_system,created_by)
    values(c.company_id,c.project_id,c.site_id,v_parent,trim(c.code)||' — '||trim(c.name),trim(c.code),10,true,p_actor)
    returning id into v_root;
    update public.site_cabinets set root_folder_id=v_root where id=c.id;
  end if;
  for r in select * from (values
    ('C01','Drawings & As-Built','الرسومات و As-Built',10),
    ('C02','Quantity Survey','الحصر والكميات',20),
    ('C03','Sketches','الاسكتشات',30),
    ('C04','Handover & Inspection','التسليم والمعاينات',40),
    ('C05','Photos','الصور',50),
    ('C06','Supporting Documents','المستندات الداعمة',60)
  ) as x(code,en,ar,ord) loop
    if not exists(select 1 from public.folders f where f.parent_id=v_root and f.trashed_at is null and f.code=r.code) then
      insert into public.folders(company_id,project_id,site_id,parent_id,name,code,sort_order,is_system,created_by)
      values(c.company_id,c.project_id,c.site_id,v_root,r.en,r.code,r.ord,true,p_actor);
    end if;
  end loop;
  return v_root;
end $$;

-- Cabinet archived = its workspace is read-only. This augments the 6.8 parent lifecycle guard.
create or replace function app_private.enforce_project_context_operational()
returns trigger language plpgsql security definer set search_path='public','pg_temp'
as $$
declare v_project uuid;v_site uuid;v_folder uuid;
begin
  if tg_op='DELETE' then return old; end if;
  v_project:=new.project_id;
  if tg_table_name='work_milestones' then
    v_site:=null;v_folder:=null;
  elsif tg_table_name='folders' then
    v_site:=new.site_id;v_folder:=new.parent_id;
  else
    v_site:=new.site_id;
    v_folder:=new.folder_id;
  end if;
  if v_project is not null and not app_private.project_context_operational(v_project,v_site) then
    raise exception 'Project or site is archived. Reactivate it before changing linked work or files.';
  end if;
  if v_folder is not null and not app_private.folder_cabinet_operational(v_folder) then
    raise exception 'Cabinet is archived. Reactivate it before changing linked work or files.';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Default site claim package + configurable requirements.
-- ---------------------------------------------------------------------------
create or replace function app_private.ensure_default_site_claim_package(p_site_id uuid,p_actor uuid)
returns uuid language plpgsql security definer set search_path='public','pg_temp'
as $$
declare s public.sites%rowtype;v_package uuid;
begin
  select * into s from public.sites where id=p_site_id;
  if not found then raise exception 'Site not found'; end if;
  select id into v_package from public.site_claim_packages where site_id=s.id and claim_type='final' and status<>'archived' order by created_at limit 1;
  if v_package is null then
    insert into public.site_claim_packages(company_id,project_id,site_id,package_no,title,claim_type,status,created_by)
    values(s.company_id,s.project_id,s.id,coalesce(nullif(s.code,''),left(s.id::text,8))||'-FINAL','Final Site Claim / Delivery Package','final','collecting',p_actor)
    returning id into v_package;
  end if;
  insert into public.site_claim_requirements(company_id,package_id,requirement_key,label_ar,label_en,category,is_required,min_items,sort_order,created_by)
  values
    (s.company_id,v_package,'work_order','أمر التكليف','Work Order','commercial',true,1,10,p_actor),
    (s.company_id,v_package,'contract','العقد / الاتفاق','Contract / Agreement','commercial',true,1,20,p_actor),
    (s.company_id,v_package,'quantity_survey','الحصر والكميات','Quantity Survey / Takeoff','quantity',true,1,30,p_actor),
    (s.company_id,v_package,'sketches','الاسكتشات','Sketches','technical',true,1,40,p_actor),
    (s.company_id,v_package,'handover_certificate','شهادات ومحاضر التسليم','Handover Certificates / Minutes','handover',true,1,50,p_actor),
    (s.company_id,v_package,'as_built_drawings','رسومات As-Built','As-Built Drawings','technical',true,1,60,p_actor),
    (s.company_id,v_package,'approvals','الاعتمادات والموافقات','Approvals / Acceptances','approval',false,1,70,p_actor),
    (s.company_id,v_package,'photos','صور الإثبات','Evidence Photos','evidence',false,1,80,p_actor),
    (s.company_id,v_package,'supporting','مستندات داعمة أخرى','Other Supporting Documents','supporting',false,1,90,p_actor)
  on conflict(package_id,requirement_key) do nothing;
  return v_package;
end $$;

create or replace function app_private.seed_site_claim_on_insert()
returns trigger language plpgsql security definer set search_path='public','pg_temp'
as $$ begin perform app_private.ensure_default_site_claim_package(new.id,new.created_by);return new;end $$;
drop trigger if exists sites_seed_default_claim on public.sites;
create trigger sites_seed_default_claim after insert on public.sites for each row execute function app_private.seed_site_claim_on_insert();

-- Backfill the default package for existing sites without altering existing files.
do $$ declare s record;begin
  for s in select id,created_by from public.sites loop
    perform app_private.ensure_default_site_claim_package(s.id,s.created_by);
  end loop;
end $$;

