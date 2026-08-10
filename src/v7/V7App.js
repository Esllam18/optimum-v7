'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api, ApiError } from './lib/api';
import { V7_CONFIG } from './lib/config';
import { bootstrapWorkspace } from './lib/workspace';
import { tx } from './lib/i18n';
import Shell from './components/Shell';
import Icon from './components/Icon';
import { Button, ErrorState, Skeleton } from './components/Primitives';
import V7ErrorBoundary from './components/V7ErrorBoundary';
import { telemetry } from './lib/telemetry';

const RouteLoading = () => <div className="v7-route-loading"><Skeleton lines={7} /></div>;
const lazyPage = (loader) => dynamic(loader, { loading: RouteLoading });

const SearchCommand = dynamic(() => import('./components/SearchCommand'), { ssr: false });
const InviteActivation = dynamic(() => import('./components/InviteActivation'), { ssr: false, loading: RouteLoading });
const FirstLoginSecurity = dynamic(() => import('./components/FirstLoginSecurity'), { ssr: false, loading: RouteLoading });
const DashboardPage = lazyPage(() => import('./pages/DashboardPage'));
const ProjectsPage = lazyPage(() => import('./pages/ProjectsPage'));
const ProjectDetailPage = lazyPage(() => import('./pages/ProjectDetailPage'));
const WorkPage = lazyPage(() => import('./pages/WorkPage'));
const DocumentsPage = lazyPage(() => import('./pages/DocumentsPage'));
const EngineeringPage = lazyPage(() => import('./pages/EngineeringPage'));
const PeoplePage = lazyPage(() => import('./pages/PeoplePage'));
const DeliveryPage = lazyPage(() => import('./pages/DeliveryPage'));
const ControlPage = lazyPage(() => import('./pages/ControlPage'));
const CalendarPage = lazyPage(() => import('./pages/CalendarPage'));
const OrganizationPage = lazyPage(() => import('./pages/OrganizationPage'));
const RolesPage = lazyPage(() => import('./pages/RolesPage'));
const ActivityPage = lazyPage(() => import('./pages/ActivityPage'));
const SettingsPage = lazyPage(() => import('./pages/SettingsPage'));
const TrashPage = lazyPage(() => import('./pages/TrashPage'));
const WorkIntelligencePage = lazyPage(() => import('./pages/WorkIntelligencePage'));

function Login({ locale, setLocale, theme, setTheme, onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try { await api.signIn(email, password); await onSignedIn(); }
    catch (err) { setError(err.message || 'Sign in failed'); }
    finally { setLoading(false); }
  };
  return <div className="v7-login" dir={locale === 'ar' ? 'rtl' : 'ltr'} data-theme={theme}>
    <section className="v7-login-story"><div className="v7-login-brand"><span>O</span><strong>Optimum</strong></div><div><span className="v7-eyebrow">{locale === 'ar' ? 'نظام تشغيل التسليم' : 'DELIVERY OPERATING SYSTEM'}</span><h1>{locale === 'ar' ? <>تسليم المشاريع،<br/>بدون ضوضاء التشغيل.</> : <>Project delivery,<br/>without the operational noise.</>}</h1><p>{tx(locale, 'loginSub')}</p></div><div className="v7-login-points"><span><Icon name="folder" /> {locale === 'ar' ? 'المستندات والإصدارات' : 'CDE & versions'}</span><span><Icon name="check" /> {locale === 'ar' ? 'العمل والاعتمادات' : 'Work & approvals'}</span><span><Icon name="drafting" /> {locale === 'ar' ? 'CAD والحصر' : 'CAD & takeoff'}</span><span><Icon name="delivery" /> {locale === 'ar' ? 'تسليم المواقع' : 'Site delivery'}</span></div></section>
    <section className="v7-login-form-wrap"><div className="v7-login-actions"><button type="button" aria-label={locale === 'ar' ? 'تغيير اللغة' : 'Change language'} onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}><Icon name="globe" /></button><button type="button" aria-label={locale === 'ar' ? 'تغيير المظهر' : 'Change theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><Icon name="sun" /></button></div><form className="v7-login-card" onSubmit={submit}><span className="v7-eyebrow">{locale === 'ar' ? 'مساحة عمل خاصة' : 'PRIVATE WORKSPACE'}</span><h2>{tx(locale, 'loginTitle')}</h2><p>{tx(locale, 'loginSub')}</p><label><span>{tx(locale, 'email')}</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label><label><span>{tx(locale, 'password')}</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></label>{error ? <div className="v7-form-error">{error}</div> : null}<Button type="submit" variant="primary" className="v7-login-submit" disabled={loading}>{loading ? tx(locale, 'loading') : tx(locale, 'signIn')}</Button></form></section>
  </div>;
}

