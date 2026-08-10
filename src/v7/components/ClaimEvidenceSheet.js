'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import SideSheet from './SideSheet';
import { Button, EmptyState } from './Primitives';
import { normalizeArray } from '../lib/format';

export default function ClaimEvidenceSheet({ open, onClose, data, locale, onDone }) {
  const doc = data?.document || {};
  const options = normalizeArray(data?.claim_options);
  const [selected, setSelected] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const first = options[0];
    setSelected(first ? `${first.package_id}:${first.requirement_id}` : '');
    setError('');
  }, [open, doc.id, options.length]);

  const chosen = useMemo(() => options.find(row => `${row.package_id}:${row.requirement_id}` === selected) || null, [options, selected]);
  const submit = async event => {
    event.preventDefault();
    if (running || !chosen || !doc.id) return;
    setRunning(true); setError('');
    try {
      await api.rpc('add_document_to_site_claim', {
        p_document_id: doc.id,
        p_requirement_key: chosen.requirement_key,
        p_package_id: chosen.package_id,
        p_cabinet_id: data?.cabinet?.id || null,
        p_inclusion_mode: 'manual'
      });
      api.clearReadCache(); await onDone?.();
    } catch (err) { setError(err.message || (locale === 'ar' ? 'تعذر إضافة المستند إلى المستخلص.' : 'Could not add the document to the claim package.')); }
    finally { setRunning(false); }
  };

  return <SideSheet open={open} onClose={running ? undefined : onClose} eyebrow="DELIVERY EVIDENCE" title={locale === 'ar' ? 'إضافة للمستخلص' : 'Add to claim package'} subtitle={doc.display_name || ''}>
    {!options.length ? <EmptyState icon="delivery" title={locale === 'ar' ? 'لا توجد متطلبات متاحة' : 'No available requirements'} description={locale === 'ar' ? 'يجب أن يكون المستند داخل موقع، وأن يوجد مستخلص مفتوح غير مجمّد ولديك صلاحية إدارة الملفات.' : 'The document must belong to a site with an open unfrozen claim package and you need file-management access.'} /> : <form className="v7-form-stack" onSubmit={submit}>
      <label><span>{locale === 'ar' ? 'المستخلص والمتطلب' : 'Package and requirement'}</span><select autoFocus value={selected} onChange={e => setSelected(e.target.value)}>{options.map(row => <option key={`${row.package_id}:${row.requirement_id}`} value={`${row.package_id}:${row.requirement_id}`}>{row.package_no || 'Package'} · {locale === 'ar' ? row.label_ar : row.label_en}</option>)}</select></label>
      <div className="v7-control-hint">{locale === 'ar' ? 'سيتم إنشاء مرجع للمستند الأصلي فقط. لن يتم نسخ الملف. عند تجميد المستخلص سيتم تثبيت الإصدار الحالي وقتها.' : 'Only a reference to the canonical document is added; no file is copied. Freezing the package pins the exact current version at that moment.'}</div>
      {error ? <div className="v7-form-error">{error}</div> : null}
      <div className="v7-form-actions"><Button type="button" onClick={onClose} disabled={running}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button><Button type="submit" variant="primary" icon="delivery" disabled={running || !chosen}>{running ? (locale === 'ar' ? 'جارٍ الإضافة…' : 'Adding…') : (locale === 'ar' ? 'إضافة كدليل تسليم' : 'Add as delivery evidence')}</Button></div>
    </form>}
  </SideSheet>;
}
