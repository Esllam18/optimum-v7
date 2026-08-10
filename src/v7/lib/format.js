export const initials = (value = '') => String(value).trim().split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'O';

export const formatDate = (value, locale = 'ar') => {
  if (!value) return '—';
  try { return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); }
  catch { return String(value); }
};

export const formatBytes = (bytes = 0, locale = 'ar') => {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const v = n / (1024 ** i);
  return `${new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { maximumFractionDigits: i < 2 ? 0 : 1 }).format(v)} ${units[i]}`;
};

export const normalizeArray = (value) => Array.isArray(value) ? value : [];

export const statusTone = (status = '') => {
  if (['active', 'approved', 'done', 'ready', 'completed'].includes(status)) return 'success';
  if (['urgent', 'blocked', 'rejected', 'expired', 'failed'].includes(status)) return 'danger';
  if (['in_review', 'submitted', 'on_hold', 'pending', 'collecting'].includes(status)) return 'warning';
  return 'neutral';
};
