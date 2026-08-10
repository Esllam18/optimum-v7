'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import SideSheet from './SideSheet';
import { Button } from './Primitives';

export default function FolderControlSheet({ open, onClose, mode, projectId, siteId, folder, folders = [], locale, onDone }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [parentId, setParentId] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(folder?.name || '');
    setCode(folder?.code || '');
    setParentId(folder?.parent_id || '');
    setRunning(false); setError('');
  }, [open, folder?.id, folder?.name, folder?.code, folder?.parent_id]);

  const title = useMemo(() => {
    if (mode === 'create') return locale === 'ar' ? 'مجلد جديد' : 'New folder';
    if (mode === 'rename') return locale === 'ar' ? 'إعادة تسمية المجلد' : 'Rename folder';
    if (mode === 'move') return locale === 'ar' ? 'نقل المجلد' : 'Move folder';
    return locale === 'ar' ? 'نقل المجلد إلى السلة' : 'Move folder to trash';
  }, [mode, locale]);

  const submit = async event => {
    event.preventDefault();
    if (running) return;
    setRunning(true); setError('');
    try {
      if (mode === 'create') await api.rpc('create_folder', { p_project_id: projectId, p_site_id: siteId || null, p_parent_id: folder?.id || null, p_name: name.trim(), p_code: code.trim() || null });
      else if (mode === 'rename') await api.rpc('rename_folder', { p_folder_id: folder.id, p_name: name.trim() });
      else if (mode === 'move') await api.rpc('move_folder', { p_folder_id: folder.id, p_parent_id: parentId || null });
      else if (mode === 'trash') await api.rpc('trash_folder', { p_folder_id: folder.id });
      api.clearReadCache();
      await onDone?.({ mode });
      onClose?.();
    } catch (err) { setError(err.message || (locale === 'ar' ? 'تعذر تنفيذ العملية.' : 'The operation could not be completed.')); }
    finally { setRunning(false); }
  };

  const candidates = folders.filter(row => row.id !== folder?.id && !row.trashed_at && Number(row.depth || 0) < 8);
  return <SideSheet open={open} onClose={running ? undefined : onClose} eyebrow="CDE FOLDER" title={title} subtitle={folder?.name || (locale === 'ar' ? 'إدارة هيكل الملفات داخل نفس سياق المشروع.' : 'Manage the file structure inside the same project context.')}>
    <form className="v7-form-stack" onSubmit={submit}>
      {mode === 'create' || mode === 'rename' ? <label><span>{locale === 'ar' ? 'اسم المجلد' : 'Folder name'}</span><input autoFocus required value={name} onChange={e => setName(e.target.value)} /></label> : null}
      {mode === 'create' ? <label><span>{locale === 'ar' ? 'الكود' : 'Code'}</span><input value={code} onChange={e => setCode(e.target.value)} placeholder={locale === 'ar' ? 'اختياري' : 'Optional'} /></label> : null}
      {mode === 'move' ? <label><span>{locale === 'ar' ? 'المجلد الأب الجديد' : 'New parent folder'}</span><select autoFocus value={parentId} onChange={e => setParentId(e.target.value)}><option value="">{locale === 'ar' ? 'جذر النطاق الحالي' : 'Current scope root'}</option>{candidates.map(row => <option key={row.id} value={row.id}>{'—'.repeat(Math.max(0, Number(row.depth || 0)))} {row.code ? `${row.code} · ` : ''}{row.name}</option>)}</select></label> : null}
      {mode === 'trash' ? <div className="v7-lifecycle-callout is-danger"><div><strong>{locale === 'ar' ? 'المجلد وكل محتواه سينتقل إلى سلة CDE' : 'The folder and its contents will move to CDE trash'}</strong><p>{locale === 'ar' ? 'لا يوجد حذف نهائي في هذه العملية ويمكن الاسترجاع وفق الصلاحيات.' : 'Nothing is permanently deleted and restore remains permission-aware.'}</p></div></div> : null}
      {error ? <div className="v7-form-error">{error}</div> : null}
      <div className="v7-form-actions"><Button type="button" onClick={onClose} disabled={running}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button><Button type="submit" variant={mode === 'trash' ? 'danger' : 'primary'} icon={mode === 'trash' ? 'trash' : 'save'} disabled={running || ((mode === 'create' || mode === 'rename') && !name.trim())}>{running ? (locale === 'ar' ? 'جارٍ التنفيذ…' : 'Working…') : (locale === 'ar' ? 'حفظ' : 'Save')}</Button></div>
    </form>
  </SideSheet>;
}
