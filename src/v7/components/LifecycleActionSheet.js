'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import SideSheet from './SideSheet';
import Icon from './Icon';
import { Button, Skeleton } from './Primitives';

const config = {
  project: { archive: 'archive_project', reactivate: 'reactivate_project', impact: 'project_archive_impact', idArg: 'p_project_id' },
  site: { archive: 'archive_site', reactivate: 'reactivate_site', impact: 'site_archive_impact', idArg: 'p_site_id' },
  cabinet: { archive: 'archive_site_cabinet', reactivate: 'reactivate_site_cabinet', impact: null, idArg: 'p_cabinet_id' }
};

export default function LifecycleActionSheet({ open, onClose, kind, entity, mode = 'archive', locale, onDone }) {
  const [impact, setImpact] = useState(null); const [loading, setLoading] = useState(false); const [running, setRunning] = useState(false); const [error, setError] = useState('');
  const cfg = config[kind];
  useEffect(() => {
    if (!open || !entity?.id || mode !== 'archive' || !cfg?.impact) { setImpact(null); setError(''); return; }
    const c = new AbortController(); setLoading(true); setError('');
    api.rpc(cfg.impact, { [cfg.idArg]: entity.id }, { signal: c.signal, dedupe: true }).then(setImpact).catch(err => { if (err?.name !== 'AbortError') setError(err.message); }).finally(() => { if (!c.signal.aborted) setLoading(false); });
    return () => c.abort();
  }, [open, entity?.id, kind, mode]);

  if (!cfg) return null;
  const archive = mode === 'archive';
  const entityName = entity ? `${entity.code || ''}${entity.code ? ' · ' : ''}${entity.name || ''}` : '';
  const run = async () => {
    if (running || !entity?.id) return; setRunning(true); setError('');
    try {
      const args = { [cfg.idArg]: entity.id };
      if (archive && (kind === 'project' || kind === 'site')) args.p_force = true;
      const result = await api.rpc(archive ? cfg.archive : cfg.reactivate, args);
      api.clearReadCache(); await onDone?.(result);
    } catch (err) { setError(err.message || (archive ? 'Archive failed' : 'Reactivation failed')); }
    finally { setRunning(false); }
  };

  return <SideSheet open={open} onClose={running ? undefined : onClose} eyebrow="LIFECYCLE CONTROL" title={archive ? (locale === 'ar' ? 'أرشفة مساحة العمل' : 'Archive workspace') : (locale === 'ar' ? 'إعادة التنشيط' : 'Reactivate workspace')} subtitle={entityName}>
    <div className={`v7-lifecycle-callout ${archive ? 'is-danger' : 'is-success'}`}><span><Icon name={archive ? 'archive' : 'refresh'} size={20} /></span><div><strong>{archive ? (locale === 'ar' ? 'سيصبح هذا السياق للقراءة فقط' : 'This context becomes read-only') : (locale === 'ar' ? 'سيعود هذا السياق للعمل' : 'This context becomes operational again')}</strong><p>{archive ? (locale === 'ar' ? 'سيتم الاحتفاظ بالمستندات والإصدارات والرسومات والعمل والسجل بدون حذفها.' : 'Documents, versions, drawings, work and audit history are preserved; nothing is deleted.') : (locale === 'ar' ? 'لن يتم إنشاء بيانات جديدة؛ سيتم فقط فتح السياق الحالي للتعديل من جديد.' : 'No duplicate data is created; the existing context is simply reopened for mutations.')}</p></div></div>
    {loading ? <Skeleton lines={3} /> : null}
    {archive && impact ? <div className="v7-impact-grid"><div><span>{locale === 'ar' ? 'عمل مفتوح' : 'Open work'}</span><strong>{impact.open_tasks ?? 0}</strong></div><div><span>{locale === 'ar' ? 'رسومات نشطة' : 'Active drawings'}</span><strong>{impact.active_drawings ?? 0}</strong></div><div><span>{locale === 'ar' ? 'المستندات' : 'Documents'}</span><strong>{impact.documents ?? 0}</strong></div><div><span>{locale === 'ar' ? 'المواقع' : 'Sites'}</span><strong>{impact.sites ?? impact.cabinets ?? '—'}</strong></div></div> : null}
    {archive && (kind === 'project' || kind === 'site') && impact && (Number(impact.open_tasks || 0) > 0 || Number(impact.active_drawings || 0) > 0) ? <div className="v7-form-error">{locale === 'ar' ? 'يوجد عمل نشط داخل هذا السياق. تأكيد الأرشفة أدناه يعني أنك راجعت الأثر وتريد تجميده رغم ذلك.' : 'Active work exists in this context. Confirming below means you reviewed the impact and still want to freeze it.'}</div> : null}
    {error ? <div className="v7-form-error">{error}</div> : null}
    <div className="v7-form-actions"><Button type="button" onClick={onClose} disabled={running}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button><Button type="button" variant={archive ? 'danger' : 'primary'} icon={archive ? 'archive' : 'refresh'} onClick={run} disabled={running || loading}>{running ? (locale === 'ar' ? 'جارٍ التنفيذ…' : 'Working…') : archive ? (locale === 'ar' ? 'تأكيد الأرشفة' : 'Confirm archive') : (locale === 'ar' ? 'إعادة التنشيط' : 'Reactivate')}</Button></div>
  </SideSheet>;
}
