'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../lib/api';
import { can } from '../lib/workspace';
import { projectAreaHref } from '../lib/navigation';
import { formatDate, normalizeArray, statusTone } from '../lib/format';
import { tx } from '../lib/i18n';
import Icon from '../components/Icon';
import SideSheet from '../components/SideSheet';
import WorkTaskActions from '../components/WorkTaskActions';
import WorkItemEditor from '../components/WorkItemEditor';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Panel, Skeleton, Stat } from '../components/Primitives';

const PAGE_SIZE = 25;
const baseFilters = {
  scope: 'my',
  risk: 'all',
  due: 'all',
  project_id: 'all',
  task_type: 'all',
  assignee_user_id: ''
};

function TaskDetail({ taskId, locale, onClose, router, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  useEffect(() => {
    if (!taskId) { setData(null); setError(null); return; }
    const c = new AbortController();
    setData(null); setError(null);
    api.rpc('work_task_detail', { p_task_id: taskId }, { cacheTtlMs: reload ? 0 : 8_000, signal: c.signal, dedupe: !reload })
      .then(setData).catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => c.abort();
  }, [taskId, reload]);

  const task = data?.task || {};
  const capabilities = data?.capabilities || {};
  const context = { project_id: task.project_id, site_id: task.site_id, folder_id: task.folder_id, document_id: task.document_id };
  return <SideSheet open={Boolean(taskId)} onClose={onClose} eyebrow="WORK 360" title={data ? `#${task.task_number || '—'} · ${task.title || tx(locale, 'task')}` : tx(locale, 'loading')} subtitle={data ? `${task.task_type || 'task'} · ${task.priority || 'medium'}` : ''}>
    {error ? <ErrorState title={tx(locale, 'networkIssue')} description={error.message} /> : !data ? <Skeleton lines={9} /> : <>
      <div className="v7-detail-section">
        <div className="v7-detail-grid">
          <div className="v7-detail-field"><span>{tx(locale, 'status')}</span><strong><Badge tone={statusTone(task.status)}>{task.status}</Badge></strong></div>
          <div className="v7-detail-field"><span>{tx(locale, 'due')}</span><strong>{formatDate(task.due_at, locale)}</strong></div>
          <div className="v7-detail-field"><span>{locale === 'ar' ? 'المخاطر' : 'Risk'}</span><strong>{data.risk?.level || 'low'} · {data.risk?.score ?? 0}</strong></div>
          <div className="v7-detail-field"><span>{tx(locale, 'progress')}</span><strong>{Number(task.progress || 0)}%</strong></div>
        </div>
        {task.description ? <p>{task.description}</p> : null}
        <div className="v7-capability-row">{Object.entries(capabilities).filter(([, allowed]) => allowed).map(([key]) => <Badge key={key} tone="success">{key}</Badge>)}</div>
        <div className="v7-inline-actions">
          {capabilities.edit ? <Button variant="primary" icon="edit" onClick={() => setEditorOpen(true)}>{locale === 'ar' ? 'تحرير كامل' : 'Full editor'}</Button> : null}
          {task.document_id ? <Button icon="file" onClick={() => router.push(projectAreaHref('documents', context, { document: task.document_id }))}>{locale === 'ar' ? 'فتح المستند' : 'Open document'}</Button> : null}
          {task.project_id ? <Button icon="briefcase" onClick={() => router.push(projectAreaHref('project', context))}>{locale === 'ar' ? 'المشروع 360' : 'Project 360'}</Button> : null}
        </div>
      </div>
      <div className="v7-detail-section v7-work360-recent"><h3>{locale === 'ar' ? 'آخر نشاط' : 'Recent activity'}</h3>{normalizeArray(data.events).length ? <div className="v7-linked-list">{normalizeArray(data.events).slice(0, 3).map(item => <article key={item.id}><Icon name="activity" size={15} /><span><strong>{item.event_type}</strong><small>{item.actor_name || (locale === 'ar' ? 'النظام' : 'System')} · {formatDate(item.created_at, locale)}</small></span></article>)}</div> : <p>{locale === 'ar' ? 'لم يتم تسجيل نشاط بعد.' : 'No activity has been recorded yet.'}</p>}</div>
      <WorkTaskActions data={data} locale={locale} onChanged={async () => { setReload(value => value + 1); await onChanged?.(); }} />
      <div className="v7-detail-section"><h3>{locale === 'ar' ? 'الأشخاص والمسؤوليات' : 'People & accountability'}</h3>{normalizeArray(data.assignments).length ? <div className="v7-linked-list">{normalizeArray(data.assignments).map(item => <article key={item.id}><Icon name="users" size={15} /><span><strong>{item.name || (locale === 'ar' ? item.role_name_ar : item.role_name_en) || item.role_name_en || item.role_name_ar || (locale === 'ar' ? 'مسند إليه' : 'Assignee')}</strong><small>{item.user_id ? (locale === 'ar' ? 'إسناد مباشر' : 'Direct assignment') : (locale === 'ar' ? 'إسناد بالدور' : 'Role assignment')}</small></span></article>)}</div> : <p>{locale === 'ar' ? 'لا توجد تعيينات إضافية؛ قد تكون المهمة مملوكة لمستخدم أو متاحة للاستلام.' : 'No additional assignments. The task may be owned or open for claiming.'}</p>}</div>
      <WorkItemEditor open={editorOpen} onClose={() => setEditorOpen(false)} data={data} locale={locale} onSaved={async () => { setReload(value => value + 1); await onChanged?.(); }} />
    </>}
  </SideSheet>;
}

function CreateTaskSheet({ open, onClose, workspace, locale, onCreated, context }) {
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', due: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!open) { setError(''); setForm({ title: '', description: '', priority: 'medium', due: '' }); } }, [open]);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true); setError('');
    try {
      const id = await api.rpc('create_task', {
        p_company_id: workspace.company.id,
        p_title: form.title.trim(),
        p_description: form.description.trim() || null,
        p_priority: form.priority,
        p_project_id: context.project_id || null,
        p_site_id: context.site_id || null,
        p_folder_id: context.folder_id || null,
        p_document_id: context.document_id || null,
        p_due_at: form.due ? new Date(form.due).toISOString() : null,
        p_assignee_user_ids: [workspace.user.id],
        p_open_unassigned: false,
        p_visibility: 'company'
      });
      api.clearReadCache('work_');
      await onCreated(id);
    } catch (err) { setError(err.message || 'Could not create task'); }
    finally { setSaving(false); }
  };

  const contextText = [context.project_id ? (locale === 'ar' ? 'داخل المشروع' : 'Project scoped') : null, context.site_id ? (locale === 'ar' ? 'داخل الموقع' : 'Site scoped') : null, context.document_id ? (locale === 'ar' ? 'مرتبط بمستند' : 'Linked document') : null].filter(Boolean).join(' · ');
  return <SideSheet open={open} onClose={onClose} eyebrow="QUICK CREATE" title={locale === 'ar' ? 'مهمة جديدة' : 'New task'} subtitle={contextText || (locale === 'ar' ? 'تُسند إليك افتراضيًا ويمكن تعديلها بعد الإنشاء.' : 'Assigned to you by default; full controls remain available after creation.')}>
    <form className="v7-form-stack" onSubmit={submit}>
      <label><span>{locale === 'ar' ? 'العنوان' : 'Title'}</span><input value={form.title} onChange={e => set('title', e.target.value)} required autoFocus /></label>
      <label><span>{locale === 'ar' ? 'الوصف' : 'Description'}</span><textarea value={form.description} onChange={e => set('description', e.target.value)} rows={5} /></label>
      <div className="v7-form-grid"><label><span>{locale === 'ar' ? 'الأولوية' : 'Priority'}</span><select value={form.priority} onChange={e => set('priority', e.target.value)}><option value="low">{locale === 'ar' ? 'منخفضة' : 'Low'}</option><option value="medium">{locale === 'ar' ? 'متوسطة' : 'Medium'}</option><option value="high">{locale === 'ar' ? 'عالية' : 'High'}</option><option value="urgent">{locale === 'ar' ? 'عاجلة' : 'Urgent'}</option></select></label><label><span>{tx(locale, 'due')}</span><input type="datetime-local" value={form.due} onChange={e => set('due', e.target.value)} /></label></div>
      {error ? <div className="v7-form-error">{error}</div> : null}
      <div className="v7-form-actions"><Button type="button" onClick={onClose}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button><Button type="submit" variant="primary" icon="plus" disabled={saving || !form.title.trim()}>{saving ? tx(locale, 'loading') : tx(locale, 'quickCreate')}</Button></div>
    </form>
  </SideSheet>;
}

