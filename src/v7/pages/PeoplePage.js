'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../lib/api';
import { can } from '../lib/workspace';
import BrandAvatar from '../components/BrandAvatar';
import MemberInviteSheet from '../components/MemberInviteSheet';
import { formatDate, normalizeArray, statusTone } from '../lib/format';
import { tx } from '../lib/i18n';
import Icon from '../components/Icon';
import SideSheet from '../components/SideSheet';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Panel, Skeleton, Stat } from '../components/Primitives';

const PAGE_SIZE = 50;

function MemberDetail({ membershipId, locale, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!membershipId) { setData(null); setError(null); return; }
    const c = new AbortController();
    setData(null); setError(null);
    api.rpc('member_access_snapshot', { p_membership_id: membershipId }, { cacheTtlMs: 10_000, signal: c.signal, dedupe: true })
      .then(setData).catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => c.abort();
  }, [membershipId]);

  const member = data?.membership || {};
  const profile = data?.profile || {};
  const role = data?.role || {};
  const permissions = normalizeArray(data?.effective_permissions);
  return <SideSheet open={Boolean(membershipId)} onClose={onClose} eyebrow="MEMBER 360" title={data ? profile.full_name || tx(locale, 'members') : tx(locale, 'loading')} subtitle={data ? [member.job_title, member.department, locale === 'ar' ? role.name_ar : role.name_en].filter(Boolean).join(' · ') : ''}>
    {error ? <ErrorState title={tx(locale, 'networkIssue')} description={error.message} /> : !data ? <Skeleton lines={10} /> : <>
      <div className="v7-member-identity"><BrandAvatar path={profile.avatar_path} name={profile.full_name} size={54} /><div><strong>{profile.full_name || '—'}</strong><span>{member.employee_code || member.employment_type || '—'}</span></div><Badge tone={statusTone(member.status)}>{member.status}</Badge></div>
      <div className="v7-detail-section"><div className="v7-detail-grid"><div className="v7-detail-field"><span>{locale === 'ar' ? 'الدور' : 'Role'}</span><strong>{locale === 'ar' ? role.name_ar : role.name_en}</strong></div><div className="v7-detail-field"><span>{locale === 'ar' ? 'نمط العمل' : 'Work mode'}</span><strong>{member.work_mode || '—'}</strong></div><div className="v7-detail-field"><span>{locale === 'ar' ? 'تاريخ الانضمام' : 'Joined'}</span><strong>{formatDate(member.joined_at, locale)}</strong></div><div className="v7-detail-field"><span>{locale === 'ar' ? 'الطاقة' : 'Capacity'}</span><strong>{member.weekly_capacity_hours ?? '—'} h/w</strong></div></div></div>
      <div className="v7-detail-section"><h3>{locale === 'ar' ? 'نافذة الوصول' : 'Access window'}</h3><div className="v7-detail-grid"><div className="v7-detail-field"><span>{locale === 'ar' ? 'يبدأ' : 'Starts'}</span><strong>{formatDate(member.access_starts_at, locale)}</strong></div><div className="v7-detail-field"><span>{locale === 'ar' ? 'ينتهي' : 'Ends'}</span><strong>{formatDate(member.access_ends_at, locale)}</strong></div><div className="v7-detail-field"><span>{locale === 'ar' ? 'مرحلة العضوية' : 'Lifecycle'}</span><strong>{member.lifecycle_stage || 'active'}</strong></div><div className="v7-detail-field"><span>{locale === 'ar' ? 'الموقع الرئيسي' : 'Primary site'}</span><strong>{member.primary_site_id ? (locale === 'ar' ? 'محدد' : 'Assigned') : (locale === 'ar' ? 'نطاق الشركة' : 'Company scope')}</strong></div></div></div>
      <div className="v7-detail-section"><h3>{locale === 'ar' ? 'الوحدات التنظيمية' : 'Organization units'}</h3>{normalizeArray(data.organization_units).length ? <div className="v7-linked-list">{normalizeArray(data.organization_units).map(unit => <article key={unit.id || unit.unit_id}><Icon name="users" size={15} /><span><strong>{locale === 'ar' ? unit.name_ar : unit.name_en}</strong><small>{unit.unit_type || unit.title || (locale === 'ar' ? 'وحدة تنظيمية' : 'Organization unit')}</small></span></article>)}</div> : <p>{locale === 'ar' ? 'لا توجد وحدة تنظيمية مرتبطة بهذا العضو بشكل صريح.' : 'No organization unit is explicitly assigned.'}</p>}</div>
      <div className="v7-detail-section"><h3>{locale === 'ar' ? 'الصلاحيات الفعالة' : 'Effective permissions'}</h3><div className="v7-permission-cloud">{permissions.map(key => <Badge key={key} tone="neutral">{key}</Badge>)}</div></div>
      <div className="v7-detail-section"><h3>{locale === 'ar' ? 'قواعد النطاق' : 'Scope rules'}</h3>{normalizeArray(data.scope_rules).length ? <div className="v7-linked-list">{normalizeArray(data.scope_rules).map(rule => <article key={rule.id}><Icon name="shield" size={15} /><span><strong>{rule.effect} · {rule.scope_type}</strong><small>{rule.permission_key || (locale === 'ar' ? 'كل الصلاحيات الفعالة' : 'All effective permissions')} · {rule.target_id || (locale === 'ar' ? 'الشركة' : 'Company')}</small></span></article>)}</div> : <p>{locale === 'ar' ? 'لا توجد قيود نطاق صريحة؛ يتم تطبيق قواعد وصول الشركة الفعالة.' : 'No explicit scope restriction is applied; effective company access rules are used.'}</p>}</div>
    </>}
  </SideSheet>;
}

