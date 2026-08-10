'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { tx } from '../lib/i18n';
import SideSheet from './SideSheet';
import { Button, Skeleton } from './Primitives';

const emptyForm = {
  code: '',
  name: '',
  client_name: '',
  project_type: '',
  status: 'active',
  manager_user_id: '',
  planned_start_date: '',
  target_end_date: '',
  progress_percent: 0,
  description: '',
  blueprint_id: ''
};

const unique = (values) => [...new Set(values.filter(Boolean))];

export default function ProjectCreateSheet({ open, onClose, workspace, locale, onCreated }) {
  const [form, setForm] = useState(emptyForm);
  const [blueprints, setBlueprints] = useState([]);
  const [members, setMembers] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const usage = Number(workspace.policy?.usage?.active_projects || 0);
  const rawLimit = workspace.policy?.limits?.max_projects;
  const limit = rawLimit === null || rawLimit === undefined ? null : Number(rawLimit);
  const atLimit = Number.isFinite(limit) && limit >= 0 && usage >= limit;

  useEffect(() => {
    if (!open) {
      setForm(emptyForm);
      setError('');
      setBlueprints([]);
      setMembers([]);
      return;
    }

    const controller = new AbortController();
    setLoadingOptions(true);
    setError('');
    (async () => {
      try {
        const [blueprintRows, membershipRows] = await Promise.all([
          api.select('project_blueprints', {
            filters: {
              is_active: 'eq.true',
              or: `(company_id.is.null,company_id.eq.${workspace.company.id})`
            },
            order: 'is_default.desc,created_at.asc',
            cacheTtlMs: 60_000,
            signal: controller.signal
          }).catch(() => []),
          api.select('company_memberships', {
            select: 'id,user_id,job_title,status',
            filters: { company_id: `eq.${workspace.company.id}`, status: 'eq.active' },
            order: 'created_at.asc',
            cacheTtlMs: 30_000,
            signal: controller.signal
          }).catch(() => [])
        ]);

        setBlueprints(blueprintRows);
        const profileIds = unique(membershipRows.map(item => item.user_id));
        const profileRows = profileIds.length ? await api.select('profiles', {
          select: 'id,full_name',
          filters: { id: `in.(${profileIds.join(',')})` },
          cacheTtlMs: 30_000,
          signal: controller.signal
        }).catch(() => []) : [];
        const profileMap = new Map(profileRows.map(item => [item.id, item]));
        setMembers(membershipRows.map(item => ({ ...item, full_name: profileMap.get(item.user_id)?.full_name || item.user_id })));

        const defaultBlueprint = blueprintRows.find(item => item.is_default) || blueprintRows[0];
        if (defaultBlueprint) {
          setForm(current => current.blueprint_id ? current : {
            ...current,
            blueprint_id: defaultBlueprint.id,
            project_type: current.project_type || defaultBlueprint.project_type || ''
          });
        }
      } catch (err) {
        if (err?.name !== 'AbortError') setError(err.message || 'Could not load project options');
      } finally {
        if (!controller.signal.aborted) setLoadingOptions(false);
      }
    })();
    return () => controller.abort();
  }, [open, workspace.company.id]);

  const selectedBlueprint = useMemo(() => blueprints.find(item => item.id === form.blueprint_id) || null, [blueprints, form.blueprint_id]);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const chooseBlueprint = (id) => {
    const blueprint = blueprints.find(item => item.id === id);
    setForm(current => ({
      ...current,
      blueprint_id: id,
      project_type: current.project_type || blueprint?.project_type || ''
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving || atLimit) return;
    const code = form.code.trim();
    const name = form.name.trim();
    if (!code || !name) return;
    if (form.planned_start_date && form.target_end_date && form.target_end_date < form.planned_start_date) {
      setError(locale === 'ar' ? 'تاريخ النهاية المستهدف لا يمكن أن يسبق تاريخ البداية.' : 'Target end date cannot be before the planned start date.');
      return;
    }

    setSaving(true); setError('');
    try {
      const created = await api.rpc('save_project', {
        p_payload: {
          id: null,
          company_id: workspace.company.id,
          code,
          name,
          description: form.description.trim() || null,
          status: form.status,
          blueprint_id: form.blueprint_id || null,
          project_type: form.project_type.trim() || null,
          client_name: form.client_name.trim() || null,
          manager_user_id: form.manager_user_id || null,
          planned_start_date: form.planned_start_date || null,
          target_end_date: form.target_end_date || null,
          progress_percent: Number(form.progress_percent || 0)
        }
      });
      api.clearReadCache();
      await onCreated?.(created);
    } catch (err) {
      setError(err.message || (locale === 'ar' ? 'تعذر إنشاء المشروع.' : 'Could not create project.'));
    } finally { setSaving(false); }
  };

  return <SideSheet
    open={open}
    onClose={saving ? undefined : onClose}
    eyebrow="PROJECT SETUP"
    title={tx(locale, 'newProject')}
    subtitle={locale === 'ar' ? 'أنشئ مساحة المشروع مرة واحدة، ثم اربط المواقع والعمل والمستندات والرسومات من نفس السياق.' : 'Create the project workspace once, then connect sites, work, documents and drawings in the same context.'}
  >
    {atLimit ? <div className="v7-form-error">{locale === 'ar' ? `وصلت الشركة إلى حد الباقة الحالي للمشاريع (${usage} / ${limit}).` : `The company has reached its current project limit (${usage} / ${limit}).`}</div> : null}
    {loadingOptions ? <Skeleton lines={3} /> : null}
    <form className="v7-form-stack" onSubmit={submit}>
      <div className="v7-form-grid">
        <label><span>{locale === 'ar' ? 'كود المشروع' : 'Project code'}</span><input value={form.code} onChange={e => set('code', e.target.value)} placeholder="P-001" autoFocus required maxLength={50} /></label>
        <label><span>{locale === 'ar' ? 'اسم المشروع' : 'Project name'}</span><input value={form.name} onChange={e => set('name', e.target.value)} required maxLength={180} /></label>
      </div>

      {blueprints.length ? <div className="v7-blueprint-field"><span>{locale === 'ar' ? 'مخطط مساحة العمل' : 'Workspace blueprint'}</span><div className="v7-blueprint-options">{blueprints.map(item => {
        const active = form.blueprint_id === item.id;
        const title = locale === 'ar' ? (item.name_ar || item.name_en || item.code) : (item.name_en || item.name_ar || item.code);
        const description = locale === 'ar' ? (item.description_ar || item.description_en) : (item.description_en || item.description_ar);
        return <button type="button" key={item.id} className={active ? 'is-active' : ''} onClick={() => chooseBlueprint(item.id)}><span className="v7-blueprint-radio">{active ? '✓' : ''}</span><span><strong>{title}</strong>{description ? <small>{description}</small> : null}</span></button>;
      })}</div>{selectedBlueprint?.project_type ? <small className="v7-field-help">{locale === 'ar' ? `نوع افتراضي: ${selectedBlueprint.project_type}` : `Default type: ${selectedBlueprint.project_type}`}</small> : null}</div> : null}

      <div className="v7-form-grid">
        <label><span>{locale === 'ar' ? 'نوع المشروع' : 'Project type'}</span><input value={form.project_type} onChange={e => set('project_type', e.target.value)} placeholder="Fiber / Construction / Consultancy" /></label>
        <label><span>{locale === 'ar' ? 'العميل' : 'Client'}</span><input value={form.client_name} onChange={e => set('client_name', e.target.value)} /></label>
      </div>

      <div className="v7-form-grid">
        <label><span>{locale === 'ar' ? 'مدير المشروع' : 'Project manager'}</span><select value={form.manager_user_id} onChange={e => set('manager_user_id', e.target.value)}><option value="">{locale === 'ar' ? 'بدون تحديد الآن' : 'Not assigned yet'}</option>{members.map(item => <option value={item.user_id} key={item.id}>{item.full_name}{item.job_title ? ` · ${item.job_title}` : ''}</option>)}</select></label>
        <label><span>{tx(locale, 'status')}</span><select value={form.status} onChange={e => set('status', e.target.value)}><option value="planned">{tx(locale, 'planned')}</option><option value="active">{tx(locale, 'active')}</option><option value="on_hold">{tx(locale, 'onHold')}</option><option value="completed">{tx(locale, 'completed')}</option></select></label>
      </div>

      <div className="v7-form-grid">
        <label><span>{locale === 'ar' ? 'البداية المخططة' : 'Planned start'}</span><input type="date" value={form.planned_start_date} onChange={e => set('planned_start_date', e.target.value)} /></label>
        <label><span>{locale === 'ar' ? 'النهاية المستهدفة' : 'Target end'}</span><input type="date" min={form.planned_start_date || undefined} value={form.target_end_date} onChange={e => set('target_end_date', e.target.value)} /></label>
      </div>

      <label><span>{locale === 'ar' ? 'نسبة الإنجاز الأولية' : 'Initial progress'}</span><input type="number" min="0" max="100" value={form.progress_percent} onChange={e => set('progress_percent', Math.max(0, Math.min(100, Number(e.target.value || 0))))} /></label>
      <label><span>{locale === 'ar' ? 'الوصف' : 'Description'}</span><textarea rows={5} value={form.description} onChange={e => set('description', e.target.value)} /></label>
      {error ? <div className="v7-form-error">{error}</div> : null}
      <div className="v7-form-actions"><Button type="button" onClick={onClose} disabled={saving}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button><Button type="submit" variant="primary" icon="plus" disabled={saving || atLimit || !form.code.trim() || !form.name.trim()}>{saving ? tx(locale, 'loading') : tx(locale, 'newProject')}</Button></div>
    </form>
  </SideSheet>;
}
