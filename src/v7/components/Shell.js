'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Icon from './Icon';
import BrandAvatar from './BrandAvatar';
import NotificationCenter from './NotificationCenter';
import { Button } from './Primitives';
import { tx } from '../lib/i18n';
import { api } from '../lib/api';
import { can } from '../lib/workspace';

const navGroups = [
  { key: 'workspace', items: [
    { key: 'overview', href: '/v7', icon: 'grid' },
    { key: 'work', href: '/v7/work', icon: 'check', permission: 'tasks.view' },
    { key: 'projects', href: '/v7/projects', icon: 'briefcase', permission: 'projects.view' }
  ] },
  { key: 'delivery', items: [
    { key: 'documents', href: '/v7/documents', icon: 'folder', permission: 'files.view' },
    { key: 'engineering', href: '/v7/engineering', icon: 'drafting', permission: 'drawings.view' },
    { key: 'delivery', href: '/v7/delivery', icon: 'delivery', permission: 'projects.view' }
  ] },
  { key: 'control', items: [
    { key: 'people', href: '/v7/people', icon: 'users', permission: 'members.view' },
    { key: 'control', href: '/v7/control', icon: 'shield', permission: 'roles.view' }
  ] }
];

const navItems = navGroups.flatMap(group => group.items);
const groupLabel = (locale, key) => ({
  ar: { workspace: 'مساحة العمل', delivery: 'التسليم', control: 'الفريق والتحكم' },
  en: { workspace: 'Workspace', delivery: 'Delivery', control: 'People & control' }
})[locale]?.[key] || key;

export default function Shell({ workspace, locale, setLocale, theme, setTheme, onCompanyChange, children, onSearch }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [metrics, setMetrics] = useState([]);

  useEffect(() => api.subscribeMetrics((_, all) => setMetrics(all.slice(-12))), []);
  useEffect(() => setMobileOpen(false), [pathname]);
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const current = navItems.find(item => item.href === pathname || (item.href !== '/v7' && pathname.startsWith(item.href))) || navItems[0];
  const visibleGroups = navGroups.map(group => ({ ...group, items: group.items.filter(item => !item.permission || can(workspace, item.permission)) })).filter(group => group.items.length);
  const recentAvg = metrics.length ? Math.round(metrics.reduce((a, b) => a + Number(b.ms || 0), 0) / metrics.length) : 0;
  const canCreateTask = can(workspace, 'tasks.create');
  const canViewNotifications = can(workspace, 'notifications.view');

  return <div className="v7-root" dir={dir} data-theme={theme}>
    {mobileOpen ? <button className="v7-sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} /> : null}
    <aside className={`v7-sidebar ${mobileOpen ? 'is-open' : ''}`}>
      <div className="v7-brand-row">
        <BrandAvatar path={workspace.branding?.logo_path} name={workspace.branding?.app_name || workspace.company?.name || 'Optimum'} size={36} />
        <div><strong>{workspace.branding?.app_name || 'Optimum'}</strong><span>Delivery OS</span></div>
      </div>

      <div className="v7-company-switcher">
        <div className="v7-company-card" aria-hidden="true">
          <BrandAvatar path={workspace.branding?.logo_path} name={workspace.company?.name || 'Optimum'} size={34} />
          <span><strong>{workspace.company?.name || '—'}</strong><small>{tx(locale, 'workspace')}</small></span>
          <Icon name="chevron" size={15} />
        </div>
        <select id="v7-company-select" className="v7-company-select" value={workspace.company?.id || ''} onChange={(e) => onCompanyChange(e.target.value)} aria-label={locale === 'ar' ? 'تغيير الشركة' : 'Change company'}>
          {workspace.companies?.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>
      </div>

      <nav className="v7-nav" aria-label="Primary navigation">
        {visibleGroups.map(group => <section className="v7-nav-group" key={group.key}>
          <span className="v7-nav-group-label">{groupLabel(locale, group.key)}</span>
          <div>
            {group.items.map(item => {
              const active = item.key === current.key;
              return <button key={item.key} className={active ? 'is-active' : ''} onClick={() => router.push(item.href)}><Icon name={item.icon} size={18} /><span>{tx(locale, item.key)}</span>{active ? <i /> : null}</button>;
            })}
          </div>
        </section>)}
      </nav>

      <div className="v7-sidebar-foot">
        <div className="v7-health-chip"><span className={recentAvg > 750 ? 'is-slow' : ''} /><div><strong>{tx(locale, 'performance')}</strong><small>{metrics.length ? `${recentAvg} ms · ${metrics.length} ${tx(locale, metrics.length === 1 ? 'request' : 'requests')}` : tx(locale, 'fast')}</small></div></div>
        <div className="v7-profile-row"><BrandAvatar path={workspace.profile?.avatar_path} name={workspace.profile?.full_name || workspace.user?.email} size={34} /><span><strong>{workspace.profile?.full_name || workspace.user?.email}</strong><small>{workspace.user?.email}</small></span><button type="button" aria-label={tx(locale, 'signOut')} title={tx(locale, 'signOut')} onClick={() => api.signOut().then(() => location.assign('/v7'))}><Icon name="logout" size={16} /></button></div>
      </div>
    </aside>

    <div className="v7-main">
      <header className="v7-topbar">
        <button type="button" className="v7-icon-button v7-mobile-menu" onClick={() => setMobileOpen(true)} aria-label={locale === 'ar' ? 'فتح القائمة' : 'Open navigation'}><Icon name="menu" /></button>
        <div className="v7-context-title"><span>{workspace.company?.name}</span><strong>{tx(locale, current.key)}</strong></div>
        <button className="v7-command" onClick={onSearch}><Icon name="search" size={17} /><span>{tx(locale, 'search')}</span><small>⌘ K</small></button>
        <div className="v7-top-actions">
          {canCreateTask ? <Button variant="primary" icon="plus" className="v7-create-button" onClick={() => router.push('/v7/work?create=task')}>{tx(locale, 'quickCreate')}</Button> : null}
          <button type="button" className="v7-icon-button" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')} aria-label={locale === 'ar' ? 'تغيير اللغة' : 'Change language'} title={locale === 'ar' ? 'تغيير اللغة' : 'Change language'}><Icon name="globe" /></button>
          <button type="button" className="v7-icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={locale === 'ar' ? 'تغيير المظهر' : 'Change theme'} title={locale === 'ar' ? 'تغيير المظهر' : 'Change theme'}><Icon name="sun" /></button>
          {canViewNotifications ? <button type="button" className="v7-icon-button" aria-label={locale === 'ar' ? 'الإشعارات' : 'Notifications'} title={locale === 'ar' ? 'الإشعارات' : 'Notifications'} onClick={() => setNotificationsOpen(true)}><Icon name="bell" /></button> : null}
        </div>
      </header>
      <main className="v7-content">{children}</main>
    </div>
    {canViewNotifications ? <NotificationCenter open={notificationsOpen} onClose={() => setNotificationsOpen(false)} workspace={workspace} locale={locale} /> : null}
  </div>;
}