export default function PeoplePage({ workspace, locale }) {
  const params = useSearchParams();
  const router = useRouter();
  const membershipId = params.get('member') || '';
  const [roles, setRoles] = useState([]);
  const [directory, setDirectory] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [status, setStatus] = useState('');
  const [roleId, setRoleId] = useState('');
  const [offset, setOffset] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedQuery(query.trim()); setOffset(0); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const c = new AbortController();
    api.select('roles', { filters: { company_id: `eq.${workspace.company.id}` }, order: 'sort_order.asc', cacheTtlMs: 30_000, signal: c.signal })
      .then(setRoles).catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => c.abort();
  }, [workspace.company.id]);

  useEffect(() => {
    const c = new AbortController();
    setError(null);
    api.rpc('member_directory_query', {
      p_company_id: workspace.company.id,
      p_query: debouncedQuery || null,
      p_status: status || null,
      p_role_id: roleId || null,
      p_limit: PAGE_SIZE,
      p_offset: offset
    }, { signal: c.signal, dedupe: true, cacheTtlMs: 4_000, metricLabel: 'v7.people.directory' })
      .then(setDirectory)
      .catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => c.abort();
  }, [workspace.company.id, debouncedQuery, status, roleId, offset, refreshKey]);

  const rows = normalizeArray(directory?.items);
  const counts = directory?.status_counts || {};
  const total = Number(directory?.total || 0);
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const openMember = (id) => router.push(`/v7/people?member=${encodeURIComponent(id)}`);
  const closeMember = () => router.push('/v7/people');
  const refresh = async () => { api.clearReadCache(); setRefreshKey(k => k + 1); };
  const roleOptions = useMemo(() => roles.filter(r => r.slug !== 'owner' || can(workspace, 'members.manage')), [roles, workspace]);

  if (error && !directory) return <ErrorState title={tx(locale, 'networkIssue')} description={error.message} />;

  return <>
    <PageHeader eyebrow="PEOPLE · ACCESS" title={tx(locale, 'peopleCenter')} description={tx(locale, 'peopleCenterSub')} actions={can(workspace, 'members.invite') ? <Button variant="primary" icon="plus" onClick={() => setInviteOpen(true)}>{locale === 'ar' ? 'دعوة عضو' : 'Invite member'}</Button> : null} />
    <section className="v7-people-pulse"><div><span className="v7-eyebrow">{locale === 'ar' ? 'صحة الفريق' : 'TEAM HEALTH'}</span><strong>{locale === 'ar' ? 'الفريق والنطاق في صورة واحدة' : 'Team and access at a glance'}</strong><small>{locale === 'ar' ? 'الأعداد هنا من دليل الأعضاء Server-side، وليست ناتجة عن تحميل ملفات المستخدمين في المتصفح.' : 'Counts come from the server-side member directory, not browser-side profile fan-out.'}</small></div><div className="v7-people-pulse-metrics"><span><small>{locale === 'ar' ? 'الأعضاء' : 'Members'}</small><strong>{directory ? (counts.members ?? total) : '—'}</strong></span><span><small>{locale === 'ar' ? 'نشط' : 'Active'}</small><strong>{directory ? (counts.active ?? 0) : '—'}</strong></span><span><small>{locale === 'ar' ? 'دعوات معلقة' : 'Pending invites'}</small><strong>{directory ? (counts.pending_invites ?? 0) : '—'}</strong></span><span className={Number(counts.suspended || 0) ? 'is-danger' : ''}><small>{locale === 'ar' ? 'موقوف' : 'Suspended'}</small><strong>{directory ? (counts.suspended ?? 0) : '—'}</strong></span></div></section>
    <Panel>
      <div className="v7-people-toolbar">
        <div className="v7-search-field"><Icon name="search" size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={tx(locale, 'search')} /></div>
        <select value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }}><option value="">{locale === 'ar' ? 'كل الحالات' : 'All statuses'}</option><option value="active">{locale === 'ar' ? 'نشط' : 'Active'}</option><option value="invited">{locale === 'ar' ? 'مدعو' : 'Invited'}</option><option value="suspended">{locale === 'ar' ? 'موقوف' : 'Suspended'}</option><option value="left">{locale === 'ar' ? 'غادر' : 'Left'}</option></select>
        <select value={roleId} onChange={e => { setRoleId(e.target.value); setOffset(0); }}><option value="">{locale === 'ar' ? 'كل الأدوار' : 'All roles'}</option>{roleOptions.map(r => <option key={r.id} value={r.id}>{locale === 'ar' ? (r.name_ar || r.name_en) : (r.name_en || r.name_ar)}</option>)}</select>
        <span className="v7-toolbar-count">{total} {locale === 'ar' ? 'عضو' : 'members'}</span>
      </div>
      {error ? <div className="v7-inline-error">{error.message}</div> : null}
      {!directory ? <Skeleton lines={8} /> : rows.length ? <><div className="v7-people-head"><span>{locale === 'ar' ? 'العضو' : 'Member'}</span><span>{locale === 'ar' ? 'الدور' : 'Role'}</span><span>{locale === 'ar' ? 'النطاق' : 'Scope'}</span><span>{tx(locale, 'status')}</span><span /></div><div className="v7-people-list">{rows.map(row => <button key={row.membership_id} aria-label={`${row.full_name || row.email || ''} · ${row.status || ''}`} onClick={() => openMember(row.membership_id)}><BrandAvatar path={row.avatar_path} name={row.full_name || row.email} size={38} /><span className="v7-person-name"><strong>{row.full_name || row.email || '—'}</strong><small>{row.job_title || row.department || row.employee_code || '—'}</small></span><span className="v7-person-role">{locale === 'ar' ? (row.role_name_ar || row.role_name_en) : (row.role_name_en || row.role_name_ar)}</span><span className="v7-person-scope">{row.primary_site_id ? (locale === 'ar' ? 'موقع محدد' : 'Site assigned') : (locale === 'ar' ? 'نطاق الشركة' : 'Company scope')}</span><Badge tone={statusTone(row.status)}>{row.status}</Badge><Icon name="chevron" size={15} /></button>)}</div></> : <EmptyState icon="users" title={tx(locale, 'noMembers')} />}
      {directory ? <div className="v7-pagination"><span>{locale === 'ar' ? `صفحة ${page} من ${pages}` : `Page ${page} of ${pages}`}</span><div><Button onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0}>{locale === 'ar' ? 'السابق' : 'Previous'}</Button><Button onClick={() => setOffset(offset + PAGE_SIZE)} disabled={!directory.has_more}>{locale === 'ar' ? 'التالي' : 'Next'}</Button></div></div> : null}
    </Panel>
    <MemberDetail membershipId={membershipId} locale={locale} onClose={closeMember} />
    <MemberInviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} workspace={workspace} roles={roles} locale={locale} onInvited={refresh} />
  </>;
}
