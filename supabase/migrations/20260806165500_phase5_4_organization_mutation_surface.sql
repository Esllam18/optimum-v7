begin;

-- Company, branding, and compensation writes must flow through audited RPCs.
drop policy if exists companies_update_manage on public.companies;
drop policy if exists company_branding_insert on public.company_branding;
drop policy if exists company_branding_update on public.company_branding;
drop policy if exists company_branding_delete on public.company_branding;
drop policy if exists compensation_insert on public.member_compensation;
drop policy if exists compensation_update on public.member_compensation;
drop policy if exists compensation_delete on public.member_compensation;

commit;
