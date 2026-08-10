-- V7 client diagnostics. Intentionally separate from business/audit events.
create table if not exists public.client_telemetry_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 64),
  severity text not null default 'error' check (severity in ('info','warn','error')),
  route text check (route is null or char_length(route) <= 320),
  message text not null check (char_length(message) between 1 and 1000),
  fingerprint text check (fingerprint is null or char_length(fingerprint) <= 180),
  session_id text check (session_id is null or char_length(session_id) <= 100),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint client_telemetry_context_object check (jsonb_typeof(context) = 'object'),
  constraint client_telemetry_context_size check (octet_length(context::text) <= 12000)
);

alter table public.client_telemetry_events enable row level security;
revoke all on table public.client_telemetry_events from public, anon, authenticated;
grant insert on table public.client_telemetry_events to authenticated;

create policy client_telemetry_insert_own_company
on public.client_telemetry_events
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.company_memberships m
    where m.company_id = client_telemetry_events.company_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

create index if not exists idx_client_telemetry_company_created
  on public.client_telemetry_events(company_id, created_at desc);
create index if not exists idx_client_telemetry_fingerprint_created
  on public.client_telemetry_events(fingerprint, created_at desc)
  where fingerprint is not null;

comment on table public.client_telemetry_events is 'V7 technical diagnostics only. No client SELECT grant; business audit remains in audit_events.';
