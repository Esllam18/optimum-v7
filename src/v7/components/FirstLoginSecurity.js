'use client';

import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import Icon from './Icon';
import { Button } from './Primitives';

const rules = (value = '') => ({
  length: value.length >= 10,
  lower: /[a-z]/.test(value),
  upper: /[A-Z]/.test(value),
  number: /\d/.test(value),
  symbol: /[^A-Za-z0-9]/.test(value)
});

export default function FirstLoginSecurity({ workspace, locale, setLocale, theme, setTheme, onCompleted }) {
  const profile = workspace?.profile || {};
  const [fullName, setFullName] = useState(profile.full_name || workspace?.user?.email?.split('@')[0] || '');
  const [phone, setPhone] = useState(profile.phone || '');
  const [whatsapp, setWhatsapp] = useState(profile.whatsapp || '');
  const [timezone, setTimezone] = useState(profile.timezone || 'Africa/Cairo');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const checks = useMemo(() => rules(password), [password]);
  const strong = Object.values(checks).every(Boolean);

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    if (!strong) return setError(locale === 'ar' ? 'كلمة المرور لا تحقق متطلبات الأمان.' : 'The password does not meet the security requirements.');
    if (password !== confirmPassword) return setError(locale === 'ar' ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.');
    if (!acceptTerms) return setError(locale === 'ar' ? 'يجب الموافقة على شروط الاستخدام وسياسة الخصوصية.' : 'You must accept the terms of use and privacy policy.');
    setSaving(true);
    try {
      const result = await api.invokeFunction('identity-provisioning-v55', {
        action: 'complete_first_login', password, full_name: fullName, phone: phone || null,
        whatsapp: whatsapp || null, timezone, accept_terms: true, recovery: false
      });
      api.clearReadCache();
      if (result?.session_preserved === false) {
        await api.signOut().catch(() => {});
        location.assign('/v7');
        return;
      }
      await api.getUser().catch(() => null);
      await onCompleted?.();
    } catch (err) {
      setError(err?.message || (locale === 'ar' ? 'تعذر تأمين الحساب.' : 'Could not secure the account.'));
    } finally { setSaving(false); }
  };

  const ruleLabel = (ok, ar, en) => <span className={ok ? 'is-ok' : ''}><Icon name={ok ? 'check' : 'circle'} size={13} />{locale === 'ar' ? ar : en}</span>;

  return <div className="v7-login v7-first-login" dir={locale === 'ar' ? 'rtl' : 'ltr'} data-theme={theme}>
    <section className="v7-login-story"><div className="v7-login-brand"><span>O</span><strong>Optimum</strong></div><div><span className="v7-eyebrow">FIRST LOGIN SECURITY</span><h1>{locale === 'ar' ? 'أمّن حسابك قبل دخول مساحة العمل.' : 'Secure your account before entering the workspace.'}</h1><p>{locale === 'ar' ? 'خطوة إلزامية مرة واحدة لتحديد كلمة مرورك الخاصة ومراجعة بياناتك الأساسية. تتم بالكامل داخل V7.' : 'A one-time required step to choose your private password and review your basic profile. It is completed entirely inside V7.'}</p></div><div className="v7-login-points"><span><Icon name="shield" /> {locale === 'ar' ? 'تغيير آمن لكلمة المرور' : 'Secure password change'}</span><span><Icon name="check" /> {locale === 'ar' ? 'تحديث ملفك الأساسي' : 'Profile confirmation'}</span><span><Icon name="lock" /> {locale === 'ar' ? 'فتح المساحة بعد الإكمال فقط' : 'Workspace unlock after completion'}</span></div></section>
    <section className="v7-login-form-wrap"><div className="v7-login-actions"><button type="button" aria-label={locale === 'ar' ? 'تغيير اللغة' : 'Change language'} onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}><Icon name="globe" /></button><button type="button" aria-label={locale === 'ar' ? 'تغيير المظهر' : 'Change theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><Icon name="sun" /></button></div>
      <form className="v7-login-card v7-security-card" onSubmit={submit}><span className="v7-eyebrow">ACCOUNT SECURITY</span><h2>{locale === 'ar' ? `مرحبًا ${fullName || ''}` : `Welcome ${fullName || ''}`}</h2><p className="v7-security-email" dir="ltr">{workspace?.user?.email}</p>
        <div className="v7-security-profile-grid"><label><span>{locale === 'ar' ? 'الاسم الكامل' : 'Full name'}</span><input value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" required /></label><label><span>{locale === 'ar' ? 'المنطقة الزمنية' : 'Timezone'}</span><select value={timezone} onChange={e => setTimezone(e.target.value)}><option value="Africa/Cairo">Africa/Cairo</option><option value="Asia/Riyadh">Asia/Riyadh</option><option value="Asia/Dubai">Asia/Dubai</option><option value="UTC">UTC</option></select></label><label><span>{locale === 'ar' ? 'الهاتف' : 'Phone'}</span><input value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" dir="ltr" /></label><label><span>WhatsApp</span><input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} dir="ltr" /></label></div>
        <div className="v7-security-password-grid"><label><span>{locale === 'ar' ? 'كلمة المرور الجديدة' : 'New password'}</span><input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required /></label><label><span>{locale === 'ar' ? 'تأكيد كلمة المرور' : 'Confirm password'}</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required /></label></div>
        <div className="v7-password-rules">{ruleLabel(checks.length, '10 أحرف على الأقل', 'At least 10 characters')}{ruleLabel(checks.lower && checks.upper, 'حروف كبيرة وصغيرة', 'Upper & lower case')}{ruleLabel(checks.number, 'رقم واحد على الأقل', 'At least one number')}{ruleLabel(checks.symbol, 'رمز خاص', 'A special symbol')}</div>
        <label className="v7-terms"><input type="checkbox" checked={acceptTerms} onChange={e => setAcceptTerms(e.target.checked)} /><span>{locale === 'ar' ? 'أوافق على شروط الاستخدام وسياسة الخصوصية الخاصة بمنصة Optimum.' : 'I accept the Optimum terms of use and privacy policy.'}</span></label>
        {error ? <div className="v7-form-error">{error}</div> : null}<Button type="submit" variant="primary" className="v7-login-submit" disabled={saving}>{saving ? (locale === 'ar' ? 'جارٍ تأمين الحساب…' : 'Securing account…') : (locale === 'ar' ? 'تأمين الحساب وفتح المساحة' : 'Secure account & open workspace')}</Button>
      </form>
    </section>
  </div>;
}
