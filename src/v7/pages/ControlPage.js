'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { tx } from '../lib/i18n';
import Icon from '../components/Icon';
import { Badge, EmptyState, PageHeader, Panel, Skeleton, Stat } from '../components/Primitives';

const routeFor = (route) => ({ team:'/v7/people', projects:'/v7/projects', roles:'/v7/roles', organization:'/v7/organization', settings:'/v7/settings', activity:'/v7/activity' })[route] || '/v7/control';

export default function ControlPage({ workspace, locale }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const router = useRouter();
  useEffect(() => {
    const c = new AbortController();
    const f = `eq.${workspace.company.id}`;
    Promise.all([
      api.select('roles', { filters: { company_id: f }, order: 'sort_order.asc', cacheTtlMs: 30_000, signal: c.signal }),
      api.rpc('organization_health_snapshot', { p_company_id: workspace.company.id }, { cacheTtlMs: 20_000, signal: c.signal, dedupe: true, metricLabel: 'v7.organization.health' })
    ]).then(([roles, health]) => setData({ roles, health: health || {} })).catch(err => { if (err?.name !== 'AbortError') setError(err.message || 'Could not load governance health.'); });
    return () => c.abort();
  }, [workspace.company.id]);

  const roles = data?.roles || [];
  const health = data?.health || {};
  const metrics = health.metrics || {};
  const issues = Array.isArray(health.issues) ? health.issues : [];
  const steps = Array.isArray(health.steps) ? health.steps : [];
  return <>
    <PageHeader eyebrow="GOVERNANCE · ORGANIZATION" title={locale === 'ar' ? 'مركز التحكم والحوكمة' : 'Control & governance'} description={locale === 'ar' ? 'صحة المؤسسة، فجوات الإعداد، والأدوار في مكان واحد. كل تنبيه هنا مرتبط بإجراء تشغيلي واضح.' : 'Organization health, setup gaps, and roles in one place. Every issue maps to a clear operational action.'} />
    <section className="v7-governance-hero"><div className="v7-governance-score"><span className="v7-eyebrow">GOVERNANCE HEALTH</span><strong>{data ? `${health.score ?? 0}%` : '—'}</strong><div className="v7-progress"><i style={{ width: `${Math.max(0, Math.min(100, Number(health.score || 0)))}%` }} /></div><small>{locale === 'ar' ? 'مؤشر جاهزية مبني على هوية الشركة، الفريق، الهيكل، الأدوار والحوكمة.' : 'Readiness score across company identity, team, structure, roles and governance.'}</small></div><div className="v7-governance-metrics"><span><small>{locale === 'ar' ? 'أعضاء نشطون' : 'Active members'}</small><strong>{data ? (metrics.active_members ?? 0) : '—'}</strong></span><span><small>{locale === 'ar' ? 'الأدوار' : 'Roles'}</small><strong>{data ? (metrics.roles ?? roles.length) : '—'}</strong></span><span className={issues.length ? 'is-danger' : ''}><small>{locale === 'ar' ? 'فجوات' : 'Attention'}</small><strong>{data ? issues.length : '—'}</strong></span><span><small>{locale === 'ar' ? 'مشاريع' : 'Projects'}</small><strong>{data ? (metrics.projects ?? '—') : '—'}</strong></span></div></section>
    {error ? <div className="v7-inline-error">{error}</div> : null}
    <div className="v7-two-column">
      <Panel title={locale === 'ar' ? 'جاهزية المؤسسة' : 'Organization readiness'} description={locale === 'ar' ? 'خطوات الإعداد الأساسية وحالتها الحالية.' : 'Core setup steps and their current state.'}>
        {!data ? <Skeleton lines={7} /> : <div className="v7-governance-steps">{steps.map(step => <button key={step.key} onClick={() => router.push(routeFor(step.route))}><span className={step.done ? 'is-done' : 'is-pending'}><Icon name={step.done ? 'check' : 'clock'} size={15} /></span><div><strong>{locale === 'ar' ? step.label_ar : step.label_en}</strong><small>{step.done ? (locale === 'ar' ? 'مكتمل' : 'Complete') : (locale === 'ar' ? 'يحتاج إعداد' : 'Needs setup')}</small></div><Icon name="chevron" size={14} /></button>)}</div>}
      </Panel>
      <Panel title={locale === 'ar' ? 'يحتاج انتباهك' : 'Needs attention'} description={locale === 'ar' ? 'مشاكل تشغيلية فعلية، وليست مجرد مؤشرات.' : 'Operational gaps, not decorative indicators.'}>
        {!data ? <Skeleton lines={6} /> : issues.length ? <div className="v7-governance-issues">{issues.map(issue => <button key={issue.code} onClick={() => router.push(routeFor(issue.route))}><span><Icon name="alert" size={15} /></span><div><strong>{locale === 'ar' ? issue.title_ar : issue.title_en}</strong><small>{locale === 'ar' ? issue.detail_ar : issue.detail_en}</small></div><Badge tone={issue.severity === 'critical' ? 'danger' : 'warning'}>{issue.count ?? issue.severity}</Badge></button>)}</div> : <EmptyState icon="check" title={locale === 'ar' ? 'لا توجد فجوات حالية' : 'No current governance gaps'} />}
      </Panel>
    </div>
    <Panel title={locale === 'ar' ? 'الأدوار في مساحة العمل' : 'Roles in this workspace'} description={locale === 'ar' ? 'الأدوار المحمية والقابلة للتخصيص. V7 تعرض القوالب والنطاقات والاستثناءات بدون إخفاء عقد الصلاحيات.' : 'Protected and customizable roles. V7 exposes templates, scopes and overrides without hiding the permission contract.'}>
      {!data ? <Skeleton lines={6} /> : roles.length ? <div className="v7-role-grid">{roles.map(role => <article key={role.id}><span className="v7-role-color" style={{ '--role-color': role.color || '#6d5dfc' }} /><div><strong>{locale === 'ar' ? role.name_ar : role.name_en}</strong><small>{(locale === 'ar' ? role.description_ar : role.description_en) || role.slug}</small><code>{role.slug}</code></div><Badge tone={role.is_protected ? 'neutral' : 'success'}>{role.is_protected ? (locale === 'ar' ? 'محمي' : 'Protected') : (locale === 'ar' ? 'قابل للتخصيص' : 'Customizable')}</Badge></article>)}</div> : <EmptyState icon="shield" title={tx(locale, 'noData')} />}
    </Panel>
  </>;
}
