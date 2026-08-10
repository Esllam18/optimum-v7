-- Cover identity/provisioning and engineering foreign keys before production traffic.
create index if not exists account_security_created_by_idx on public.account_security(created_by);
create index if not exists memberships_provisioned_by_idx on public.company_memberships(provisioned_by);
create index if not exists engineering_document_links_created_by_idx on public.engineering_document_links(created_by);
create index if not exists engineering_mark_updates_created_by_idx on public.engineering_review_mark_updates(created_by);
create index if not exists engineering_marks_assigned_to_idx on public.engineering_review_marks(assigned_to);
