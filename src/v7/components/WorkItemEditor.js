'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { normalizeArray } from '../lib/format';
import SideSheet from './SideSheet';
import Icon from './Icon';
import { Badge, Button, EmptyState, Skeleton } from './Primitives';

const localDateTime = value => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toIso = value => value ? new Date(value).toISOString() : null;
const splitTags = value => String(value || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 24);

const labels = {
  task: { ar: 'مهمة', en: 'Task' },
  review: { ar: 'مراجعة', en: 'Review' },
  approval: { ar: 'اعتماد', en: 'Approval' },
  inspection: { ar: 'تفتيش', en: 'Inspection' },
  issue: { ar: 'مشكلة', en: 'Issue' },
  follow_up: { ar: 'متابعة', en: 'Follow-up' }
};

export default function WorkItemEditor({ open, onClose, data, locale, onSaved }) {
  const task = data?.task || {};
  const capabilities = data?.capabilities || {};
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState(null);
  const [candidateError, setCandidateError] = useState('');

  useEffect(() => {
    if (!open || !task.id) return;
    setError('');
    setCandidateError('');
    setForm({
      title: task.title || '',
      description: task.description || '',
      task_type: task.task_type || 'task',
      priority: task.priority || 'medium',
      start_at: localDateTime(task.start_at),
      due_at: localDateTime(task.due_at),
      sla_due_at: localDateTime(task.sla_due_at),
      estimated_minutes: String(task.estimated_minutes ?? 0),
      actual_minutes: String(task.actual_minutes ?? 0),
      required_skills: normalizeArray(task.required_skills).join(', '),
      labels: normalizeArray(task.labels).join(', '),
      visibility: task.visibility || 'company',
      open_unassigned: Boolean(task.open_unassigned),
      owner_user_id: task.owner_user_id || '',
      reviewer_user_id: task.reviewer_user_id || '',
      approver_user_id: task.approver_user_id || ''
    });
  }, [open, task.id]);

  const context = useMemo(() => form ? {
    project_id: task.project_id || null,
    site_id: task.site_id || null,
    estimated_minutes: Number(form.estimated_minutes || 0),
    required_skills: splitTags(form.required_skills),
    start_at: toIso(form.start_at),
    due_at: toIso(form.due_at)
  } : null, [form?.estimated_minutes, form?.required_skills, form?.start_at, form?.due_at, task.project_id, task.site_id]);

  useEffect(() => {
    if (!open || !task.company_id || !capabilities.assign || !context) { setCandidates([]); return; }
    const c = new AbortController();
    const timer = setTimeout(() => {
      setCandidates(null); setCandidateError('');
      api.rpc('work_assignment_candidates', {
        p_company_id: task.company_id,
        p_context: context
      }, { signal: c.signal, cacheTtlMs: 8_000, dedupe: true })
        .then(rows => setCandidates(normalizeArray(rows)))
        .catch(err => { if (err?.name !== 'AbortError') { setCandidates([]); setCandidateError(err.message || 'Could not score candidates'); } });
    }, 220);
    return () => { clearTimeout(timer); c.abort(); };
  }, [open, task.company_id, capabilities.assign, context]);

  if (!open) return null;
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const participantName = userId => normalizeArray(candidates).find(x => x.user_id === userId)?.full_name || normalizeArray(data?.assignments).find(x => x.user_id === userId)?.name || userId || '—';

  const submit = async event => {
    event.preventDefault();
    if (!form?.title.trim() || saving) return;
    setSaving(true); setError('');
    try {
      await api.rpc('save_work_item', {
        p_payload: {
          id: task.id,
          company_id: task.company_id,
          expected_lock_version: task.lock_version,
          title: form.title.trim(),
          description: form.description.trim() || null,
          task_type: form.task_type,
          priority: form.priority,
          start_at: toIso(form.start_at),
          due_at: toIso(form.due_at),
          sla_due_at: toIso(form.sla_due_at),
          estimated_minutes: Math.max(0, Number(form.estimated_minutes || 0)),
          actual_minutes: Math.max(0, Number(form.actual_minutes || 0)),
          required_skills: splitTags(form.required_skills),
          labels: splitTags(form.labels),
          visibility: form.visibility,
          open_unassigned: form.visibility === 'private' ? false : Boolean(form.open_unassigned),
          owner_user_id: form.visibility === 'private' || form.open_unassigned ? null : (form.owner_user_id || null),
          reviewer_user_id: form.visibility === 'private' ? null : (form.reviewer_user_id || null),
          approver_user_id: form.visibility === 'private' ? null : (form.approver_user_id || null)
        }
      });
      api.clearReadCache('work_');
      await onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message || (locale === 'ar' ? 'تعذر حفظ بيانات العمل.' : 'Could not save the work item.'));
    } finally { setSaving(false); }
  };

  const assignmentRows = normalizeArray(data?.assignments);
  return <SideSheet open={open} onClose={onClose} eyebrow="WORK EDITOR" title={locale === 'ar' ? 'تحرير عنصر العمل' : 'Edit work item'} subtitle={locale === 'ar' ? 'كل تعديل يمر عبر محرك الصلاحيات والنطاق وقفل التعارض.' : 'Every change passes through scope permissions and optimistic conflict protection.'}>
    {!form ? <Skeleton lines={10} /> : <form className="v7-form-stack v7-work-editor" onSubmit={submit}>
      <label><span>{locale === 'ar' ? 'العنوان' : 'Title'}</span><input value={form.title} onChange={e => set('title', e.target.value)} required /></label>
      <label><span>{locale === 'ar' ? 'الوصف' : 'Description'}</span><textarea rows={4} value={form.description} onChange={e => set('description', e.target.value)} /></label>
      <div className="v7-form-grid">
        <label><span>{locale === 'ar' ? 'نوع العمل' : 'Work type'}</span><select value={form.task_type} onChange={e => set('task_type', e.target.value)}>{Object.keys(labels).map(key => <option key={key} value={key}>{labels[key][locale === 'ar' ? 'ar' : 'en']}</option>)}</select></label>
        <label><span>{locale === 'ar' ? 'الأولوية' : 'Priority'}</span><select value={form.priority} onChange={e => set('priority', e.target.value)}><option value="low">{locale === 'ar' ? 'منخفضة' : 'Low'}</option><option value="medium">{locale === 'ar' ? 'متوسطة' : 'Medium'}</option><option value="high">{locale === 'ar' ? 'عالية' : 'High'}</option><option value="urgent">{locale === 'ar' ? 'عاجلة' : 'Urgent'}</option></select></label>
        <label><span>{locale === 'ar' ? 'البداية' : 'Start'}</span><input type="datetime-local" value={form.start_at} onChange={e => set('start_at', e.target.value)} /></label>
        <label><span>{locale === 'ar' ? 'الاستحقاق' : 'Due'}</span><input type="datetime-local" value={form.due_at} onChange={e => set('due_at', e.target.value)} /></label>
        <label><span>{locale === 'ar' ? 'موعد SLA' : 'SLA due'}</span><input type="datetime-local" value={form.sla_due_at} onChange={e => set('sla_due_at', e.target.value)} /></label>
        <label><span>{locale === 'ar' ? 'الجهد المتوقع بالدقائق' : 'Estimated minutes'}</span><input type="number" min="0" max="100000" value={form.estimated_minutes} onChange={e => set('estimated_minutes', e.target.value)} /></label>
        <label><span>{locale === 'ar' ? 'الجهد الفعلي بالدقائق' : 'Actual minutes'}</span><input type="number" min="0" max="100000" value={form.actual_minutes} onChange={e => set('actual_minutes', e.target.value)} /></label>
        <label><span>{locale === 'ar' ? 'الرؤية' : 'Visibility'}</span><select value={form.visibility} onChange={e => set('visibility', e.target.value)}><option value="company">{locale === 'ar' ? 'الشركة' : 'Company'}</option><option value="private">{locale === 'ar' ? 'خاص' : 'Private'}</option></select></label>
      </div>
      <div className="v7-form-grid">
        <label><span>{locale === 'ar' ? 'المهارات المطلوبة · افصل بفاصلة' : 'Required skills · comma separated'}</span><input value={form.required_skills} onChange={e => set('required_skills', e.target.value)} /></label>
        <label><span>{locale === 'ar' ? 'الوسوم · افصل بفاصلة' : 'Labels · comma separated'}</span><input value={form.labels} onChange={e => set('labels', e.target.value)} /></label>
      </div>

      {capabilities.assign && form.visibility !== 'private' ? <div className="v7-detail-section v7-smart-assignment">
        <div className="v7-section-heading"><h3>{locale === 'ar' ? 'الإسناد الذكي' : 'Smart assignment'}</h3><Badge tone="neutral">{normalizeArray(candidates).length}</Badge></div>
        <label className="v7-switch-line"><input type="checkbox" checked={form.open_unassigned} onChange={e => set('open_unassigned', e.target.checked)} /><span><strong>{locale === 'ar' ? 'اتركها مفتوحة للاستلام' : 'Leave open for claiming'}</strong><small>{locale === 'ar' ? 'لا يمكن الجمع بين الاستلام المفتوح ومالك محدد.' : 'Open claiming cannot be combined with a fixed owner.'}</small></span></label>
        {!form.open_unassigned ? <div className="v7-form-grid"><label><span>{locale === 'ar' ? 'المالك' : 'Owner'}</span><select value={form.owner_user_id} onChange={e => set('owner_user_id', e.target.value)}><option value="">{locale === 'ar' ? 'بدون مالك' : 'No owner'}</option>{normalizeArray(candidates).map(row => <option key={row.user_id} value={row.user_id}>{row.full_name} · {row.score}/100 · {Math.round(Number(row.utilization_percent || 0))}%</option>)}</select></label><label><span>{locale === 'ar' ? 'المراجع' : 'Reviewer'}</span><select value={form.reviewer_user_id} onChange={e => set('reviewer_user_id', e.target.value)}><option value="">{locale === 'ar' ? 'بدون مراجع' : 'No reviewer'}</option>{normalizeArray(candidates).map(row => <option key={row.user_id} value={row.user_id}>{row.full_name}</option>)}</select></label><label><span>{locale === 'ar' ? 'المعتمد' : 'Approver'}</span><select value={form.approver_user_id} onChange={e => set('approver_user_id', e.target.value)}><option value="">{locale === 'ar' ? 'بدون معتمد' : 'No approver'}</option>{normalizeArray(candidates).map(row => <option key={row.user_id} value={row.user_id}>{row.full_name}</option>)}</select></label></div> : null}
        {candidateError ? <div className="v7-inline-error">{candidateError}</div> : null}
        {candidates === null ? <Skeleton lines={3} /> : normalizeArray(candidates).length ? <div className="v7-candidate-grid">{normalizeArray(candidates).slice(0, 8).map(row => <button type="button" key={row.user_id} className={form.owner_user_id === row.user_id ? 'is-selected' : ''} disabled={form.open_unassigned} onClick={() => set('owner_user_id', row.user_id)}><span><strong>{row.full_name}</strong><small>{row.job_title || row.experience_level || (locale === 'ar' ? 'عضو فريق' : 'Team member')}</small></span><b>{row.score}/100</b><em>{Math.round(Number(row.utilization_percent || 0))}% {locale === 'ar' ? 'إشغال' : 'util.'}</em><i>{Number(row.skill_match_count || 0)} {locale === 'ar' ? 'مهارة مطابقة' : 'skill matches'}</i></button>)}</div> : <EmptyState icon="users" title={locale === 'ar' ? 'لا يوجد مرشح متاح لهذا النطاق' : 'No candidate is available for this scope'} />}
      </div> : null}

      <div className="v7-detail-section"><h3>{locale === 'ar' ? 'المشاركون الحاليون' : 'Current participants'}</h3><div className="v7-permission-cloud"><Badge tone="neutral">{locale === 'ar' ? 'المالك' : 'Owner'}: {participantName(form.owner_user_id)}</Badge>{form.reviewer_user_id ? <Badge tone="neutral">{locale === 'ar' ? 'المراجع' : 'Reviewer'}: {participantName(form.reviewer_user_id)}</Badge> : null}{form.approver_user_id ? <Badge tone="neutral">{locale === 'ar' ? 'المعتمد' : 'Approver'}: {participantName(form.approver_user_id)}</Badge> : null}{assignmentRows.map(row => <Badge key={row.id} tone="neutral"><Icon name="users" size={12} /> {row.name || (locale === 'ar' ? row.role_name_ar : row.role_name_en) || row.role_name_en || row.role_name_ar || 'Assignment'}</Badge>)}</div></div>
      {error ? <div className="v7-form-error">{error}</div> : null}
      <div className="v7-form-actions"><Button type="button" onClick={onClose}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button><Button type="submit" variant="primary" icon="save" disabled={saving || !form.title.trim()}>{saving ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'حفظ كل التعديلات' : 'Save all changes')}</Button></div>
    </form>}
  </SideSheet>;
}
