begin;

create extension if not exists pgcrypto;

create type public.membership_status as enum ('invited','active','suspended','left');
create type public.project_status as enum ('planned','active','on_hold','completed','archived');
create type public.invitation_status as enum ('pending','accepted','revoked','expired');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  preferred_locale text not null default 'ar' check (preferred_locale in ('ar','en')),
  preferred_theme text not null default 'system' check (preferred_theme in ('system','light','dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  logo_url text,
  default_locale text not null default 'ar' check (default_locale in ('ar','en')),
  timezone text not null default 'Africa/Cairo',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.permissions (
  key text primary key,
  module text not null,
  description_ar text not null,
  description_en text not null
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name_ar text not null,
  name_en text not null,
  slug text not null,
  is_default boolean not null default false,
  is_protected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, slug)
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  allowed boolean not null default true,
  primary key (role_id, permission_key)
);

create table public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id),
  status public.membership_status not null default 'active',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, user_id)
);

create table public.member_permission_overrides (
  membership_id uuid not null references public.company_memberships(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  allowed boolean not null,
  primary key (membership_id, permission_key)
);

create table public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  role_id uuid not null references public.roles(id),
  token_hash text not null unique,
  status public.invitation_status not null default 'pending',
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (email = lower(trim(email)))
);

create unique index company_invitations_pending_email_idx
  on public.company_invitations(company_id, email)
  where status = 'pending';

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text,
  status public.project_status not null default 'active',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(company_id, code)
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(project_id, code)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index memberships_user_idx on public.company_memberships(user_id, status);
create index memberships_company_idx on public.company_memberships(company_id, status);
create index roles_company_idx on public.roles(company_id);
create index projects_company_idx on public.projects(company_id, status);
create index sites_project_idx on public.sites(project_id);
create index audit_company_created_idx on public.audit_events(company_id, created_at desc);