export default function WorkPage({ workspace, locale }) {
  const params = useSearchParams();
  const router = useRouter();
  const taskId = params.get('task') || '';
  const requestedCreate = params.get('create') === 'task';
  const requestedStatus = ['open', 'blocked', 'done', 'all'].includes(params.get('status')) ? params.get('status') : 'open';
  const requestedDue = ['all', 'overdue', 'today', 'week', 'none'].includes(params.get('due')) ? params.get('due') : 'all';
  const context = useMemo(() => ({
    project_id: params.get('project') || '',
    site_id: params.get('site') || '',
    folder_id: params.get('folder') || '',
    document_id: params.get('document') || ''
  }), [params]);
  const [payload, setPayload] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(requestedStatus);
  const [dueFilter, setDueFilter] = useState(requestedDue);
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [createOpen, setCreateOpen] = useState(requestedCreate);

  useEffect(() => { if (requestedCreate) setCreateOpen(true); }, [requestedCreate]);
  useEffect(() => { setStatus(requestedStatus); setDueFilter(requestedDue); }, [requestedStatus, requestedDue]);
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(query.trim()), 240);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => { setPage(0); }, [status, dueFilter, searchTerm, workspace.company.id, context.project_id, context.site_id, context.folder_id, context.document_id]);

  useEffect(() => {
    const c = new AbortController();
    setError(null); setPayload(null);
    const taskFilters = {
      ...baseFilters,
      status: status === 'open' ? 'active' : status === 'all' ? 'all' : status,
      search: searchTerm,
      due: dueFilter,
      project_id: context.project_id || 'all',
      site_id: context.site_id || '',
      folder_id: context.folder_id || '',
      document_id: context.document_id || ''
    };
    const scopedRequest = Boolean(context.project_id || context.site_id || context.folder_id || context.document_id);
    Promise.all([
      api.rpc('work_task_query', { p_company_id: workspace.company.id, p_filters: taskFilters, p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE }, { cacheTtlMs: 10_000, signal: c.signal, dedupe: true }),
      scopedRequest ? Promise.resolve(null) : api.rpc('work_dashboard_metrics', { p_company_id: workspace.company.id }, { cacheTtlMs: 20_000, signal: c.signal, dedupe: true })
    ]).then(([p, m]) => { setPayload(p); setMetrics(m || null); }).catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => c.abort();
  }, [workspace.company.id, status, dueFilter, searchTerm, page, reload, context.project_id, context.site_id, context.folder_id, context.document_id]);

  const rows = normalizeArray(payload?.items);
  const openTask = (id) => router.push(projectAreaHref('work', context, { task: id }));
  const closeTask = () => router.push(projectAreaHref('work', context));
  const closeCreate = () => { setCreateOpen(false); router.replace(projectAreaHref('work', context)); };
  const changeStatus = (value) => { setStatus(value); setPage(0); };
  const clearAttentionFilter = () => { setDueFilter('all'); router.replace('/v7/work'); };
  if (error) return <ErrorState title={tx(locale, 'networkIssue')} description={error.message} retryLabel={tx(locale, 'retry')} onRetry={() => setReload(x => x + 1)} />;

  const scoped = Boolean(context.project_id || context.site_id || context.folder_id || context.document_id);
  return <>
    <PageHeader eyebrow="WORK OS" title={tx(locale, 'workCenter')} description={tx(locale, 'workCenterSub')} actions={<div className="v7-inline-actions"><Button icon="trend" onClick={() => router.push('/v7/work-intelligence')}>{locale === 'ar' ? 'إدارة العمل' : 'Work operations'}</Button>{can(workspace, 'tasks.create') ? <Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>{tx(locale, 'quickCreate')}</Button> : null}</div>}>
      {scoped ? <div className="v7-context-chips"><span>{locale === 'ar' ? 'سياق العمل مفعّل' : 'Context scoped'}</span>{context.project_id ? <button onClick={() => router.push(projectAreaHref('project', context))}>{locale === 'ar' ? 'فتح المشروع' : 'Open project'}</button> : null}<button onClick={() => router.push('/v7/work')}>{locale === 'ar' ? 'مسح السياق' : 'Clear context'}</button></div> : dueFilter !== 'all' ? <div className="v7-context-chips v7-attention-filter"><span><Icon name={dueFilter === 'overdue' ? 'alert' : 'clock'} size={13} />{dueFilter === 'overdue' ? (locale === 'ar' ? 'المتأخر فقط' : 'Overdue only') : dueFilter === 'today' ? (locale === 'ar' ? 'مستحق اليوم' : 'Due today') : dueFilter}</span><button onClick={clearAttentionFilter}>{locale === 'ar' ? 'مسح الفلتر' : 'Clear filter'}</button></div> : null}
    </PageHeader>
    {!scoped ? <section className="v7-work-pulse">
      <div className="v7-work-pulse-copy"><span className="v7-eyebrow">{locale === 'ar' ? 'تركيز التنفيذ' : 'EXECUTION FOCUS'}</span><strong>{locale === 'ar' ? 'ما الذي يحتاج حركة الآن؟' : 'What needs movement now?'}</strong><small>{locale === 'ar' ? 'المتأخر والمحجوب والمستحق اليوم أمامك قبل بقية قائمة العمل.' : 'Overdue, blocked, and due-today work is surfaced before the rest of the queue.'}</small></div>
      <div className="v7-work-pulse-metrics">
        <button className={Number(metrics?.overdue || 0) ? 'is-danger' : ''} onClick={() => { setDueFilter('overdue'); setPage(0); }}><span>{locale === 'ar' ? 'متأخر' : 'Overdue'}</span><strong>{metrics?.overdue ?? '—'}</strong></button>
        <button className={Number(metrics?.blocked || 0) ? 'is-warning' : ''} onClick={() => { setStatus('blocked'); setPage(0); }}><span>{locale === 'ar' ? 'محجوب' : 'Blocked'}</span><strong>{metrics?.blocked ?? '—'}</strong></button>
        <button onClick={() => { setDueFilter('today'); setPage(0); }}><span>{locale === 'ar' ? 'مستحق اليوم' : 'Due today'}</span><strong>{metrics?.due_today ?? '—'}</strong></button>
        <div><span>{tx(locale, 'openWork')}</span><strong>{metrics?.my_todo ?? '—'}</strong></div>
      </div>
    </section> : <div className="v7-context-summary"><span><Icon name="check" size={18} /></span><div><strong>{payload?.total ?? '—'} {locale === 'ar' ? 'مهمة داخل السياق الحالي' : 'tasks in the current context'}</strong><small>{locale === 'ar' ? 'تم إلغاء مؤشرات الشركة العامة هنا حتى لا تختلط أرقام المؤسسة مع المشروع أو الموقع أو المستند المفتوح.' : 'Company-wide metrics are intentionally suppressed here so organization totals are not confused with the active project, site, folder or document.'}</small></div></div>}
    <Panel className="v7-work-panel">
      <div className="v7-toolbar v7-work-toolbar"><div className="v7-search-field"><Icon name="search" size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={tx(locale, 'search')} /></div><div className="v7-segments"><button className={status === 'open' ? 'is-active' : ''} onClick={() => changeStatus('open')}>{locale === 'ar' ? 'مفتوح' : 'Open'}</button><button className={status === 'blocked' ? 'is-active' : ''} onClick={() => changeStatus('blocked')}>{locale === 'ar' ? 'محجوب' : 'Blocked'}</button><button className={status === 'done' ? 'is-active' : ''} onClick={() => changeStatus('done')}>{locale === 'ar' ? 'مكتمل' : 'Done'}</button><button className={status === 'all' ? 'is-active' : ''} onClick={() => changeStatus('all')}>{tx(locale, 'all')}</button></div><div className="v7-segments v7-due-segments"><button className={dueFilter === 'all' ? 'is-active' : ''} onClick={() => { setDueFilter('all'); setPage(0); }}>{locale === 'ar' ? 'كل المواعيد' : 'Any due'}</button><button className={dueFilter === 'today' ? 'is-active' : ''} onClick={() => { setDueFilter('today'); setPage(0); }}>{locale === 'ar' ? 'اليوم' : 'Today'}</button><button className={dueFilter === 'overdue' ? 'is-active' : ''} onClick={() => { setDueFilter('overdue'); setPage(0); }}>{locale === 'ar' ? 'متأخر' : 'Overdue'}</button><button className={dueFilter === 'week' ? 'is-active' : ''} onClick={() => { setDueFilter('week'); setPage(0); }}>{locale === 'ar' ? 'هذا الأسبوع' : 'This week'}</button></div></div>
      {!payload ? <Skeleton lines={8} /> : rows.length ? <div className="v7-work-table"><div className="v7-work-head"><span>{locale === 'ar' ? 'المهمة' : 'Task'}</span><span>{locale === 'ar' ? 'السياق' : 'Context'}</span><span>{tx(locale, 'due')}</span><span>{tx(locale, 'status')}</span></div>{rows.map(task => <button className="v7-work-row" key={task.id} aria-label={`${task.title} · ${task.status || ''}`} onClick={() => openTask(task.id)}><span className="v7-work-title"><i className={`v7-priority-dot is-${task.priority || 'medium'}`} /><span><strong>#{task.task_number || '—'} · {task.title}</strong><small>{task.priority || 'medium'} · {task.risk?.level || 'low'} {locale === 'ar' ? 'مخاطر' : 'risk'}</small></span></span><span className="v7-work-context">{task.project_name || task.owner_name || '—'}</span><span className="v7-work-due">{formatDate(task.due_at, locale)}</span><span className="v7-work-status"><Badge tone={statusTone(task.status)}>{task.status}</Badge></span></button>)}</div> : <EmptyState icon="check" title={tx(locale, 'noTasks')} description={searchTerm ? (locale === 'ar' ? `لا توجد مهام تطابق «${searchTerm}».` : `No work matches “${searchTerm}”.`) : null} />}
      {payload ? <div className="v7-pager"><span>{payload.total ?? rows.length} {locale === 'ar' ? 'مهمة' : 'tasks'} · {locale === 'ar' ? 'صفحة' : 'Page'} {page + 1}</span><div><Button onClick={() => setPage(value => Math.max(0, value - 1))} disabled={page === 0}>←</Button><Button onClick={() => setPage(value => value + 1)} disabled={!payload.has_more}>→</Button></div></div> : null}
    </Panel>
    <TaskDetail taskId={taskId} locale={locale} onClose={closeTask} router={router} onChanged={() => setReload(value => value + 1)} />
    <CreateTaskSheet open={createOpen} onClose={closeCreate} workspace={workspace} locale={locale} context={context} onCreated={async (id) => { setCreateOpen(false); setReload(x => x + 1); openTask(id); }} />
  </>;
}
