const DEFAULT_SUPABASE_URL = 'https://wzcaquxuvqfbstpxujsj.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_HeqdVWEraJ3Z6BiTbFvIuQ_koAID5fK';

const configuredSupabaseUrl = String(
  process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL
).trim().replace(/\/+$/, '');
const configuredPublishableKey = String(
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY
).trim();

export const V7_CONFIG = Object.freeze({
  supabaseUrl: configuredSupabaseUrl,
  supabasePublishableKey: configuredPublishableKey,
  sessionStorageKey: 'optimum.session.v2.client',
  legacySessionStorageKey: 'optimum.session.v2',
  selectedCompanyKey: 'optimum.company.v1',
  localeKey: 'optimum.v7.locale',
  themeKey: 'optimum.v7.theme',
  metricsLimit: 180,
  telemetrySessionKey: 'optimum.v7.telemetry.session',
  telemetryBufferKey: 'optimum.v7.telemetry.buffer',
  telemetryBufferLimit: 80,
  telemetryBatchSize: 12,
  telemetrySlowRequestMs: 1200,
  defaultReadTtlMs: 15_000,
  runtimePolicyTtlMs: 45_000,
  assetUrlTtlMs: 12 * 60_000
});