insert into public.permissions(key,module,description_ar,description_en) values
('company.view','company','عرض بيانات الشركة','View company'),
('company.manage','company','تعديل إعدادات الشركة','Manage company'),
('members.view','members','عرض أعضاء الشركة','View members'),
('members.invite','members','دعوة أعضاء','Invite members'),
('members.manage','members','تعديل الأدوار وحالة الأعضاء','Manage members'),
('roles.view','roles','عرض الأدوار والصلاحيات','View roles'),
('roles.manage','roles','إدارة الأدوار والصلاحيات','Manage roles'),
('projects.view','projects','عرض المشاريع والمواقع','View projects and sites'),
('projects.create','projects','إنشاء مشاريع ومواقع','Create projects and sites'),
('projects.edit','projects','تعديل المشاريع والمواقع','Edit projects and sites'),
('projects.archive','projects','أرشفة المشاريع والمواقع','Archive projects and sites'),
('audit.view','audit','عرض سجل النشاط','View audit log');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger companies_set_updated_at before update on public.companies for each row execute function public.set_updated_at();
create trigger roles_set_updated_at before update on public.roles for each row execute function public.set_updated_at();
create trigger memberships_set_updated_at before update on public.company_memberships for each row execute function public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger sites_set_updated_at before update on public.sites for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles(id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_memberships m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.has_company_permission(p_company_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_memberships m
    join public.roles r on r.id = m.role_id and r.company_id = m.company_id
    left join public.member_permission_overrides o
      on o.membership_id = m.id and o.permission_key = p_permission
    left join public.role_permissions rp
      on rp.role_id = r.id and rp.permission_key = p_permission
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and coalesce(o.allowed, rp.allowed, false) = true
  );
$$;

create or replace function public.create_company(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_owner_role uuid;
  v_admin_role uuid;
  v_manager_role uuid;
  v_engineer_role uuid;
  v_supervisor_role uuid;
  v_viewer_role uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.companies(name, slug, created_by)
  values (trim(p_name), lower(trim(p_slug)), auth.uid()) returning id into v_company_id;
  insert into public.roles(company_id,name_ar,name_en,slug,is_default,is_protected) values
  (v_company_id,'صاحب الشركة','Owner','owner',true,true) returning id into v_owner_role;
  insert into public.roles(company_id,name_ar,name_en,slug,is_default,is_protected) values
  (v_company_id,'مدير النظام','Admin','admin',true,true) returning id into v_admin_role;
  insert into public.roles(company_id,name_ar,name_en,slug,is_default,is_protected) values
  (v_company_id,'مدير','Manager','manager',true,true) returning id into v_manager_role;
  insert into public.roles(company_id,name_ar,name_en,slug,is_default,is_protected) values
  (v_company_id,'مهندس','Engineer','engineer',true,true) returning id into v_engineer_role;
  insert into public.roles(company_id,name_ar,name_en,slug,is_default,is_protected) values
  (v_company_id,'مشرف','Supervisor','supervisor',true,true) returning id into v_supervisor_role;
  insert into public.roles(company_id,name_ar,name_en,slug,is_default,is_protected) values
  (v_company_id,'مشاهد','Viewer','viewer',true,true) returning id into v_viewer_role;
  insert into public.role_permissions(role_id,permission_key,allowed) select v_owner_role,key,true from public.permissions;
  insert into public.role_permissions(role_id,permission_key,allowed) select v_admin_role,key,true from public.permissions where key <> 'company.manage';
  insert into public.role_permissions(role_id,permission_key,allowed) select v_manager_role,key,true from public.permissions where key in ('company.view','members.view','roles.view','projects.view','projects.create','projects.edit','projects.archive','audit.view');
  insert into public.role_permissions(role_id,permission_key,allowed) select v_engineer_role,key,true from public.permissions where key in ('company.view','members.view','projects.view');
  insert into public.role_permissions(role_id,permission_key,allowed) select v_supervisor_role,key,true from public.permissions where key in ('company.view','members.view','projects.view');
  insert into public.role_permissions(role_id,permission_key,allowed) select v_viewer_role,key,true from public.permissions where key in ('company.view','projects.view');
  insert into public.company_memberships(company_id,user_id,role_id,status,joined_at) values(v_company_id,auth.uid(),v_owner_role,'active',now());
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(v_company_id,auth.uid(),'company.created','company',v_company_id,jsonb_build_object('name',trim(p_name)));
  return v_company_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.company_memberships enable row level security;
alter table public.member_permission_overrides enable row level security;
alter table public.company_invitations enable row level security;
alter table public.projects enable row level security;
alter table public.sites enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_select_self_or_colleague on public.profiles for select to authenticated using (id=auth.uid() or exists(select 1 from public.company_memberships me join public.company_memberships them on them.company_id=me.company_id where me.user_id=auth.uid() and me.status='active' and them.user_id=profiles.id and them.status='active'));
create policy profiles_update_self on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy companies_select_member on public.companies for select to authenticated using (public.is_company_member(id));
create policy companies_update_manage on public.companies for update to authenticated using (public.has_company_permission(id,'company.manage')) with check (public.has_company_permission(id,'company.manage'));
create policy permissions_select_authenticated on public.permissions for select to authenticated using (true);
create policy roles_select_member on public.roles for select to authenticated using (public.is_company_member(company_id));
create policy roles_manage on public.roles for all to authenticated using (public.has_company_permission(company_id,'roles.manage')) with check (public.has_company_permission(company_id,'roles.manage'));
create policy role_permissions_select_member on public.role_permissions for select to authenticated using (exists(select 1 from public.roles r where r.id=role_id and public.is_company_member(r.company_id)));
create policy role_permissions_manage on public.role_permissions for all to authenticated using (exists(select 1 from public.roles r where r.id=role_id and public.has_company_permission(r.company_id,'roles.manage'))) with check (exists(select 1 from public.roles r where r.id=role_id and public.has_company_permission(r.company_id,'roles.manage')));
create policy memberships_select_member on public.company_memberships for select to authenticated using (public.is_company_member(company_id));
create policy memberships_manage on public.company_memberships for update to authenticated using (public.has_company_permission(company_id,'members.manage')) with check (public.has_company_permission(company_id,'members.manage'));
create policy overrides_select_member on public.member_permission_overrides for select to authenticated using (exists(select 1 from public.company_memberships m where m.id=membership_id and public.is_company_member(m.company_id)));
create policy overrides_manage on public.member_permission_overrides for all to authenticated using (exists(select 1 from public.company_memberships m where m.id=membership_id and public.has_company_permission(m.company_id,'members.manage'))) with check (exists(select 1 from public.company_memberships m where m.id=membership_id and public.has_company_permission(m.company_id,'members.manage')));
create policy invitations_select_manage on public.company_invitations for select to authenticated using (public.has_company_permission(company_id,'members.view'));
create policy invitations_insert_manage on public.company_invitations for insert to authenticated with check (public.has_company_permission(company_id,'members.invite') and invited_by=auth.uid());
create policy invitations_update_manage on public.company_invitations for update to authenticated using (public.has_company_permission(company_id,'members.manage')) with check (public.has_company_permission(company_id,'members.manage'));
create policy projects_select on public.projects for select to authenticated using (public.has_company_permission(company_id,'projects.view'));
create policy projects_insert on public.projects for insert to authenticated with check (public.has_company_permission(company_id,'projects.create') and created_by=auth.uid());
create policy projects_update on public.projects for update to authenticated using (public.has_company_permission(company_id,'projects.edit')) with check (public.has_company_permission(company_id,'projects.edit'));
create policy sites_select on public.sites for select to authenticated using (public.has_company_permission(company_id,'projects.view'));
create policy sites_insert on public.sites for insert to authenticated with check (public.has_company_permission(company_id,'projects.create') and created_by=auth.uid() and exists(select 1 from public.projects p where p.id=project_id and p.company_id=sites.company_id));
create policy sites_update on public.sites for update to authenticated using (public.has_company_permission(company_id,'projects.edit')) with check (public.has_company_permission(company_id,'projects.edit') and exists(select 1 from public.projects p where p.id=project_id and p.company_id=sites.company_id));
create policy audit_select on public.audit_events for select to authenticated using (public.has_company_permission(company_id,'audit.view'));

revoke all on function public.create_company(text,text) from public;
grant execute on function public.create_company(text,text) to authenticated;
revoke all on function public.is_company_member(uuid) from public;
grant execute on function public.is_company_member(uuid) to authenticated;
revoke all on function public.has_company_permission(uuid,text) from public;
grant execute on function public.has_company_permission(uuid,text) to authenticated;

commit;
