'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import Icon from './Icon';
import { Badge, Button, EmptyState, Skeleton } from './Primitives';

const impactLabels = {
  open_task_assignments:['تكليفات مهام مفتوحة','Open task assignments'],
  claimed_tasks:['مهام مستلمة','Claimed tasks'],
  folders:['مجلدات بالعهدة','Folders'],
  documents:['مستندات بالعهدة','Documents'],
  drawings:['رسومات بالعهدة','Drawings']
};

export default function MemberOffboardingPanel({ workspace, membershipId, member, members = [], locale, onChanged }) {
  const [transferTo, setTransferTo] = useState('');
  const [options, setOptions] = useState({ tasks:true, custody:true });
  const [plan, setPlan] = useState(null);
  const [impact, setImpact] = useState(null);
  const [busy, setBusy] = useState('');
  const [executed, setExecuted] = useState(false);
  const [error, setError] = useState('');
  const ar = locale === 'ar';

  const targets = useMemo(() => members.filter(row => row.membership_id !== membershipId && row.status === 'active'), [members, membershipId]);

  const loadPlan = async () => {
    if (!membershipId) return;
    const rows = await api.select('offboarding_plans', {
      filters:{ membership_id:`eq.${membershipId}`, status:'in.(ready,pending_approval)' },
      order:'created_at.desc', limit:1, cacheTtlMs:2_000
    }).catch(() => []);
    const current = rows[0] || null;
    setPlan(current);
    setImpact(current?.impact || null);
    if (current?.transfer_to_membership_id) setTransferTo(current.transfer_to_membership_id);
  };

  useEffect(() => { loadPlan(); }, [membershipId]);

  const prepare = async () => {
    if (!transferTo || busy) return;
    setBusy('prepare'); setError('');
    try {
      const result = await api.rpc('prepare_member_offboarding', {
        p_membership_id:membershipId,
        p_transfer_to_membership_id:transferTo,
        p_options:{ tasks:Boolean(options.tasks), custody:Boolean(options.custody) }
      });
      setPlan(result?.plan || null); setImpact(result?.impact || null);
      api.clearReadCache(); await onChanged?.();
    } catch (err) { setError(err.message || (ar ? 'تعذر إعداد خطة المغادرة.' : 'Could not prepare offboarding plan.')); }
    finally { setBusy(''); }
  };

  const execute = async () => {
    if (!plan?.id || plan.status !== 'ready' || busy) return;
    const ok = typeof window === 'undefined' ? false : window.confirm(ar ? 'تنفيذ خطة المغادرة سيغلق وصول العضو وينقل المهام والعهدة حسب الاختيارات. هل تريد المتابعة؟' : 'Executing this plan closes member access and transfers work/custody according to the selected options. Continue?');
    if (!ok) return;
    setBusy('execute'); setError('');
    try {
      await api.rpc('execute_member_offboarding', { p_plan_id:plan.id });
      setPlan(null); setImpact(null); setExecuted(true); api.clearReadCache(); await onChanged?.();
    } catch (err) { setError(err.message || (ar ? 'تعذر تنفيذ خطة المغادرة.' : 'Could not execute offboarding plan.')); }
    finally { setBusy(''); }
  };

  const status = executed ? 'left' : (plan?.status || member?.lifecycle_stage || member?.status || 'active');
  return <section className="v7-detail-section v7-offboarding-panel">
    <div className="v7-offboarding-head"><div><h3><Icon name="logout" size={15} /> {ar ? 'خطة التسليم والمغادرة' : 'Offboarding & handover'}</h3><p>{ar ? 'لا يتم إغلاق الحساب مباشرة؛ احسب الأثر أولًا وانقل المهام والعهدة لعضو نشط.' : 'Access is not closed immediately. Calculate impact first and transfer work and custody to an active member.'}</p></div><Badge tone={status === 'ready' ? 'warning' : status === 'pending_approval' ? 'neutral' : member?.status === 'left' ? 'danger' : 'success'}>{status}</Badge></div>
    {member?.status === 'left' || executed ? <EmptyState icon="check" title={ar ? 'تم إنهاء عضوية هذا المستخدم' : 'This member has already left'} /> : <>
      {!plan ? <div className="v7-offboarding-form"><label><span>{ar ? 'نقل المسؤوليات إلى' : 'Transfer responsibility to'}</span><select value={transferTo} onChange={e => setTransferTo(e.target.value)}><option value="">{ar ? 'اختر عضوًا نشطًا' : 'Choose an active member'}</option>{targets.map(row => <option key={row.membership_id} value={row.membership_id}>{row.full_name || row.email || row.membership_id}</option>)}</select></label><div className="v7-choice-grid v7-choice-grid--toggles v7-offboarding-options"><label className={options.tasks ? 'is-selected' : ''}><input type="checkbox" checked={options.tasks} onChange={e => setOptions(x => ({...x,tasks:e.target.checked}))} /><Icon name="check" size={14} /><span>{ar ? 'نقل المهام المفتوحة' : 'Transfer open work'}</span></label><label className={options.custody ? 'is-selected' : ''}><input type="checkbox" checked={options.custody} onChange={e => setOptions(x => ({...x,custody:e.target.checked}))} /><Icon name="folder" size={14} /><span>{ar ? 'نقل عهدة الملفات والرسومات' : 'Transfer file & drawing custody'}</span></label></div><Button type="button" variant="danger" icon="logout" disabled={!transferTo || Boolean(busy)} onClick={prepare}>{busy === 'prepare' ? (ar ? 'جارٍ حساب الأثر…' : 'Calculating impact…') : (ar ? 'إعداد خطة المغادرة' : 'Prepare offboarding plan')}</Button></div> : <>
        <div className="v7-impact-grid">{impact ? Object.entries(impact).map(([key,value]) => <article key={key}><small>{impactLabels[key]?.[ar ? 0 : 1] || key}</small><strong>{Number(value || 0)}</strong></article>) : <Skeleton lines={5} />}</div>
        {plan.status === 'pending_approval' ? <div className="v7-governance-notice"><Icon name="shield" size={17} /><div><strong>{ar ? 'الخطة تنتظر موافقة ثانية' : 'Plan awaiting second approval'}</strong><p>{ar ? 'لم يتم إغلاق الوصول أو نقل أي شيء. يجب على مالك آخر مراجعة الطلب من مركز التحكم والحوكمة.' : 'Access remains active and nothing has moved. Another owner must review this request in Control & governance.'}</p></div></div> : null}
        {plan.status === 'ready' ? <div className="v7-offboarding-ready"><div><strong>{ar ? 'الخطة جاهزة للتنفيذ' : 'Plan ready to execute'}</strong><small>{ar ? 'راجع الأثر أعلاه قبل الإنهاء النهائي.' : 'Review the impact above before final execution.'}</small></div><Button type="button" variant="danger" icon="logout" disabled={Boolean(busy)} onClick={execute}>{busy === 'execute' ? (ar ? 'جارٍ التنفيذ…' : 'Executing…') : (ar ? 'تنفيذ المغادرة الآن' : 'Execute offboarding')}</Button></div> : null}
      </>}
    </>}
    {error ? <div className="v7-form-error">{error}</div> : null}
  </section>;
}
