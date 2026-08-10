'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import SideSheet from './SideSheet';
import { Button, Skeleton } from './Primitives';

const statusOptions = ['working', 'in_review', 'approved', 'rejected', 'superseded'];

const toLocalDateTime = value => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function DocumentControlSheet({ open, onClose, mode, data, folderOptions = [], locale, onDone }) {
  const doc = data?.document || {};
  const [name, setName] = useState('');
  const [folderId, setFolderId] = useState('');
  const [status, setStatus] = useState('working');
  const [reviewDue, setReviewDue] = useState('');
  const [folders, setFolders] = useState([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(doc.display_name || '');
    setFolderId(doc.folder_id || '');
    setStatus(doc.control_status || 'working');
    setReviewDue(toLocalDateTime(doc.review_due_at));
    setError('');
  }, [open, doc.id, doc.display_name, doc.folder_id, doc.control_status, doc.review_due_at]);

  useEffect(() => {
    if (!open || mode !== 'move' || !doc.project_id) { setFolders([]); return; }
    if (folderOptions.length) { setFolders(folderOptions); setLoadingFolders(false); return; }
    const c = new AbortController();
    setLoadingFolders(true); setError('');
    api.select('folders', {
      select: 'id,name,code,parent_id,depth,site_id',
      filters: {
        company_id: `eq.${doc.company_id}`,
        project_id: `eq.${doc.project_id}`,
        site_id: doc.site_id ? `eq.${doc.site_id}` : 'is.null',
        trashed_at: 'is.null'
      },
      order: 'depth.asc,sort_order.asc,name.asc', limit: 300, cacheTtlMs: 15_000, signal: c.signal
    }).then(setFolders).catch(err => { if (err?.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!c.signal.aborted) setLoadingFolders(false); });
    return () => c.abort();
  }, [open, mode, doc.id, doc.company_id, doc.project_id, doc.site_id, folderOptions]);

  const title = useMemo(() => {
    if (mode === 'rename') return locale === 'ar' ? 'إعادة تسمية المستند' : 'Rename document';
    if (mode === 'move') return locale === 'ar' ? 'نقل المستند' : 'Move document';
    if (mode === 'status') return locale === 'ar' ? 'حالة التحكم بالمستند' : 'Document control status';
    return locale === 'ar' ? 'نقل المستند إلى السلة' : 'Move document to trash';
  }, [mode, locale]);

  const run = async event => {
    event?.preventDefault?.();
    if (running || !doc.id) return;
    setRunning(true); setError('');
    try {
      if (mode === 'rename') {
        if (!name.trim()) throw new Error(locale === 'ar' ? 'اسم المستند مطلوب.' : 'Document name is required.');
        await api.rpc('rename_document', { p_document_id: doc.id, p_display_name: name.trim() });
      } else if (mode === 'move') {
        if (!folderId || folderId === doc.folder_id) throw new Error(locale === 'ar' ? 'اختر مجلدًا مختلفًا.' : 'Choose a different folder.');
        await api.rpc('move_document', { p_document_id: doc.id, p_folder_id: folderId });
      } else if (mode === 'status') {
        const due = reviewDue ? new Date(reviewDue).toISOString() : null;
        await api.rpc('set_document_control_status', { p_document_id: doc.id, p_status: status, p_review_due_at: due });
      } else if (mode === 'trash') {
        await api.rpc('trash_document', { p_document_id: doc.id });
      }
      api.clearReadCache();
      await onDone?.({ mode, folderId: mode === 'move' ? folderId : doc.folder_id });
    } catch (err) {
      setError(err.message || (locale === 'ar' ? 'تعذر تنفيذ العملية.' : 'The operation could not be completed.'));
    } finally { setRunning(false); }
  };

  return <SideSheet open={open} onClose={running ? undefined : onClose} eyebrow="DOCUMENT CONTROL" title={title} subtitle={doc.display_name || ''}>
    {mode === 'move' && loadingFolders ? <Skeleton lines={5} /> : <form className="v7-form-stack" onSubmit={run}>
      {mode === 'rename' ? <label><span>{locale === 'ar' ? 'اسم المستند' : 'Document name'}</span><input autoFocus required value={name} onChange={e => setName(e.target.value)} /></label> : null}
      {mode === 'move' ? <label><span>{locale === 'ar' ? 'المجلد الجديد' : 'Destination folder'}</span><select autoFocus required value={folderId} onChange={e => setFolderId(e.target.value)}>{folders.map(folder => <option key={folder.id} value={folder.id} disabled={folder.id === doc.folder_id}>{'—'.repeat(Math.max(0, Number(folder.depth || 0)))} {folder.code ? `${folder.code} · ` : ''}{folder.name}{folder.id === doc.folder_id ? (locale === 'ar' ? ' (الحالي)' : ' (current)') : ''}</option>)}</select></label> : null}
      {mode === 'status' ? <><label><span>{locale === 'ar' ? 'حالة المستند' : 'Control status'}</span><select autoFocus value={status} onChange={e => setStatus(e.target.value)}>{statusOptions.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label><label><span>{locale === 'ar' ? 'موعد المراجعة' : 'Review due'}</span><input type="datetime-local" value={reviewDue} onChange={e => setReviewDue(e.target.value)} /></label><div className="v7-control-hint">{locale === 'ar' ? 'عند الاعتماد سيتم تسجيل المستخدم والوقت تلقائيًا. تغيير الحالة لا يغيّر أو يحذف أي إصدار.' : 'Approval records the acting member and timestamp automatically. Status changes never overwrite or delete a version.'}</div></> : null}
      {mode === 'trash' ? <div className="v7-lifecycle-callout is-danger"><div><strong>{locale === 'ar' ? 'لن يتم حذف الملف أو إصداراته نهائيًا' : 'The file and its versions are not permanently deleted'}</strong><p>{locale === 'ar' ? 'سيختفي من مساحة العمل النشطة ويمكن استعادته من سلة CDE إذا ظل سياق المشروع والمجلد صالحًا.' : 'It leaves the active workspace and can be restored from the CDE trash while its project/folder context remains valid.'}</p></div></div> : null}
      {error ? <div className="v7-form-error">{error}</div> : null}
      <div className="v7-form-actions"><Button type="button" onClick={onClose} disabled={running}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button><Button type="submit" variant={mode === 'trash' ? 'danger' : 'primary'} icon={mode === 'trash' ? 'trash' : 'check'} disabled={running || (mode === 'move' && loadingFolders)}>{running ? (locale === 'ar' ? 'جارٍ التنفيذ…' : 'Working…') : mode === 'trash' ? (locale === 'ar' ? 'نقل إلى السلة' : 'Move to trash') : (locale === 'ar' ? 'حفظ' : 'Save')}</Button></div>
    </form>}
  </SideSheet>;
}
