'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { tx } from '../lib/i18n';
import Icon from '../components/Icon';
import { Badge, Button, EmptyState, PageHeader, Panel, Skeleton } from '../components/Primitives';

const routeFor = (route) => ({ team:'/v7/people', projects:'/v7/projects', roles:'/v7/roles', organization:'/v7/organization', settings:'/v7/settings', activity:'/v7/activity' })[route] || '/v7/control';
const defaultHighRisk = ['company.manage','members.manage','roles.manage','roles.delete','compensation.manage','files.manage','tasks.manage','drawings.publish'];

export default function ControlPage({ workspace, locale }) {
  const [data, setData] = useState(null);
  const [policy, setPolicy] = useState({ require_second_approval_high_risk:false, require_second_approval_offboarding:false, high_risk_permissions:defaultHighRisk });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [reload, setReload] = useState(0);
  const router = useRouter();
  const ar = locale === 'ar';

  useEffect(() => {
    const c = new AbortController();
    const f = `eq.${workspace.company.id}`;
    Promise.all([
      api.select('roles', { filters:{ company_id:f }, order:'sort_order.asc', cacheTtlMs:30_000, signal:c.signal }),
      api.rpc('organization_health_snapshot', { p_company_id:workspace.company.id }, { cacheTtlMs:20_000, signal:c.signal, dedupe:true, metricLabel:'v7.organization.health' }),
      api.select('access_governance_settings', { filters:{ company_id:f }, limit:1, cacheTtlMs:8_000, signal:c.signal }).catch(() => []),
      api.select('access_change_requests', { filters:{ company_id:f, status:'eq.pending' }, order:'requested_at.desc', limit:100, cacheTtlMs:4_000, signal:c.signal }).catch(() => []),
      api.select('offboarding_plans', { filters:{ company_id:f, status:'in.(ready,pending_approval)' }, order:'created_at.desc', limit:100, cacheTtlMs:4_000, signal:c.signal }).catch(() => []),
      api.select('permissions', { order:'module.asc,key.asc', cacheTtlMs:60_000, signal:c.signal }).catch(() => []),
      api.rpc('member_directory_query', { p_company_id:workspace.company.id, p_query:null, p_status:null, p_role_id:null, p_limit:100, p_offset:0 }, { cacheTtlMs:10_000, signal:c.signal, dedupe:true }).catch(() => ({items:[]}))
    ]).then(([roles, health, governanceRows, requests, plans, permissions, memberDirectory]) => {
      const governance = governanceRows[0] || {};
      setPolicy({
        require_second_approval_high_risk:Boolean(governance.require_second_approval_high_risk),
        require_second_approval_offboarding:Boolean(governance.require_second_approval_offboarding),
        high_risk_permissions:Array.isArray(governance.high_risk_permissions) && governance.high_risk_permissions.length ? governance.high_risk_permissions : defaultHighRisk
      });
      setData({ roles, health:health || {}, requests, plans, permissions, members:memberDirectory?.items || [] });
    }).catch(err => { if (err?.name !== 'AbortError') setError(err.message || 'Could not load governance health.'); });
    return () => c.abort();
  }, [workspace.company.id, reload]);

  const roles = data?.roles || [];
  const health = data?.health || {};
  const metrics = health.metrics || {};
  const issues = Array.isArray(health.issues) ? health.issues : [];
  const steps = Array.isArray(health.steps) ? health.steps : [];
  const requests = data?.requests || [];
  const plans = data?.plans || [];
  const currentRole = roles.find(role => role.id === workspace.membership?.role_id);
  const isOwner = currentRole?.slug === 'owner';
  const memberById = useMemo(() => new Map((data?.members || []).map(row => [row.membership_id, row])), [data?.members]);
  const permissionGroups = useMemo(() => {
    const map = new Map();
    for (const permission of data?.permissions || []) {
      if (!['company','members','roles','compensation','files','tasks','drawings'].includes(permission.module)) continue;
      if (!map.has(permission.module)) map.set(permission.module, []);
      map.get(permission.module).push(permission);
    }
    return [...map.entries()];
  }, [data?.permissions]);

  const refresh = () => { api.clearReadCache(); setReload(x => x + 1); };
  const savePolicy = async () => {
    setBusy('policy'); setError('');
    try {
      await api.rpc('save_access_governance_settings', { p_company_id:workspace.company.id, p_payload:policy });
      refresh();
    } catch (err) { setError(err.message || (ar ? 'تعذر حفظ سياسة الحوكمة.' : 'Could not save governance policy.')); }
    finally { setBusy(''); }
  };
  const toggleRisk = key => setPolicy(x => ({ ...x, high_risk_permissions:x.high_risk_permissions.includes(key) ? x.high_risk_permissions.filter(value => value !== key) : [...x.high_risk_permissions,key] }));

  const reviewRequest = async (request, decision) => {
    if (busy || request.requested_by === workspace.user.id) return;
    setBusy(`request:${request.id}`); setError('');
    try {
      await api.rpc('review_access_change_request', { p_request_id:request.id, p_decision:decision, p_note:null });
      refresh();
    } catch (err) { setError(err.message || (ar ? 'تعذر مراجعة الطلب.' : 'Could not review access request.')); }
    finally { setBusy(''); }
  };

  const executePlan = async plan => {
    if (busy || plan.status !== 'ready') return;
    const member = memberById.get(plan.membership_id);
    const ok = typeof window !== 'undefined' && window.confirm(ar ? `تنفيذ مغادرة ${member?.full_name || 'العضو'} الآن؟ سيتم إغلاق الوصول ونقل المسؤوليات وفق الخطة.` : `Execute offboarding for ${member?.full_name || 'this member'} now? Access will close and responsibilities will transfer according to the plan.`);
    if (!ok) return;
    setBusy(`plan:${plan.id}`); setError('');
    try { await api.rpc('execute_member_offboarding', { p_plan_id:plan.id }); refresh(); }
    catch (err) { setError(err.message || (ar ? 'تعذر تنفيذ خطة المغادرة.' : 'Could not execute offboarding plan.')); }
    finally { setBusy(''); }
  };

  return <>
    <PageHeader eyebrow={ar ? 'الحوكمة والتحكم' : 'GOVERNANCE · CONTROL'} title={ar ? 'مركز التحكم والحوكمة' : 'Control & governance'} description={ar ? 'صحة المؤسسة، سياسات الموافقة، طلبات الوصول عالية المخاطر وخطط المغادرة في مركز تحكم واحد.' : 'Organization health, approval policies, high-risk access requests and offboarding plans in one control center.'} />
    <section className="v7-governance-hero"><div className="v7-governance-score"><span className="v7-eyebrow">GOVERNANCE HEALTH</span><strong>{data ? `${health.score ?? 0}%` : '—'}</strong><div className="v7-progress"><i style={{ width:`${Math.max(0, Math.min(100, Number(health.score || 0)))}%` }} /></div><small>{ar ? 'مؤشر جاهزية مبني على الهوية، الفريق، الهيكل، الأدوار وسياسات الوصول.' : 'Readiness score across identity, team, structure, roles and access governance.'}</small></div><div className="v7-governance-metrics"><span><small>{ar ? 'أعضاء نشطون' : 'Active members'}</small><strong>{data ? (metrics.active_members ?? 0) : '—'}</strong></span><span><small>{ar ? 'طلبات معلقة' : 'Pending approvals'}</small><strong>{data ? requests.length : '—'}</strong></span><span className={issues.length ? 'is-danger' : ''}><small>{ar ? 'فجوات' : 'Attention'}</small><strong>{data ? issues.length : '—'}</strong></span><span><small>{ar ? 'خطط مغادرة' : 'Offboarding plans'}</small><strong>{data ? plans.length : '—'}</strong></span></div></section>
    {error ? <div className="v7-inline-error">{error}</div> : null}

    <div className="v7-two-column">
      <Panel title={ar ? 'جاهزية المؤسسة' : 'Organization readiness'} description={ar ? 'خطوات الإعداد الأساسية وحالتها الحالية.' : 'Core setup steps and their current state.'}>
        {!data ? <Skeleton lines={7} /> : <div className="v7-governance-steps">{steps.map(step => <button key={step.key} onClick={() => router.push(routeFor(step.route))}><span className={step.done ? 'is-done' : 'is-pending'}><Icon name={step.done ? 'check' : 'clock'} size={15} /></span><div><strong>{ar ? step.label_ar : step.label_en}</strong><small>{step.done ? (ar ? 'مكتمل' : 'Complete') : (ar ? 'يحتاج إعداد' : 'Needs setup')}</small></div><Icon name="chevron" size={14} /></button>)}</div>}
      </Panel>
      <Panel title={ar ? 'يحتاج انتباهك' : 'Needs attention'} description={ar ? 'مشاكل تشغيلية فعلية، وليست مجرد مؤشرات.' : 'Operational gaps, not decorative indicators.'}>
        {!data ? <Skeleton lines={6} /> : issues.length ? <div className="v7-governance-issues">{issues.map(issue => <button key={issue.code} onClick={() => router.push(routeFor(issue.route))}><span><Icon name="alert" size={15} /></span><div><strong>{ar ? issue.title_ar : issue.title_en}</strong><small>{ar ? issue.detail_ar : issue.detail_en}</small></div><Badge tone={issue.severity === 'critical' || issue.severity === 'danger' ? 'danger' : 'warning'}>{issue.count ?? issue.severity}</Badge></button>)}</div> : <EmptyState icon="check" title={ar ? 'لا توجد فجوات حالية' : 'No current governance gaps'} />}
      </Panel>
    </div>

    <Panel className="v7-governance-policy" title={ar ? 'سياسة الموافقات عالية المخاطر' : 'High-risk approval policy'} description={ar ? 'حدد متى يحتاج التغيير الحساس إلى مالك ثانٍ، وما الصلاحيات التي تعتبر عالية المخاطر.' : 'Define when sensitive changes need a second owner and which permissions are treated as high risk.'} action={isOwner ? <Button icon="save" variant="primary" disabled={busy === 'policy' || policy.high_risk_permissions.length === 0} onClick={savePolicy}>{busy === 'policy' ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ السياسة' : 'Save policy')}</Button> : null}>
      {!data ? <Skeleton lines={8} /> : <><div className="v7-governance-toggles"><label className={policy.require_second_approval_high_risk ? 'is-on' : ''}><input type="checkbox" checked={policy.require_second_approval_high_risk} disabled={!isOwner} onChange={e => setPolicy(x => ({...x,require_second_approval_high_risk:e.target.checked}))} /><span><Icon name="shield" size={16} /><div><strong>{ar ? 'موافقة ثانية للتغييرات عالية المخاطر' : 'Second approval for high-risk changes'}</strong><small>{ar ? 'ينطبق على التغييرات التي تمنح أو تنشر صلاحيات حساسة.' : 'Applies to sensitive access grants and publications.'}</small></div></span></label><label className={policy.require_second_approval_offboarding ? 'is-on' : ''}><input type="checkbox" checked={policy.require_second_approval_offboarding} disabled={!isOwner} onChange={e => setPolicy(x => ({...x,require_second_approval_offboarding:e.target.checked}))} /><span><Icon name="logout" size={16} /><div><strong>{ar ? 'موافقة ثانية قبل مغادرة عضو' : 'Second approval before offboarding'}</strong><small>{ar ? 'تظل صلاحيات العضو مفتوحة حتى يعتمد مالك آخر خطة التسليم.' : 'Member access remains active until another owner approves the handover plan.'}</small></div></span></label></div><div className="v7-risk-permission-groups">{permissionGroups.map(([module, rows]) => <section key={module}><h3>{module}</h3><div>{rows.map(permission => <label key={permission.key} className={policy.high_risk_permissions.includes(permission.key) ? 'is-selected' : ''}><input type="checkbox" disabled={!isOwner} checked={policy.high_risk_permissions.includes(permission.key)} onChange={() => toggleRisk(permission.key)} /><span><strong>{permission.key}</strong><small>{ar ? permission.description_ar : permission.description_en}</small></span></label>)}</div></section>)}</div>{!isOwner ? <div className="v7-settings-note"><Icon name="lock" size={16} /><span>{ar ? 'عرض فقط: تعديل سياسة الحوكمة محصور بمالك الشركة.' : 'Read only: governance policy changes are restricted to the company owner.'}</span></div> : null}</>}
    </Panel>

    <div className="v7-two-column">
      <Panel title={ar ? 'طلبات الموافقة المعلقة' : 'Pending approval requests'} description={ar ? 'مراجعة مستقلة قبل تطبيق التغييرات الحساسة.' : 'Independent review before sensitive changes are applied.'}>
        {!data ? <Skeleton lines={6} /> : requests.length ? <div className="v7-approval-list">{requests.map(request => { const own = request.requested_by === workspace.user.id; return <article key={request.id}><span><Icon name={request.request_type === 'offboarding' ? 'logout' : 'shield'} size={16} /></span><div><strong>{request.request_type}</strong><small>{request.entity_type} · {new Date(request.requested_at).toLocaleString(ar ? 'ar-EG' : 'en-GB')}</small>{own ? <em>{ar ? 'يجب أن يراجعه مالك آخر.' : 'Another owner must review this request.'}</em> : null}</div><div className="v7-inline-actions"><Button disabled={!isOwner || own || Boolean(busy)} onClick={() => reviewRequest(request,'reject')}>{ar ? 'رفض' : 'Reject'}</Button><Button variant="primary" disabled={!isOwner || own || Boolean(busy)} onClick={() => reviewRequest(request,'approve')}>{ar ? 'موافقة' : 'Approve'}</Button></div></article>; })}</div> : <EmptyState icon="shield" title={ar ? 'لا توجد طلبات موافقة معلقة' : 'No pending approval requests'} />}
      </Panel>
      <Panel title={ar ? 'خطط المغادرة النشطة' : 'Active offboarding plans'} description={ar ? 'الأثر، المستلم البديل، وحالة تنفيذ كل خطة.' : 'Impact, transfer target and execution state for each active plan.'}>
        {!data ? <Skeleton lines={6} /> : plans.length ? <div className="v7-offboarding-queue">{plans.map(plan => { const member = memberById.get(plan.membership_id); const target = memberById.get(plan.transfer_to_membership_id); return <article key={plan.id}><div><span><Icon name="logout" size={15} /></span><div><strong>{member?.full_name || member?.email || plan.membership_id}</strong><small>{ar ? 'التسليم إلى' : 'Handover to'}: {target?.full_name || target?.email || plan.transfer_to_membership_id}</small></div></div><Badge tone={plan.status === 'ready' ? 'warning' : 'neutral'}>{plan.status}</Badge>{plan.status === 'ready' && isOwner ? <Button variant="danger" disabled={Boolean(busy)} onClick={() => executePlan(plan)}>{ar ? 'تنفيذ' : 'Execute'}</Button> : null}</article>; })}</div> : <EmptyState icon="users" title={ar ? 'لا توجد خطط مغادرة نشطة' : 'No active offboarding plans'} />}
      </Panel>
    </div>

    <Panel title={ar ? 'الأدوار في مساحة العمل' : 'Roles in this workspace'} description={ar ? 'الأدوار المحمية والقابلة للتخصيص مع عقد الصلاحيات والنطاقات.' : 'Protected and customizable roles with explicit permission and scope contracts.'}>
      {!data ? <Skeleton lines={6} /> : roles.length ? <div className="v7-role-grid">{roles.map(role => <article key={role.id}><span className="v7-role-color" style={{ '--role-color':role.color || '#6d5dfc' }} /><div><strong>{ar ? role.name_ar : role.name_en}</strong><small>{(ar ? role.description_ar : role.description_en) || role.slug}</small><code>{role.slug}</code></div><Badge tone={role.is_protected ? 'neutral' : 'success'}>{role.is_protected ? (ar ? 'محمي' : 'Protected') : (ar ? 'قابل للتخصيص' : 'Customizable')}</Badge></article>)}</div> : <EmptyState icon="shield" title={tx(locale,'noData')} />}
    </Panel>
  </>;
}
