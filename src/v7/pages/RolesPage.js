'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { can } from '../lib/workspace';
import Icon from '../components/Icon';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Panel, Skeleton } from '../components/Primitives';

const moduleLabel = (locale, value) => ({
  ar: { audit: 'سجل النشاط', company: 'الشركة', members: 'الأعضاء', roles: 'الأدوار', tasks: 'العمل والمهام', projects: 'المشاريع', files: 'الملفات', drawings: 'الهندسة', notifications: 'الإشعارات' },
  en: { audit: 'Audit', company: 'Company', members: 'Members', roles: 'Roles', tasks: 'Work & tasks', projects: 'Projects', files: 'Files', drawings: 'Engineering', notifications: 'Notifications' }
})[locale]?.[value] || value;

const slugify = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

export default function RolesPage({ workspace, locale }) {
  const [roles, setRoles] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [rolePermissions, setRolePermissions] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState(new Set());
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [newRole, setNewRole] = useState({ name_ar: '', name_en: '', description_ar: '', description_en: '' });

  const canManage = can(workspace, 'roles.manage');
  const canCreate = can(workspace, 'roles.create') || canManage;

  useEffect(() => {
    const c = new AbortController(); setError(null);
    Promise.all([
      api.select('roles', { filters: { company_id: `eq.${workspace.company.id}` }, order: 'sort_order.asc,created_at.asc', cacheTtlMs: 20_000, signal: c.signal }),
      api.select('permissions', { order: 'module.asc,key.asc', cacheTtlMs: 60_000, signal: c.signal }),
      api.select('role_permissions', { cacheTtlMs: 20_000, signal: c.signal })
    ]).then(([r, p, rp]) => { setRoles(r); setPermissions(p); setRolePermissions(rp); setSelectedId(current => current && r.some(x => x.id === current) ? current : r[0]?.id || ''); })
      .catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => c.abort();
  }, [workspace.company.id, reload]);

  useEffect(() => {
    if (!selectedId || !rolePermissions) return;
    setDraft(new Set(rolePermissions.filter(x => x.role_id === selectedId && x.allowed).map(x => x.permission_key)));
  }, [selectedId, rolePermissions]);

  const selected = roles?.find(x => x.id === selectedId) || null;
  const grouped = useMemo(() => {
    const map = new Map();
    for (const permission of permissions || []) {
      if (!map.has(permission.module)) map.set(permission.module, []);
      map.get(permission.module).push(permission);
    }
    return [...map.entries()];
  }, [permissions]);

  const toggle = (key) => {
    if (!canManage || selected?.slug === 'owner') return;
    setDraft(current => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; });
  };

  const save = async () => {
    if (!selected || !canManage || selected.slug === 'owner') return;
    setSaving(true); setError(null);
    try { await api.rpc('replace_role_permissions', { p_role_id: selected.id, p_permission_keys: [...draft] }); api.clearReadCache(); setReload(x => x + 1); }
    catch (err) { setError(err); }
    finally { setSaving(false); }
  };

  const createRole = async (event) => {
    event.preventDefault(); if (!newRole.name_ar.trim() || !newRole.name_en.trim()) return;
    setSaving(true); setError(null);
    try {
      const id = await api.rpc('create_company_role', {
        p_company_id: workspace.company.id,
        p_name_ar: newRole.name_ar.trim(), p_name_en: newRole.name_en.trim(),
        p_slug: slugify(newRole.name_en) || `role-${Date.now()}`,
        p_description_ar: newRole.description_ar.trim() || null,
        p_description_en: newRole.description_en.trim() || null,
        p_color: '#6d5dfc', p_icon: 'shield', p_permission_keys: [], p_template_id: null
      });
      setCreateOpen(false); setNewRole({ name_ar: '', name_en: '', description_ar: '', description_en: '' }); api.clearReadCache(); setReload(x => x + 1); if (id) setSelectedId(id);
    } catch (err) { setError(err); }
    finally { setSaving(false); }
  };

  if (error && !roles) return <ErrorState title={locale === 'ar' ? 'تعذر تحميل الأدوار' : 'Roles could not be loaded'} description={error.message} retryLabel={locale === 'ar' ? 'إعادة المحاولة' : 'Retry'} onRetry={() => setReload(x => x + 1)} />;
  return <>
    <PageHeader eyebrow={locale === 'ar' ? 'الوصول والحوكمة' : 'ACCESS · GOVERNANCE'} title={locale === 'ar' ? 'الأدوار والصلاحيات' : 'Roles & permissions'} description={locale === 'ar' ? 'نفس محرك الصلاحيات القديم، لكن في مصفوفة أوضح: كل Role، كل Permission، وما الذي سيتغير قبل الحفظ.' : 'The original permission engine in a clearer matrix: every role, every permission, and exactly what changes before save.'} actions={canCreate ? <Button variant="primary" icon="plus" onClick={() => setCreateOpen(x => !x)}>{locale === 'ar' ? 'دور جديد' : 'New role'}</Button> : null} />
    {error ? <div className="v7-inline-error">{error.message}</div> : null}
    {createOpen ? <Panel className="v7-role-create" title={locale === 'ar' ? 'إنشاء دور مخصص' : 'Create custom role'}><form onSubmit={createRole} className="v7-form-stack"><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'الاسم العربي' : 'Arabic name'}</span><input value={newRole.name_ar} onChange={e => setNewRole(x => ({ ...x, name_ar: e.target.value }))} required /></label><label><span>{locale === 'ar' ? 'الاسم الإنجليزي' : 'English name'}</span><input value={newRole.name_en} onChange={e => setNewRole(x => ({ ...x, name_en: e.target.value }))} required /></label></div><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'الوصف العربي' : 'Arabic description'}</span><textarea value={newRole.description_ar} onChange={e => setNewRole(x => ({ ...x, description_ar: e.target.value }))} /></label><label><span>{locale === 'ar' ? 'الوصف الإنجليزي' : 'English description'}</span><textarea value={newRole.description_en} onChange={e => setNewRole(x => ({ ...x, description_en: e.target.value }))} /></label></div><div className="v7-form-actions"><Button type="button" onClick={() => setCreateOpen(false)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'إنشاء' : 'Create')}</Button></div></form></Panel> : null}
    <div className="v7-roles-layout">
      <Panel className="v7-role-list-panel" title={locale === 'ar' ? 'أدوار مساحة العمل' : 'Workspace roles'} description={roles ? `${roles.length} ${locale === 'ar' ? 'دور' : 'roles'}` : ''}>
        {!roles ? <Skeleton lines={8} /> : roles.length ? <div className="v7-role-selector">{roles.map(role => <button key={role.id} className={selectedId === role.id ? 'is-active' : ''} onClick={() => setSelectedId(role.id)}><span className="v7-role-color" style={{ '--role-color': role.color || '#6d5dfc' }} /><div><strong>{locale === 'ar' ? role.name_ar : role.name_en}</strong><small>{(locale === 'ar' ? role.description_ar : role.description_en) || role.slug}</small></div><Badge tone={role.is_protected ? 'neutral' : 'success'}>{role.is_protected ? (locale === 'ar' ? 'محمي' : 'Protected') : (locale === 'ar' ? 'مخصص' : 'Custom')}</Badge></button>)}</div> : <EmptyState icon="shield" title={locale === 'ar' ? 'لا توجد أدوار' : 'No roles'} />}
      </Panel>
      <Panel className="v7-permission-panel" title={selected ? (locale === 'ar' ? selected.name_ar : selected.name_en) : (locale === 'ar' ? 'الصلاحيات' : 'Permissions')} description={selected ? `${draft.size} ${locale === 'ar' ? 'صلاحية فعالة' : 'active permissions'}` : ''} action={selected && canManage && selected.slug !== 'owner' ? <Button variant="primary" icon="save" onClick={save} disabled={saving}>{saving ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'حفظ الصلاحيات' : 'Save permissions')}</Button> : null}>
        {!permissions || !rolePermissions ? <Skeleton lines={12} /> : !selected ? <EmptyState icon="shield" title={locale === 'ar' ? 'اختر دورًا' : 'Select a role'} /> : <div className="v7-permission-groups">{grouped.map(([module, items]) => <section key={module}><header><Icon name={module === 'tasks' ? 'check' : module === 'members' ? 'users' : module === 'files' ? 'folder' : module === 'audit' ? 'activity' : 'shield'} size={16} /><strong>{moduleLabel(locale, module)}</strong><small>{items.filter(x => draft.has(x.key)).length}/{items.length}</small></header><div>{items.map(permission => <button key={permission.key} type="button" className={draft.has(permission.key) ? 'is-on' : ''} disabled={!canManage || selected.slug === 'owner'} onClick={() => toggle(permission.key)}><span><i /></span><div><strong>{locale === 'ar' ? permission.description_ar : permission.description_en}</strong><code>{permission.key}</code></div></button>)}</div></section>)}</div>}
      </Panel>
    </div>
  </>;
}
