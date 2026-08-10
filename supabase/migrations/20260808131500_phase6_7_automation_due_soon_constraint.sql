-- Optimum 6.7 — allow the scheduled due-soon trigger at the table boundary too.
alter table public.work_automation_rules drop constraint if exists work_automation_rules_trigger_type_check;
alter table public.work_automation_rules add constraint work_automation_rules_trigger_type_check
check(trigger_type in ('task.created','task.status_changed','task.overdue','task.due_soon'));