export default function V7App() {
  const pathname = usePathname();
  const [workspace, setWorkspace] = useState(null);
  const [bootError, setBootError] = useState(null);
  const [booting, setBooting] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [locale, setLocaleState] = useState('ar');
  const [theme, setThemeState] = useState('dark');

  const setLocale = (value) => { setLocaleState(value); localStorage.setItem(V7_CONFIG.localeKey, value); document.documentElement.lang = value; document.documentElement.dir = value === 'ar' ? 'rtl' : 'ltr'; };
  const setTheme = (value) => { setThemeState(value); localStorage.setItem(V7_CONFIG.themeKey, value); document.documentElement.dataset.theme = value; };

  const boot = async (companyId = null) => {
    setBooting(true); setBootError(null);
    try {
      api.init();
      if (!api.session) { setWorkspace(null); return; }
      const ws = await bootstrapWorkspace(companyId);
      setWorkspace(ws);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) { setWorkspace(null); }
      else setBootError(error);
    } finally { setBooting(false); }
  };

  useEffect(() => {
    api.init();
    telemetry.init(api);
    const savedLocale = localStorage.getItem(V7_CONFIG.localeKey) || 'ar';
    const savedTheme = localStorage.getItem(V7_CONFIG.themeKey) || 'dark';
    setLocale(savedLocale); setTheme(savedTheme);
    boot();
  }, []);

  useEffect(() => {
    const keydown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    addEventListener('keydown', keydown);
    return () => removeEventListener('keydown', keydown);
  }, []);

  useEffect(() => { telemetry.setWorkspace(workspace); }, [workspace]);

  const route = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean).slice(1);
    if (!parts.length) return { key: 'overview' };
    if (parts[0] === 'projects' && parts[1]) return { key: 'project-detail', id: parts[1] };
    return { key: parts[0] };
  }, [pathname]);

  if (booting) return <div className="v7-boot" data-theme={theme}><div className="v7-boot-brand">O</div><Skeleton lines={3} /></div>;
  if (route.key === 'invite') return <InviteActivation locale={locale} setLocale={setLocale} theme={theme} setTheme={setTheme} onCompleted={() => boot()} />;
  if (bootError) return <div className="v7-boot" data-theme={theme}><ErrorState title={tx(locale, 'networkIssue')} description={bootError.message} retryLabel={tx(locale, 'retry')} onRetry={() => boot()} /></div>;
  if (!api.session || !workspace) return <Login locale={locale} setLocale={setLocale} theme={theme} setTheme={setTheme} onSignedIn={boot} />;
  if (workspace.requiresSecuritySetup) return <FirstLoginSecurity workspace={workspace} locale={locale} setLocale={setLocale} theme={theme} setTheme={setTheme} onCompleted={() => boot()} />;
  if (!workspace.company) return <div className="v7-boot" data-theme={theme}><ErrorState title={locale === 'ar' ? 'لا توجد مساحة عمل فعالة' : 'No active workspace'} description={locale === 'ar' ? 'حسابك مسجل، لكن لا توجد عضوية شركة فعالة متاحة الآن. اطلب من مسؤول الشركة تفعيل العضوية أو إرسال دعوة جديدة.' : 'Your account is signed in, but no active company membership is currently available. Ask a company administrator to activate your membership or send a new invitation.'} /></div>;

  const page = route.key === 'overview' ? <DashboardPage workspace={workspace} locale={locale} />
    : route.key === 'projects' ? <ProjectsPage workspace={workspace} locale={locale} />
    : route.key === 'project-detail' ? <ProjectDetailPage workspace={workspace} projectId={route.id} locale={locale} />
    : route.key === 'work' ? <WorkPage workspace={workspace} locale={locale} />
    : route.key === 'documents' ? <DocumentsPage workspace={workspace} locale={locale} />
    : route.key === 'engineering' ? <EngineeringPage workspace={workspace} locale={locale} />
    : route.key === 'people' ? <PeoplePage workspace={workspace} locale={locale} />
    : route.key === 'delivery' ? <DeliveryPage workspace={workspace} locale={locale} />
    : route.key === 'control' ? <ControlPage workspace={workspace} locale={locale} />
    : route.key === 'calendar' ? <CalendarPage workspace={workspace} locale={locale} />
    : route.key === 'organization' ? <OrganizationPage workspace={workspace} locale={locale} />
    : route.key === 'roles' ? <RolesPage workspace={workspace} locale={locale} />
    : route.key === 'activity' ? <ActivityPage workspace={workspace} locale={locale} />
    : route.key === 'settings' ? <SettingsPage workspace={workspace} locale={locale} />
    : route.key === 'trash' ? <TrashPage workspace={workspace} locale={locale} />
    : route.key === 'work-intelligence' ? <WorkIntelligencePage workspace={workspace} locale={locale} />
    : <ErrorState title={tx(locale, 'routeNotReady')} description={tx(locale, 'routeNotReadySub')} />;

  return <V7ErrorBoundary locale={locale}>
    <Shell workspace={workspace} locale={locale} setLocale={setLocale} theme={theme} setTheme={setTheme} onCompanyChange={(id) => { api.clearReadCache(); boot(id); }} onSearch={() => setSearchOpen(true)}>{page}</Shell>
    {searchOpen ? <SearchCommand open={searchOpen} onClose={() => setSearchOpen(false)} companyId={workspace.company.id} locale={locale} /> : null}
  </V7ErrorBoundary>;
}
