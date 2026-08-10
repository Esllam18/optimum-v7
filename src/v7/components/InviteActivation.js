'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import Icon from './Icon';
import { Button, Skeleton } from './Primitives';

const sameEmail = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const strongPassword = (value) => String(value || '').length >= 10 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);

export default function InviteActivation({ locale, setLocale, theme, setTheme, onCompleted }) {
  const [token, setToken] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [capturedAuth, setCapturedAuth] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [existingHint, setExistingHint] = useState(false);
  const [sessionVersion, setSessionVersion] = useState(0);

  const user = api.user;
  const invitedEmail = preview?.email || '';
  const conflict = Boolean(user?.email && invitedEmail && !sameEmail(user.email, invitedEmail));
  const correctSession = Boolean(user?.email && invitedEmail && sameEmail(user.email, invitedEmail));
  const needsPasswordSetup = correctSession && capturedAuth && !existingHint;

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError('');
      try {
        api.init();
        const params = new URLSearchParams(location.search);
        const inviteToken = String(params.get('invite') || '').trim();
        const existing = params.get('existing') === '1';
        if (!inviteToken || inviteToken.length < 32) throw new Error(locale === 'ar' ? 'رابط الدعوة غير صالح.' : 'The invitation link is invalid.');
        setToken(inviteToken); setExistingHint(existing);
        const captured = await api.captureSessionFromUrl();
        if (captured) setCapturedAuth(true);
        const data = await api.rpc('invitation_preview', { p_token: inviteToken });
        if (!data?.valid) throw new Error(locale === 'ar' ? 'انتهت صلاحية الدعوة أو تم استخدامها بالفعل.' : 'This invitation has expired or was already used.');
        if (!alive) return;
        setPreview(data);
        if (api.accessToken && !api.user) await api.getUser();
        setSessionVersion(v => v + 1);
      } catch (err) {
        if (alive) setError(err.message || (locale === 'ar' ? 'تعذر فتح الدعوة.' : 'Could not open the invitation.'));
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const companyRole = useMemo(() => {
    if (!preview) return '';
    return locale === 'ar' ? (preview.role_ar || preview.role_en || '') : (preview.role_en || preview.role_ar || '');
  }, [preview, locale]);

  const accept = async () => {
    if (!token) return;
    await api.rpc('accept_company_invitation', { p_token: token });
    api.clearReadCache();
    setDone(true);
  };

  const createPassword = async (event) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    if (!strongPassword(password)) {
      setError(locale === 'ar' ? 'استخدم 10 أحرف على الأقل مع حرف كبير وصغير ورقم ورمز.' : 'Use at least 10 characters with uppercase, lowercase, a number, and a symbol.');
      return;
    }
    if (password !== confirmPassword) {
      setError(locale === 'ar' ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await api.updateCurrentUser({ password });
      await accept();
    } catch (err) { setError(err.message || (locale === 'ar' ? 'تعذر إكمال التفعيل.' : 'Could not complete activation.')); }
    finally { setSaving(false); }
  };

  const signInAndAccept = async (event) => {
    event.preventDefault();
    if (saving || !invitedEmail) return;
    setSaving(true); setError('');
    try {
      await api.signIn(invitedEmail, password);
      const signed = await api.getUser();
      if (!sameEmail(signed?.email, invitedEmail)) throw new Error(locale === 'ar' ? 'تم تسجيل الدخول بحساب مختلف عن الدعوة.' : 'The signed-in account does not match this invitation.');
      setSessionVersion(v => v + 1);
      await accept();
    } catch (err) { setError(err.message || (locale === 'ar' ? 'تعذر تسجيل الدخول وقبول الدعوة.' : 'Could not sign in and accept the invitation.')); }
    finally { setSaving(false); }
  };

  const acceptExistingSession = async () => {
    setSaving(true); setError('');
    try { await accept(); }
    catch (err) { setError(err.message || (locale === 'ar' ? 'تعذر قبول الدعوة.' : 'Could not accept the invitation.')); }
    finally { setSaving(false); }
  };

  const switchAccount = async () => {
    setSaving(true); setError('');
    try { await api.signOut(); setCapturedAuth(false); setPassword(''); setConfirmPassword(''); setSessionVersion(v => v + 1); }
    finally { setSaving(false); }
  };

  const finish = async () => {
    await onCompleted?.();
    location.assign('/v7');
  };

  return <div className="v7-login v7-invite-activation" dir={locale === 'ar' ? 'rtl' : 'ltr'} data-theme={theme}>
    <section className="v7-login-story"><div className="v7-login-brand"><span>O</span><strong>Optimum</strong></div><div><span className="v7-eyebrow">SECURE WORKSPACE INVITATION</span><h1>{locale === 'ar' ? 'دعوتك إلى مساحة العمل، بخطوة آمنة واحدة.' : 'Your workspace invitation, one secure step away.'}</h1><p>{locale === 'ar' ? 'تأكد من بيانات الدعوة ثم ثبّت حسابك أو سجّل الدخول بحسابك الحالي. لا يرسل Optimum كلمات مرور مؤقتة في V7.' : 'Verify the invitation, then secure a new account or sign in with your existing one. Optimum V7 does not send temporary passwords.'}</p></div><div className="v7-login-points"><span><Icon name="shield" /> {locale === 'ar' ? 'دعوة مرتبطة بالبريد' : 'Email-bound invitation'}</span><span><Icon name="check" /> {locale === 'ar' ? 'كلمة المرور يحددها المستخدم' : 'User-chosen password'}</span><span><Icon name="users" /> {locale === 'ar' ? 'الدور يطبّق بعد القبول' : 'Role applied on acceptance'}</span></div></section>
    <section className="v7-login-form-wrap">
      <div className="v7-login-actions"><button type="button" aria-label={locale === 'ar' ? 'تغيير اللغة' : 'Change language'} onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}><Icon name="globe" /></button><button type="button" aria-label={locale === 'ar' ? 'تغيير المظهر' : 'Change theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><Icon name="sun" /></button></div>
      <div className="v7-login-card">
        {loading ? <><span className="v7-eyebrow">VERIFYING INVITATION</span><Skeleton lines={5} /></> : error && !preview ? <><span className="v7-eyebrow">INVITATION</span><h2>{locale === 'ar' ? 'تعذر فتح الدعوة' : 'Invitation unavailable'}</h2><div className="v7-form-error">{error}</div><Button type="button" onClick={() => location.assign('/v7')}>{locale === 'ar' ? 'العودة لتسجيل الدخول' : 'Back to sign in'}</Button></> : done ? <><span className="v7-eyebrow">ACTIVATION COMPLETE</span><h2>{locale === 'ar' ? 'تم تفعيل عضويتك' : 'Your membership is active'}</h2><p>{locale === 'ar' ? `تم ربط ${invitedEmail} بمساحة ${preview?.company_name || 'Optimum'}.` : `${invitedEmail} is now connected to ${preview?.company_name || 'Optimum'}.`}</p><Button type="button" variant="primary" icon="arrow" onClick={finish}>{locale === 'ar' ? 'فتح مساحة العمل' : 'Open workspace'}</Button></> : <>
          <span className="v7-eyebrow">INVITATION VERIFIED</span>
          <h2>{preview?.company_name || 'Optimum'}</h2>
          <div className="v7-invite-summary"><span><small>{locale === 'ar' ? 'البريد' : 'Email'}</small><strong dir="ltr">{invitedEmail}</strong></span><span><small>{locale === 'ar' ? 'الدور' : 'Role'}</small><strong>{companyRole || '—'}</strong></span></div>
          {error ? <div className="v7-form-error">{error}</div> : null}
          {conflict ? <div className="v7-form-stack"><div className="v7-form-error">{locale === 'ar' ? `أنت مسجل الآن بحساب ${user?.email}. هذه الدعوة تخص ${invitedEmail}.` : `You are signed in as ${user?.email}. This invitation belongs to ${invitedEmail}.`}</div><Button type="button" variant="primary" onClick={switchAccount} disabled={saving}>{locale === 'ar' ? 'تبديل الحساب' : 'Switch account'}</Button></div>
          : needsPasswordSetup ? <form className="v7-form-stack" onSubmit={createPassword}><p>{locale === 'ar' ? 'اختر كلمة مرورك الآن لإكمال إنشاء الحساب، ثم سيتم قبول عضوية الشركة تلقائيًا.' : 'Choose your password to finish creating the account; the company membership will then be accepted automatically.'}</p><label><span>{locale === 'ar' ? 'كلمة المرور الجديدة' : 'New password'}</span><input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required /></label><label><span>{locale === 'ar' ? 'تأكيد كلمة المرور' : 'Confirm password'}</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required /></label><small>{locale === 'ar' ? '10 أحرف على الأقل، حرف كبير وصغير، رقم ورمز.' : 'At least 10 characters with uppercase, lowercase, a number, and a symbol.'}</small><Button type="submit" variant="primary" disabled={saving}>{saving ? (locale === 'ar' ? 'جارٍ التفعيل…' : 'Activating…') : (locale === 'ar' ? 'تعيين كلمة المرور وقبول الدعوة' : 'Set password & accept invitation')}</Button></form>
          : correctSession ? <div className="v7-form-stack"><p>{locale === 'ar' ? 'الحساب المطابق للدعوة مسجل بالفعل. يمكنك قبول العضوية مباشرة.' : 'The matching account is already signed in. You can accept the membership now.'}</p><Button type="button" variant="primary" onClick={acceptExistingSession} disabled={saving}>{saving ? (locale === 'ar' ? 'جارٍ القبول…' : 'Accepting…') : (locale === 'ar' ? 'قبول الدعوة' : 'Accept invitation')}</Button></div>
          : <form className="v7-form-stack" onSubmit={signInAndAccept}><p>{locale === 'ar' ? 'هذا البريد لديه حساب Optimum قائم أو لم تبدأ جلسة التفعيل. سجّل الدخول بنفس البريد لقبول الدعوة.' : 'This email has an existing Optimum account, or the activation session has not started. Sign in with the invited email to accept.'}</p><label><span>{locale === 'ar' ? 'البريد' : 'Email'}</span><input type="email" value={invitedEmail} readOnly dir="ltr" /></label><label><span>{locale === 'ar' ? 'كلمة المرور' : 'Password'}</span><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label><Button type="submit" variant="primary" disabled={saving}>{saving ? (locale === 'ar' ? 'جارٍ تسجيل الدخول…' : 'Signing in…') : (locale === 'ar' ? 'تسجيل الدخول وقبول الدعوة' : 'Sign in & accept invitation')}</Button></form>}
        </>}
      </div>
    </section>
  </div>;
}
