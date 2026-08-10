'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { can } from '../lib/workspace';
import { formatDate, normalizeArray, statusTone } from '../lib/format';
import Icon from '../components/Icon';
import SideSheet from '../components/SideSheet';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Panel, Skeleton, Stat } from '../components/Primitives';

const monthStart = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const monthEnd = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 1);
const isoDate = (date) => date.toISOString().slice(0, 10);
const sameDay = (value, date) => value && new Date(value).toDateString() === date.toDateString();
const kindLabel = (locale, kind) => ({
  ar: { task: 'مهمة', milestone: 'معلم تسليم', leave: 'إجازة', holiday: 'عطلة' },
  en: { task: 'Task', milestone: 'Milestone', leave: 'Leave', holiday: 'Holiday' }
})[locale]?.[kind] || kind;

const localDateTime = value => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function CalendarScheduleSheet({ event, locale, onClose, onSaved, router }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [startAt, setStartAt] = useState('');
  const [dueAt, setDueAt] = useState('');

  useEffect(() => {
    if (!event) { setDetail(null); setError(''); return; }
    setStartAt(localDateTime(event.start_at));
    setDueAt(localDateTime(event.end_at || event.start_at));
    if (event.kind !== 'task' || !event.id) { setDetail({ task: null, capabilities: {} }); return; }
    const c = new AbortController();
    setDetail(null); setError('');
    api.rpc('work_task_detail', { p_task_id: event.id }, { signal:c.signal, cacheTtlMs:0, dedupe:false })
      .then(data => { setDetail(data); setStartAt(localDateTime(data?.task?.start_at)); setDueAt(localDateTime(data?.task?.due_at)); })
      .catch(err => { if (err?.name !== 'AbortError') setError(err.message || 'Could not load work item'); });
    return () => c.abort();
  }, [event?.id, event?.kind]);

  const save = async () => {
    const task = detail?.task;
    if (!task?.id || !detail?.capabilities?.edit || saving) return;
    setSaving(true); setError('');
    try {
      await api.rpc('save_work_item', { p_payload: {
        id: task.id, company_id: task.company_id, expected_lock_version: task.lock_version,
        start_at: startAt ? new Date(startAt).toISOString() : null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null
      }});
      api.clearReadCache('work_');
      await onSaved?.();
      onClose?.();
    } catch (err) { setError(err.message || (locale === 'ar' ? 'تعذر إعادة جدولة العمل.' : 'Could not reschedule the work item.')); }
    finally { setSaving(false); }
  };

  return <SideSheet open={Boolean(event)} onClose={onClose} eyebrow="CALENDAR 360" title={event?.title || (locale === 'ar' ? 'حدث' : 'Event')} subtitle={event ? `${kindLabel(locale,event.kind)} · ${formatDate(event.start_at,locale)}` : ''}>
    {!event ? null : error && !detail ? <div className="v7-form-error">{error}</div> : !detail ? <Skeleton lines={7} /> : <>
      <div className="v7-detail-section"><div className="v7-detail-grid"><div className="v7-detail-field"><span>{locale === 'ar' ? 'النوع' : 'Type'}</span><strong>{kindLabel(locale,event.kind)}</strong></div><div className="v7-detail-field"><span>{locale === 'ar' ? 'الحالة' : 'Status'}</span><strong>{event.status || '—'}</strong></div><div className="v7-detail-field"><span>{locale === 'ar' ? 'البداية' : 'Start'}</span><strong>{formatDate(event.start_at,locale)}</strong></div><div className="v7-detail-field"><span>{locale === 'ar' ? 'النهاية' : 'End'}</span><strong>{formatDate(event.end_at,locale)}</strong></div></div></div>
      {event.kind === 'task' && detail?.task ? <div className="v7-detail-section"><div className="v7-section-heading"><h3>{locale === 'ar' ? 'الجدولة' : 'Scheduling'}</h3>{detail.capabilities?.edit ? <Badge tone="success">{locale === 'ar' ? 'قابل للتعديل' : 'Editable'}</Badge> : <Badge tone="neutral">{locale === 'ar' ? 'قراءة فقط' : 'Read only'}</Badge>}</div><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'موعد البداية' : 'Start date'}</span><input type="datetime-local" value={startAt} disabled={!detail.capabilities?.edit} onChange={e => setStartAt(e.target.value)} /></label><label><span>{locale === 'ar' ? 'موعد الاستحقاق' : 'Due date'}</span><input type="datetime-local" value={dueAt} disabled={!detail.capabilities?.edit} onChange={e => setDueAt(e.target.value)} /></label></div>{error ? <div className="v7-form-error">{error}</div> : null}<div className="v7-form-actions"><Button icon="external" type="button" onClick={() => router.push(`/v7/work?task=${encodeURIComponent(detail.task.id)}`)}>{locale === 'ar' ? 'فتح Work 360' : 'Open Work 360'}</Button>{detail.capabilities?.edit ? <Button variant="primary" icon="save" type="button" onClick={save} disabled={saving}>{saving ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'حفظ الجدولة' : 'Save schedule')}</Button> : null}</div></div> : <div className="v7-detail-section"><p>{locale === 'ar' ? 'هذا الحدث يأتي من الإجازات أو العطلات أو معالم التسليم؛ يتم تعديله من مصدره الأصلي.' : 'This event comes from leave, holidays, or milestones and is edited from its source workflow.'}</p></div>}
    </>}
  </SideSheet>;
}

