create index if not exists idx_client_telemetry_user_created
  on public.client_telemetry_events(user_id, created_at desc);

drop policy if exists client_telemetry_insert_own_company on public.client_telemetry_events;
create policy client_telemetry_insert_own_company
on public.client_telemetry_events
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.company_memberships m
    where m.company_id = client_telemetry_events.company_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);
