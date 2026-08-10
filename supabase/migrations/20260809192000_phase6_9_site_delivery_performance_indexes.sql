-- Optimum 6.9.0 — Site Delivery performance covering indexes
create index if not exists site_cabinets_company_idx on public.site_cabinets(company_id);
create index if not exists site_cabinets_created_by_idx on public.site_cabinets(created_by);
create index if not exists site_claim_items_added_by_idx on public.site_claim_items(added_by);
create index if not exists site_claim_items_company_idx on public.site_claim_items(company_id);
create index if not exists site_claim_items_requirement_idx on public.site_claim_items(requirement_id);
create index if not exists site_claim_packages_company_idx on public.site_claim_packages(company_id);
create index if not exists site_claim_packages_created_by_idx on public.site_claim_packages(created_by);
create index if not exists site_claim_packages_locked_by_idx on public.site_claim_packages(locked_by) where locked_by is not null;
create index if not exists site_claim_requirements_company_idx on public.site_claim_requirements(company_id);
create index if not exists site_claim_requirements_created_by_idx on public.site_claim_requirements(created_by) where created_by is not null;
