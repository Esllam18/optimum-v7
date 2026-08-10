'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { can } from '../lib/workspace';
import { formatBytes, formatDate, normalizeArray, statusTone } from '../lib/format';
import { tx } from '../lib/i18n';
import Icon from '../components/Icon';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Panel, Skeleton } from '../components/Primitives';

const percent = (value, limit) => {
  const n = Number(value || 0); const l = Number(limit || 0);
  if (!Number.isFinite(l) || l <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((n / l) * 100)));
};

function CapacityRow({ label, value, limit, display, locale }) {
  const measured = Number.isFinite(Number(limit)) && Number(limit) > 0;
  const ratio = measured ? percent(value, limit) : 0;
  return <div className="v7-capacity-row">
    <div><span>{label}</span><strong dir="ltr">{display || (measured ? `${value} / ${limit}` : String(value ?? '—'))}</strong></div>
    <div className="v7-capacity-track" aria-label={`${label} ${ratio}%`}><i style={{ width: measured ? `${ratio}%` : '18%' }} className={!measured ? 'is-unlimited' : ratio >= 90 ? 'is-danger' : ratio >= 75 ? 'is-warning' : ''} /></div>
    <small>{measured ? `${ratio}%` : (locale === 'ar' ? 'بدون حد ظاهر' : 'No visible cap')}</small>
  </div>;
}

