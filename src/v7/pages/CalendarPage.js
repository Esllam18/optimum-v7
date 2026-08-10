'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { can } from '../lib/workspace';
import { formatDate, normalizeArray, statusTone } from '../lib/format';
import Icon from '../components/Icon';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Panel, Skeleton, Stat } from '../components/Primitives';

const monthStart = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const monthEnd = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 1);
const isoDate = (date) => date.toISOString().slice(0, 10);
const sameDay = (value, date) => value && new Date(value).toDateString() === date.toDateString();
const kindLabel = (locale, kind) => ({
  ar: { task: 'مهمة', milestone: 'معلم تسليم', leave: 'إجازة', holiday: 'عطلة' },
  en: { task: 'Task', milestone: 'Milestone', leave: 'Leave', holiday: 'Holiday' }
})[locale]?.[kind] || kind;

export default function CalendarPage({ workspace, locale }) {
  const [cursor, setCursor] = useState(() => monthStart(new Date()));
  const [events, setEvents] = useState(null);
  const [capacity, setCapacity] = useState(null);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
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
              <div>{dayEvents.slice(0, 4).map(event => <span key={`${event.kind}-${event.id || event.title}-${event.start_at}`} className={`is-${event.kind}`} title={event.title}><i />{event.title}</span>)}{dayEvents.length > 4 ? <small>+{dayEvents.length - 4}</small> : null}</div>
            </article>;
          })}</div>
        </>}
      </Panel>
      <div className="v7-calendar-side">
        <Panel title={locale === 'ar' ? 'أقرب الأحداث' : 'Upcoming events'} description={locale === 'ar' ? 'أولويات الوقت القادمة من محرك العمل.' : 'Time-bound priorities from the work engine.'}>
          {!events ? <Skeleton lines={6} /> : events.length ? <div className="v7-calendar-agenda">{[...events].filter(x => new Date(x.start_at) >= new Date(today.toDateString())).sort((a,b) => new Date(a.start_at)-new Date(b.start_at)).slice(0, 10).map(event => <article key={`${event.kind}-${event.id || event.title}-${event.start_at}`}><span className={`is-${event.kind}`}><Icon name={event.kind === 'task' ? 'check' : event.kind === 'milestone' ? 'trend' : 'clock'} size={15} /></span><div><strong>{event.title}</strong><small>{kindLabel(locale, event.kind)} · {formatDate(event.start_at, locale)}</small></div>{event.status ? <Badge tone={statusTone(event.status)}>{event.status}</Badge> : null}</article>)}</div> : <EmptyState icon="clock" title={locale === 'ar' ? 'لا توجد أحداث قادمة' : 'No upcoming events'} />}
        </Panel>
        {canViewCapacity ? <Panel title={locale === 'ar' ? 'قدرة الفريق · 14 يوم' : 'Team capacity · 14 days'} description={locale === 'ar' ? 'أعلى نسب الإشغال حتى لا يتم تحميل الفريق فوق طاقته.' : 'Highest utilization first to prevent over-allocation.'}>
          {!capacity ? <Skeleton lines={6} /> : capacitySummary.length ? <div className="v7-capacity-mini">{capacitySummary.map(member => <article key={member.user_id}><div><strong>{member.name}</strong><small>{member.job_title || member.department || (locale === 'ar' ? 'عضو فريق' : 'Team member')}</small></div><span><b>{member.utilization}%</b><i><em style={{ width: `${Math.min(100, member.utilization)}%` }} /></i></span></article>)}</div> : <EmptyState icon="users" title={locale === 'ar' ? 'لا توجد بيانات قدرة متاحة' : 'No capacity data available'} />}
        </Panel> : null}
      </div>
    </div>
  </>;
}
