-- Optimum 6.7.0 — Workflow template Data API least-privilege closure.
revoke all privileges on table public.work_workflow_templates from anon;
revoke all privileges on table public.work_workflow_templates from public;
grant select on table public.work_workflow_templates to authenticated;
revoke insert,update,delete,truncate,references,trigger on table public.work_workflow_templates from authenticated;