export default function DashboardPage({ workspace, locale }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    Promise.all([
      can(workspace, 'projects.view') ? api.select('projects', { filters: { company_id: `eq.${workspace.company.id}` }, order: 'updated_at.desc', limit: 7, cacheTtlMs: 20_000, signal: controller.signal }) : [],
      can(workspace, 'tasks.view') ? api.rpc('work_dashboard_metrics', { p_company_id: workspace.company.id }, { cacheTtlMs: 20_000, signal: controller.signal, dedupe: true }) : {},
      can(workspace, 'tasks.view') ? api.rpc('work_task_query', { p_company_id: workspace.company.id, p_filters: { status: 'active', scope: 'my', risk: 'all', due: 'all', project_id: 'all', task_type: 'all', assignee_user_id: '', search: '' }, p_limit: 6, p_offset: 0 }, { cacheTtlMs: 12_000, signal: controller.signal, dedupe: true }).catch(() => ({})) : {}
    ]).then(([projects, metrics, tasksPayload]) => setData({ projects, metrics: metrics || {}, tasks: normalizeArray(tasksPayload?.rows || tasksPayload?.items || tasksPayload?.tasks || tasksPayload) })).catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => controller.abort();
  }, [workspace.company.id, workspace.user.id, reload]);

  if (error) return <ErrorState title={tx(locale, 'networkIssue')} description={error.message} retryLabel={tx(locale, 'retry')} onRetry={() => setReload(x => x + 1)} />;

  const policy = workspace.policy || {};
  const usage = policy.usage || {};
  const limits = policy.limits || {};
  const metrics = data?.metrics || {};
  const activeProjectCount = usage.active_projects ?? '—';
  const openWork = data?.metrics?.my_todo ?? '—';
  const storageUsed = Number(usage.storage_bytes || 0);
  const memberCount = usage.active_members ?? '—';
  const overdue = Number(metrics.overdue || 0);
  const blocked = Number(metrics.blocked || 0);
  const dueToday = Number(metrics.due_today || 0);
  const attentionTotal = overdue + blocked + dueToday;
  const pulseTitle = !data
    ? tx(locale, 'loading')
    : attentionTotal > 0
      ? (locale === 'ar' ? `${attentionTotal} نقاط تحتاج قرارًا اليوم` : `${attentionTotal} items need a decision today`)
      : (locale === 'ar' ? 'مساحة العمل تحت السيطرة' : 'Workspace is under control');
  const pulseDescription = !data
    ? (locale === 'ar' ? 'نجمع فقط مؤشرات التنفيذ اللازمة لهذه اللحظة.' : 'Loading only the execution signals needed for this moment.')
    : attentionTotal > 0
      ? (locale === 'ar' ? 'ابدأ بالمتأخر والمحجوب، ثم انتقل لما يستحق اليوم. الباقي يظل خارج المشهد حتى تحتاجه.' : 'Start with overdue and blocked work, then handle what is due today. Everything else stays out of the way.')
      : (locale === 'ar' ? 'لا يوجد متأخر أو محجوب أو مستحق اليوم ضمن نطاقك الحالي.' : 'No overdue, blocked or due-today work is visible in your current scope.');

  return <>
    <PageHeader eyebrow="OPTIMUM · NEXT" title={`${tx(locale, 'welcome')}، ${workspace.profile?.full_name?.split(' ')[0] || ''}`} description={tx(locale, 'welcomeSub')} actions={<Button variant="secondary" icon="refresh" onClick={() => { api.clearReadCache(); setReload(x => x + 1); }}>{tx(locale, 'refresh')}</Button>} />

    <section className="v7-dashboard-hero">
      <div className="v7-dashboard-pulse">
        <span className="v7-eyebrow">EXECUTION PULSE</span>
        <h2>{pulseTitle}</h2>
        <p>{pulseDescription}</p>
        {!data ? <Skeleton lines={3} /> : <div className="v7-signal-grid">
          <button className={overdue ? 'is-danger' : ''} onClick={() => router.push('/v7/work?due=overdue')} disabled={!can(workspace, 'tasks.view')}><span><Icon name="alert" size={17} /></span><strong>{overdue}</strong><small>{locale === 'ar' ? 'متأخر' : 'Overdue'}</small><Icon name="chevron" size={14} /></button>
          <button className={blocked ? 'is-warning' : ''} onClick={() => router.push('/v7/work?status=blocked')} disabled={!can(workspace, 'tasks.view')}><span><Icon name="shield" size={17} /></span><strong>{blocked}</strong><small>{locale === 'ar' ? 'محجوب' : 'Blocked'}</small><Icon name="chevron" size={14} /></button>
          <button onClick={() => router.push('/v7/work?due=today')} disabled={!can(workspace, 'tasks.view')}><span><Icon name="clock" size={17} /></span><strong>{dueToday}</strong><small>{locale === 'ar' ? 'مستحق اليوم' : 'Due today'}</small><Icon name="chevron" size={14} /></button>
        </div>}
        <div className="v7-dashboard-quick-links">
          {can(workspace, 'tasks.view') ? <Button variant="primary" icon="check" onClick={() => router.push('/v7/work')}>{tx(locale, 'work')}</Button> : null}
          {can(workspace, 'projects.view') ? <Button icon="briefcase" onClick={() => router.push('/v7/projects')}>{tx(locale, 'projects')}</Button> : null}
          {can(workspace, 'files.view') ? <Button icon="folder" onClick={() => router.push('/v7/documents')}>{tx(locale, 'documents')}</Button> : null}
        </div>
      </div>

      <aside className="v7-capacity-card">
        <header><div><span className="v7-eyebrow">WORKSPACE CAPACITY</span><h3>{locale === 'ar' ? 'السعة والاستخدام' : 'Capacity & usage'}</h3></div><span className="v7-capacity-status"><i />{locale === 'ar' ? 'فعّال' : 'Live'}</span></header>
        <CapacityRow label={tx(locale, 'storage')} value={storageUsed} limit={limits.max_storage_bytes} display={limits.max_storage_bytes ? `${formatBytes(storageUsed, locale)} / ${formatBytes(limits.max_storage_bytes, locale)}` : formatBytes(storageUsed, locale)} locale={locale} />
        <CapacityRow label={tx(locale, 'activeProjects')} value={activeProjectCount} limit={limits.max_projects} locale={locale} />
        <CapacityRow label={tx(locale, 'members')} value={memberCount} limit={limits.max_members} locale={locale} />
        <footer><span><Icon name="activity" size={14} />{locale === 'ar' ? 'العمل المفتوح' : 'Open work'}</span><strong>{openWork}</strong></footer>
      </aside>
    </section>

    <div className="v7-two-column v7-dashboard-columns">
      <Panel className="v7-dashboard-work-panel" title={tx(locale, 'priorityWork')} description={tx(locale, 'workCenterSub')} action={<button className="v7-text-action" onClick={() => router.push('/v7/work')}>{tx(locale, 'viewAll')} <Icon name="arrow" size={14} /></button>}>
        {!data ? <Skeleton lines={5} /> : data.tasks.length ? <div className="v7-list">{data.tasks.map(task => <button className="v7-list-row" key={task.id} onClick={() => router.push(`/v7/work?task=${task.id}`)}><span className={`v7-priority-dot is-${task.priority || 'medium'}`} /><span className="v7-list-main"><strong>#{task.task_number || '—'} · {task.title}</strong><small>{task.project_name || task.site_name || tx(locale, 'task')}</small></span><span className="v7-list-meta"><Badge tone={statusTone(task.status)}>{task.status || 'todo'}</Badge><small>{task.due_at ? formatDate(task.due_at, locale) : '—'}</small></span><Icon name="chevron" size={15} /></button>)}</div> : <EmptyState icon="check" title={tx(locale, 'noTasks')} />}
      </Panel>

      <Panel className="v7-dashboard-project-panel" title={tx(locale, 'recentProjects')} description={tx(locale, 'projectCenterSub')} action={<button className="v7-text-action" onClick={() => router.push('/v7/projects')}>{tx(locale, 'viewAll')} <Icon name="arrow" size={14} /></button>}>
        {!data ? <Skeleton lines={5} /> : data.projects.length ? <div className="v7-project-compact-grid">{data.projects.slice(0, 6).map(project => <button key={project.id} className="v7-project-compact" onClick={() => router.push(`/v7/projects/${project.id}`)}><div><span>{project.code}</span><Badge tone={statusTone(project.status)}>{project.status}</Badge></div><strong>{project.name}</strong><small>{project.client_name || '—'}</small><div className="v7-progress"><i style={{ width: `${Math.max(0, Math.min(100, Number(project.progress_percent || 0)))}%` }} /></div><footer><span>{Number(project.progress_percent || 0)}%</span><span>{project.target_end_date ? formatDate(project.target_end_date, locale) : '—'}</span></footer></button>)}</div> : <EmptyState icon="briefcase" title={tx(locale, 'noProjects')} />}
      </Panel>
    </div>
  </>;
}