export default function CalendarPage({ workspace, locale }) {
  const router = useRouter();
  const [cursor, setCursor] = useState(() => monthStart(new Date()));
  const [events, setEvents] = useState(null);
  const [capacity, setCapacity] = useState(null);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const canViewCapacity = can(workspace, 'tasks.view_workload') || can(workspace, 'tasks.manage');

  useEffect(() => {
    const c = new AbortController();
    setError(null); setEvents(null);
    const start = monthStart(cursor);
    const end = monthEnd(cursor);
    Promise.all([
      api.rpc('work_calendar_feed', {
        p_company_id: workspace.company.id,
        p_from: start.toISOString(),
        p_to: end.toISOString(),
        p_user_id: null
      }, { cacheTtlMs: 15_000, signal: c.signal, dedupe: true }),
      canViewCapacity ? api.rpc('work_capacity_plan', {
        p_company_id: workspace.company.id,
        p_from: isoDate(new Date()),
        p_days: 14
      }, { cacheTtlMs: 20_000, signal: c.signal, dedupe: true }) : Promise.resolve(null)
    ]).then(([calendar, plan]) => { setEvents(normalizeArray(calendar)); setCapacity(plan); })
      .catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => c.abort();
  }, [workspace.company.id, cursor, reload, canViewCapacity]);

  const days = useMemo(() => {
    const start = monthStart(cursor);
    const weekday = (start.getDay() + 6) % 7;
    const gridStart = new Date(start); gridStart.setDate(start.getDate() - weekday);
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });
  }, [cursor]);

  const monthTitle = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', { month: 'long', year: 'numeric' }).format(cursor);
  const today = new Date();
  const cells = normalizeArray(capacity?.cells);
  const members = normalizeArray(capacity?.members);
  const capacitySummary = members.map(member => {
    const memberCells = cells.filter(cell => cell.user_id === member.user_id);
    const planned = memberCells.reduce((sum, cell) => sum + Number(cell.planned_minutes || 0), 0);
    const available = memberCells.reduce((sum, cell) => sum + Number(cell.capacity_minutes || 0), 0);
    const utilization = available > 0 ? Math.round(planned / available * 100) : 0;
    return { ...member, planned, available, utilization };
  }).sort((a, b) => b.utilization - a.utilization).slice(0, 6);

  if (error) return <ErrorState title={locale === 'ar' ? 'تعذر تحميل التقويم' : 'Calendar could not be loaded'} description={error.message} retryLabel={locale === 'ar' ? 'إعادة المحاولة' : 'Retry'} onRetry={() => setReload(x => x + 1)} />;

  return <>
    <PageHeader eyebrow={locale === 'ar' ? 'التخطيط والقدرة' : 'PLANNING · CAPACITY'} title={locale === 'ar' ? 'التقويم التشغيلي' : 'Operating calendar'} description={locale === 'ar' ? 'المهام، معالم التسليم، الإجازات والعطلات في شاشة واحدة مرتبطة مباشرة بمحرك العمل.' : 'Tasks, delivery milestones, leave, and holidays in one calendar connected to the work engine.'} actions={<div className="v7-inline-actions"><Button onClick={() => setCursor(monthStart(new Date()))}>{locale === 'ar' ? 'اليوم' : 'Today'}</Button><Button icon="refresh" onClick={() => setReload(x => x + 1)}>{locale === 'ar' ? 'تحديث' : 'Refresh'}</Button></div>} />
    <section className="v7-calendar-summary">
      <Stat icon="check" label={locale === 'ar' ? 'أحداث الشهر' : 'Month events'} value={events?.length ?? '—'} />
      <Stat icon="briefcase" label={locale === 'ar' ? 'مهام' : 'Tasks'} value={events ? events.filter(x => x.kind === 'task').length : '—'} />
      <Stat icon="trend" label={locale === 'ar' ? 'معالم تسليم' : 'Milestones'} value={events ? events.filter(x => x.kind === 'milestone').length : '—'} />
      <Stat icon="users" label={locale === 'ar' ? 'إجازات وعطلات' : 'Leave & holidays'} value={events ? events.filter(x => x.kind === 'leave' || x.kind === 'holiday').length : '—'} />
    </section>
    <div className="v7-calendar-layout">
      <Panel className="v7-calendar-panel" title={monthTitle} action={<div className="v7-inline-actions"><Button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>←</Button><Button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>→</Button></div>}>
        {!events ? <Skeleton lines={9} /> : <>
          <div className="v7-calendar-weekdays">{(locale === 'ar' ? ['الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت','الأحد'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']).map(x => <span key={x}>{x}</span>)}</div>
          <div className="v7-calendar-grid">{days.map(day => {
            const dayEvents = events.filter(event => sameDay(event.start_at, day));
            const inMonth = day.getMonth() === cursor.getMonth();
            const isToday = sameDay(today.toISOString(), day);
            return <article key={day.toISOString()} className={`${inMonth ? '' : 'is-outside'} ${isToday ? 'is-today' : ''}`}>
              <header><strong>{day.getDate()}</strong>{isToday ? <small>{locale === 'ar' ? 'اليوم' : 'Today'}</small> : null}</header>
              <div>{dayEvents.slice(0, 4).map(event => <button type="button" key={`${event.kind}-${event.id || event.title}-${event.start_at}`} className={`is-${event.kind}`} title={event.title} onClick={() => setSelectedEvent(event)}><i />{event.title}</button>)}{dayEvents.length > 4 ? <small>+{dayEvents.length - 4}</small> : null}</div>
            </article>;
          })}</div>
        </>}
      </Panel>
      <div className="v7-calendar-side">
        <Panel title={locale === 'ar' ? 'أقرب الأحداث' : 'Upcoming events'} description={locale === 'ar' ? 'أولويات الوقت القادمة من محرك العمل.' : 'Time-bound priorities from the work engine.'}>
          {!events ? <Skeleton lines={6} /> : events.length ? <div className="v7-calendar-agenda">{[...events].filter(x => new Date(x.start_at) >= new Date(today.toDateString())).sort((a,b) => new Date(a.start_at)-new Date(b.start_at)).slice(0, 10).map(event => <article key={`${event.kind}-${event.id || event.title}-${event.start_at}`}><button type="button" className="v7-calendar-agenda-link" onClick={() => setSelectedEvent(event)}><span className={`is-${event.kind}`}><Icon name={event.kind === 'task' ? 'check' : event.kind === 'milestone' ? 'trend' : 'clock'} size={15} /></span><div><strong>{event.title}</strong><small>{kindLabel(locale, event.kind)} · {formatDate(event.start_at, locale)}</small></div>{event.status ? <Badge tone={statusTone(event.status)}>{event.status}</Badge> : null}</button></article>)}</div> : <EmptyState icon="clock" title={locale === 'ar' ? 'لا توجد أحداث قادمة' : 'No upcoming events'} />}
        </Panel>
        {canViewCapacity ? <Panel title={locale === 'ar' ? 'قدرة الفريق · 14 يوم' : 'Team capacity · 14 days'} description={locale === 'ar' ? 'أعلى نسب الإشغال حتى لا يتم تحميل الفريق فوق طاقته.' : 'Highest utilization first to prevent over-allocation.'}>
          {!capacity ? <Skeleton lines={6} /> : capacitySummary.length ? <div className="v7-capacity-mini">{capacitySummary.map(member => <article key={member.user_id}><div><strong>{member.name}</strong><small>{member.job_title || member.department || (locale === 'ar' ? 'عضو فريق' : 'Team member')}</small></div><span><b>{member.utilization}%</b><i><em style={{ width: `${Math.min(100, member.utilization)}%` }} /></i></span></article>)}</div> : <EmptyState icon="users" title={locale === 'ar' ? 'لا توجد بيانات قدرة متاحة' : 'No capacity data available'} />}
        </Panel> : null}
      </div>
    </div>
    <CalendarScheduleSheet event={selectedEvent} locale={locale} router={router} onClose={() => setSelectedEvent(null)} onSaved={() => setReload(x => x + 1)} />
  </>;
}
