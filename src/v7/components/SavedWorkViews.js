'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import Icon from './Icon';
import { Badge, Button } from './Primitives';

export default function SavedWorkViews({ workspace, locale, filters, onApply, autoApplyDefault = false }) {
  const [views, setViews] = useState([]);
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [makeDefault, setMakeDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const defaultApplied = useRef(false);
  const companyId = workspace.company.id;
  const userId = workspace.user.id;

  const load = async () => {
    const rows = await api.select('workspace_saved_views', {
      filters: { company_id: `eq.${companyId}`, user_id: `eq.${userId}`, view_key: 'eq.work.tasks' },
      order: 'is_default.desc,updated_at.desc',
      limit: 100,
      cacheTtlMs: 0
    });
    setViews(rows);
    return rows;
  };

  useEffect(() => {
    let alive = true;
    setError('');
    load().catch((err) => { if (alive) setError(err.message || 'Could not load saved views'); });
    return () => { alive = false; };
  }, [companyId, userId]);

  const active = useMemo(() => views.find((view) => view.id === selected) || null, [views, selected]);

  useEffect(() => {
    if (!autoApplyDefault || defaultApplied.current || !views.length) return;
    const defaultView = views.find((view) => view.is_default);
    defaultApplied.current = true;
    if (!defaultView) return;
    setSelected(defaultView.id);
    onApply?.(defaultView.filters || {});
  }, [autoApplyDefault, views, onApply]);

  const apply = () => {
    if (!active) return;
    onApply?.(active.filters || {});
  };

  const save = async (event) => {
    event.preventDefault();
    const clean = name.trim();
    if (clean.length < 2 || busy) return;
    setBusy(true); setError('');
    try {
      await api.rpc('save_workspace_saved_view', {
        p_company_id: companyId,
        p_view_key: 'work.tasks',
        p_name: clean,
        p_filters: filters || {},
        p_is_default: makeDefault,
        p_view_id: null
      });
      api.clearReadCache('workspace_saved_views');
      const rows = await load();
      const created = rows.find((view) => view.name === clean);
      setSelected(created?.id || '');
      setName(''); setMakeDefault(false); setSaveOpen(false);
    } catch (err) { setError(err.message || (locale === 'ar' ? 'تعذر حفظ العرض.' : 'Could not save the view.')); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!active || busy) return;
    setBusy(true); setError('');
    try {
      await api.rpc('delete_workspace_saved_view', { p_view_id: active.id });
      api.clearReadCache('workspace_saved_views');
      setSelected('');
      await load();
    } catch (err) { setError(err.message || (locale === 'ar' ? 'تعذر حذف العرض.' : 'Could not delete the view.')); }
    finally { setBusy(false); }
  };

  return <section className="v7-saved-view-bar">
    <div className="v7-saved-view-control">
      <Icon name="filter" size={15} />
      <select value={selected} onChange={(event) => setSelected(event.target.value)} aria-label={locale === 'ar' ? 'العروض المحفوظة' : 'Saved views'}>
        <option value="">{locale === 'ar' ? 'العروض المحفوظة…' : 'Saved views…'}</option>
        {views.map((view) => <option key={view.id} value={view.id}>{view.name}{view.is_default ? ` · ${locale === 'ar' ? 'افتراضي' : 'Default'}` : ''}</option>)}
      </select>
      <Button onClick={apply} disabled={!active || busy}>{locale === 'ar' ? 'تطبيق' : 'Apply'}</Button>
      {active ? <Button icon="trash" onClick={remove} disabled={busy}>{locale === 'ar' ? 'حذف' : 'Delete'}</Button> : null}
    </div>
    <div className="v7-saved-view-actions">
      {views.some((view) => view.is_default) ? <Badge tone="brand">{locale === 'ar' ? 'يوجد عرض افتراضي' : 'Default view set'}</Badge> : null}
      <Button icon="save" onClick={() => { setSaveOpen((value) => !value); setError(''); }}>{locale === 'ar' ? 'حفظ العرض الحالي' : 'Save current view'}</Button>
    </div>
    {saveOpen ? <form className="v7-saved-view-form" onSubmit={save}>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder={locale === 'ar' ? 'اسم العرض، مثال: مراجعات هذا الأسبوع' : 'View name, e.g. Reviews this week'} autoFocus />
      <label><input type="checkbox" checked={makeDefault} onChange={(event) => setMakeDefault(event.target.checked)} /> <span>{locale === 'ar' ? 'اجعله العرض الافتراضي' : 'Make default'}</span></label>
      <Button type="submit" variant="primary" disabled={busy || name.trim().length < 2}>{busy ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'حفظ' : 'Save')}</Button>
      <Button type="button" onClick={() => setSaveOpen(false)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
    </form> : null}
    {error ? <div className="v7-form-error">{error}</div> : null}
  </section>;
}
