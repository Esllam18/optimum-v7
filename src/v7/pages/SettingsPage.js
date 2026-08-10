'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { can } from '../lib/workspace';
import Icon from '../components/Icon';
import BrandAvatar from '../components/BrandAvatar';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Panel, Skeleton, Stat } from '../components/Primitives';

const tabs = [
  ['overview','grid','نظرة عامة','Overview'], ['profile','users','حسابي','My profile'], ['company','briefcase','بيانات الشركة','Company'], ['branding','drafting','الهوية البصرية','Branding'], ['subscription','trend','الاشتراك والاستخدام','Subscription']
];

export default function SettingsPage({ workspace, locale }) {
  const router = useRouter();
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [company, setCompany] = useState({});
  const [branding, setBranding] = useState({});
  const [profile, setProfile] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const canManageCompany = can(workspace, 'company.manage');
  const canManageBrand = can(workspace, 'branding.manage') || canManageCompany;

  useEffect(() => {
    const c = new AbortController(); setError(null);
    Promise.all([
      api.select('companies', { filters:{ id:`eq.${workspace.company.id}` }, limit:1, cacheTtlMs:20_000, signal:c.signal }),
      api.select('company_branding', { filters:{ company_id:`eq.${workspace.company.id}` }, limit:1, cacheTtlMs:20_000, signal:c.signal }).catch(() => []),
      api.select('profiles', { filters:{ id:`eq.${workspace.user.id}` }, limit:1, cacheTtlMs:20_000, signal:c.signal }).catch(() => []),
      api.select('company_subscriptions', { filters:{ company_id:`eq.${workspace.company.id}` }, limit:1, cacheTtlMs:20_000, signal:c.signal }).catch(() => []),
      api.rpc('organization_health_snapshot', { p_company_id:workspace.company.id }, { cacheTtlMs:20_000, signal:c.signal, dedupe:true }).catch(() => null)
    ]).then(async ([companies, brandingRows, profiles, subs, health]) => {
      const sub = subs[0] || null;
      let plan = null;
      if (sub?.plan_id) plan = (await api.select('service_plans', { filters:{ id:`eq.${sub.plan_id}` }, limit:1, cacheTtlMs:60_000, signal:c.signal }).catch(() => []))[0] || null;
      const cRow = companies[0] || workspace.company, bRow = brandingRows[0] || workspace.branding || {}, pRow = profiles[0] || workspace.profile || {};
      setCompany(cRow); setBranding(bRow); setProfile(pRow); setData({ subscription:sub, plan, health });
    }).catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => c.abort();
  }, [workspace.company.id, workspace.user.id, reload]);

  const companyCompleteness = useMemo(() => {
    const keys = ['name','legal_name','official_email','phone','country_code','city','address','industry','registration_number','tax_number'];
    return Math.round(keys.filter(key => String(company?.[key] || '').trim()).length / keys.length * 100);
  }, [company]);

  const saveCompany = async () => {
    setSaving(true); setError(null);
    try {
      const allowed = ['name','legal_name','short_code','official_email','phone','whatsapp','country_code','city','address','website','industry','registration_number','tax_number','primary_contact_name','primary_contact_email','primary_contact_phone','billing_contact_name','billing_contact_email','billing_contact_phone','technical_contact_name','technical_contact_email','technical_contact_phone','timezone'];
      const payload = Object.fromEntries(allowed.map(key => [key, company[key] === '' ? null : company[key]]));
      await api.update('companies', payload, { filters:{ id:`eq.${workspace.company.id}` } }); setReload(x => x + 1);
    } catch (err) { setError(err); }
    finally { setSaving(false); }
  };

  const saveBranding = async () => {
    setSaving(true); setError(null);
    try {
      await api.rpc('save_company_branding', { p_company_id:workspace.company.id, p_branding:{
        app_name:branding.app_name || workspace.company.name,
        tagline:branding.tagline || null,
        primary_color:branding.primary_color || '#4f46e5', accent_color:branding.accent_color || '#14b8a6', neutral_color:branding.neutral_color || '#64748b',
        default_theme:branding.default_theme || 'dark', sidebar_style:branding.sidebar_style || 'glass', radius_style:branding.radius_style || 'rounded', density:branding.density || 'comfortable', logo_shape:branding.logo_shape || 'rounded',
        logo_path:branding.logo_path || null, favicon_path:branding.favicon_path || null, cover_path:branding.cover_path || null
      } }); api.clearReadCache(); setReload(x => x + 1);
    } catch (err) { setError(err); }
    finally { setSaving(false); }
  };

  const saveProfile = async () => {
    setSaving(true); setError(null);
    try { await api.update('profiles', { full_name:profile.full_name || null, phone:profile.phone || null, whatsapp:profile.whatsapp || null, timezone:profile.timezone || null, preferred_locale:profile.preferred_locale || locale, preferred_theme:profile.preferred_theme || 'dark' }, { filters:{ id:`eq.${workspace.user.id}` } }); setReload(x => x + 1); }
    catch (err) { setError(err); }
    finally { setSaving(false); }
  };

  if (error && !data) return <ErrorState title={locale === 'ar' ? 'تعذر تحميل الإعدادات' : 'Settings could not be loaded'} description={error.message} retryLabel={locale === 'ar' ? 'إعادة المحاولة' : 'Retry'} onRetry={() => setReload(x => x + 1)} />;
  return <>
    <PageHeader eyebrow={locale === 'ar' ? 'إعدادات مساحة العمل' : 'WORKSPACE SETTINGS'} title={locale === 'ar' ? 'الإعدادات' : 'Settings'} description={locale === 'ar' ? 'حسابك، بيانات الشركة، الهوية البصرية، الاشتراك وروابط الحوكمة في مركز واحد.' : 'Your profile, company data, brand, subscription and governance links in one control center.'} />
    {error ? <div className="v7-inline-error">{error.message}</div> : null}
    <div className="v7-settings-layout">
      <aside className="v7-settings-nav"><div className="v7-settings-brand"><BrandAvatar path={branding.logo_path} name={branding.app_name || company.name || 'Optimum'} size={44} /><div><strong>{branding.app_name || company.name || 'Optimum'}</strong><small>{company.slug || 'workspace'}</small></div></div>{tabs.map(([key,icon,ar,en]) => <button key={key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}><Icon name={icon} size={17} /><span>{locale === 'ar' ? ar : en}</span><Icon name="chevron" size={14} /></button>)}<div className="v7-settings-links"><button onClick={() => router.push('/v7/organization')}><Icon name="layers" size={15} />{locale === 'ar' ? 'نظام المؤسسة' : 'Organization OS'}</button><button onClick={() => router.push('/v7/roles')}><Icon name="shield" size={15} />{locale === 'ar' ? 'الأدوار والصلاحيات' : 'Roles & permissions'}</button><button onClick={() => router.push('/v7/activity')}><Icon name="activity" size={15} />{locale === 'ar' ? 'سجل النشاط' : 'Activity log'}</button></div></aside>
      <section className="v7-settings-main">
        {!data ? <Skeleton lines={12} /> : tab === 'overview' ? <>
          <section className="v7-settings-hero"><div><BrandAvatar path={branding.logo_path} name={branding.app_name || company.name} size={64} /><div><span className="v7-eyebrow">ORGANIZATION CONTROL CENTER</span><h2>{company.name}</h2><p>{branding.tagline || (locale === 'ar' ? 'إدارة الشركة أصبحت أبسط وأوضح.' : 'Organization management, simplified.')}</p></div></div><strong>{data.health?.score ?? companyCompleteness}%<small>{locale === 'ar' ? 'صحة الإعداد' : 'Setup health'}</small></strong></section>
          <section className="v7-settings-stats"><Stat icon="briefcase" label={locale === 'ar' ? 'اكتمال بيانات الشركة' : 'Company completeness'} value={`${companyCompleteness}%`} /><Stat icon="shield" label={locale === 'ar' ? 'الأدوار' : 'Roles'} value={data.health?.metrics?.roles ?? '—'} /><Stat icon="users" label={locale === 'ar' ? 'الأعضاء النشطون' : 'Active members'} value={data.health?.metrics?.active_members ?? '—'} /><Stat icon="folder" label={locale === 'ar' ? 'المشاريع' : 'Projects'} value={data.health?.metrics?.projects ?? '—'} /></section>
          <Panel title={locale === 'ar' ? 'إجراءات الإدارة السريعة' : 'Administrative shortcuts'}><div className="v7-settings-launch"><button onClick={() => setTab('company')}><Icon name="briefcase" /><div><strong>{locale === 'ar' ? 'بيانات الشركة' : 'Company profile'}</strong><small>{companyCompleteness}%</small></div><Icon name="chevron" /></button><button onClick={() => setTab('branding')}><Icon name="drafting" /><div><strong>{locale === 'ar' ? 'الهوية والتجربة' : 'Brand experience'}</strong><small>{locale === 'ar' ? 'ألوان وواجهة' : 'Colors & UI'}</small></div><Icon name="chevron" /></button><button onClick={() => router.push('/v7/roles')}><Icon name="shield" /><div><strong>{locale === 'ar' ? 'الأدوار والصلاحيات' : 'Roles & permissions'}</strong><small>{data.health?.metrics?.roles ?? '—'}</small></div><Icon name="chevron" /></button><button onClick={() => router.push('/v7/organization')}><Icon name="layers" /><div><strong>{locale === 'ar' ? 'الهيكل التنظيمي' : 'Organization structure'}</strong><small>{data.health?.metrics?.units ?? '—'}</small></div><Icon name="chevron" /></button></div></Panel>
        </> : tab === 'profile' ? <Panel title={locale === 'ar' ? 'ملفي الشخصي' : 'My profile'} action={<Button icon="save" onClick={saveProfile} disabled={saving}>{locale === 'ar' ? 'حفظ' : 'Save'}</Button>}><div className="v7-form-stack"><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'الاسم' : 'Name'}</span><input value={profile.full_name || ''} onChange={e => setProfile(x => ({...x,full_name:e.target.value}))} /></label><label><span>{locale === 'ar' ? 'البريد' : 'Email'}</span><input value={workspace.user.email || ''} disabled /></label></div><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'الهاتف' : 'Phone'}</span><input value={profile.phone || ''} onChange={e => setProfile(x => ({...x,phone:e.target.value}))} /></label><label><span>{locale === 'ar' ? 'واتساب' : 'WhatsApp'}</span><input value={profile.whatsapp || ''} onChange={e => setProfile(x => ({...x,whatsapp:e.target.value}))} /></label></div><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'المنطقة الزمنية' : 'Timezone'}</span><input value={profile.timezone || ''} onChange={e => setProfile(x => ({...x,timezone:e.target.value}))} /></label><label><span>{locale === 'ar' ? 'اللغة المفضلة' : 'Preferred language'}</span><select value={profile.preferred_locale || locale} onChange={e => setProfile(x => ({...x,preferred_locale:e.target.value}))}><option value="ar">العربية</option><option value="en">English</option></select></label></div></div></Panel>
        : tab === 'company' ? <Panel title={locale === 'ar' ? 'بيانات الشركة' : 'Company profile'} action={canManageCompany ? <Button icon="save" onClick={saveCompany} disabled={saving}>{locale === 'ar' ? 'حفظ التغييرات' : 'Save changes'}</Button> : null}><div className="v7-form-stack"><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'الاسم التجاري' : 'Trading name'}</span><input value={company.name || ''} onChange={e => setCompany(x => ({...x,name:e.target.value}))} /></label><label><span>{locale === 'ar' ? 'الاسم القانوني' : 'Legal name'}</span><input value={company.legal_name || ''} onChange={e => setCompany(x => ({...x,legal_name:e.target.value}))} /></label></div><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'البريد الرسمي' : 'Official email'}</span><input type="email" value={company.official_email || ''} onChange={e => setCompany(x => ({...x,official_email:e.target.value}))} /></label><label><span>{locale === 'ar' ? 'الهاتف' : 'Phone'}</span><input value={company.phone || ''} onChange={e => setCompany(x => ({...x,phone:e.target.value}))} /></label></div><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'المدينة' : 'City'}</span><input value={company.city || ''} onChange={e => setCompany(x => ({...x,city:e.target.value}))} /></label><label><span>{locale === 'ar' ? 'الدولة' : 'Country code'}</span><input value={company.country_code || ''} onChange={e => setCompany(x => ({...x,country_code:e.target.value.toUpperCase()}))} /></label></div><label><span>{locale === 'ar' ? 'العنوان' : 'Address'}</span><input value={company.address || ''} onChange={e => setCompany(x => ({...x,address:e.target.value}))} /></label><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'النشاط' : 'Industry'}</span><input value={company.industry || ''} onChange={e => setCompany(x => ({...x,industry:e.target.value}))} /></label><label><span>{locale === 'ar' ? 'الموقع الإلكتروني' : 'Website'}</span><input value={company.website || ''} onChange={e => setCompany(x => ({...x,website:e.target.value}))} /></label></div><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'السجل التجاري' : 'Registration number'}</span><input value={company.registration_number || ''} onChange={e => setCompany(x => ({...x,registration_number:e.target.value}))} /></label><label><span>{locale === 'ar' ? 'الرقم الضريبي' : 'Tax number'}</span><input value={company.tax_number || ''} onChange={e => setCompany(x => ({...x,tax_number:e.target.value}))} /></label></div></div></Panel>
        : tab === 'branding' ? <Panel title={locale === 'ar' ? 'الهوية البصرية وتجربة الواجهة' : 'Branding & interface'} action={canManageBrand ? <Button icon="save" onClick={saveBranding} disabled={saving}>{locale === 'ar' ? 'حفظ الهوية' : 'Save branding'}</Button> : null}><div className="v7-branding-preview" style={{ '--preview-primary':branding.primary_color || '#4f46e5', '--preview-accent':branding.accent_color || '#14b8a6' }}><BrandAvatar path={branding.logo_path} name={branding.app_name || company.name} size={56} /><div><strong>{branding.app_name || company.name}</strong><small>{branding.tagline || (locale === 'ar' ? 'سطر تعريفي للشركة' : 'Company tagline')}</small></div></div><div className="v7-form-stack"><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'اسم التطبيق' : 'App name'}</span><input value={branding.app_name || ''} onChange={e => setBranding(x => ({...x,app_name:e.target.value}))} /></label><label><span>{locale === 'ar' ? 'السطر التعريفي' : 'Tagline'}</span><input value={branding.tagline || ''} onChange={e => setBranding(x => ({...x,tagline:e.target.value}))} /></label></div><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'اللون الرئيسي' : 'Primary color'}</span><input type="color" value={branding.primary_color || '#4f46e5'} onChange={e => setBranding(x => ({...x,primary_color:e.target.value}))} /></label><label><span>{locale === 'ar' ? 'لون التمييز' : 'Accent color'}</span><input type="color" value={branding.accent_color || '#14b8a6'} onChange={e => setBranding(x => ({...x,accent_color:e.target.value}))} /></label></div><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'المظهر الافتراضي' : 'Default theme'}</span><select value={branding.default_theme || 'dark'} onChange={e => setBranding(x => ({...x,default_theme:e.target.value}))}><option value="dark">{locale === 'ar' ? 'داكن' : 'Dark'}</option><option value="light">{locale === 'ar' ? 'فاتح' : 'Light'}</option></select></label><label><span>{locale === 'ar' ? 'كثافة الواجهة' : 'Density'}</span><select value={branding.density || 'comfortable'} onChange={e => setBranding(x => ({...x,density:e.target.value}))}><option value="comfortable">{locale === 'ar' ? 'مريحة' : 'Comfortable'}</option><option value="compact">{locale === 'ar' ? 'مضغوطة' : 'Compact'}</option></select></label></div></div></Panel>
        : <Panel title={locale === 'ar' ? 'الاشتراك والاستخدام' : 'Subscription & usage'}><div className="v7-subscription-card"><span className="v7-eyebrow">{data.plan?.code || data.subscription?.status || 'PLAN'}</span><h2>{locale === 'ar' ? data.plan?.name_ar : data.plan?.name_en || data.plan?.code || (locale === 'ar' ? 'الخطة الحالية' : 'Current plan')}</h2><p>{locale === 'ar' ? data.plan?.description_ar : data.plan?.description_en}</p><div><span><small>{locale === 'ar' ? 'الأعضاء' : 'Members'}</small><strong>{data.subscription?.max_members_override ?? data.plan?.max_members ?? '∞'}</strong></span><span><small>{locale === 'ar' ? 'المشاريع' : 'Projects'}</small><strong>{data.subscription?.max_projects_override ?? data.plan?.max_projects ?? '∞'}</strong></span><span><small>{locale === 'ar' ? 'الحالة' : 'Status'}</small><strong>{data.subscription?.status || '—'}</strong></span><span><small>{locale === 'ar' ? 'الدفع' : 'Payment'}</small><strong>{data.subscription?.payment_status || '—'}</strong></span></div></div>{data.subscription ? <div className="v7-settings-note"><Icon name="info" size={16} /><span>{locale === 'ar' ? 'تعديل حدود الباقة أو الدفع يظل من أدوات الإدارة المخولة فقط؛ الشاشة هنا تعرض العقد التشغيلي الحالي بدون تخمين.' : 'Plan limits and payment remain restricted administration actions; this screen reflects the current contract without guessing.'}</span></div> : <EmptyState icon="trend" title={locale === 'ar' ? 'لا توجد بيانات اشتراك متاحة' : 'No subscription data available'} />}</Panel>}
      </section>
    </div>
  </>;
}
