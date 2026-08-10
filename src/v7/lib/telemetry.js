'use client';

import { V7_CONFIG } from './config';

const clean = (value, max = 1000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const sanitizeContext = (context = {}) => Object.fromEntries(Object.entries(context || {}).slice(0, 8).map(([key, value]) => {
  const safeKey = clean(key, 80) || 'detail';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return [safeKey, value];
  if (typeof value === 'string') return [safeKey, clean(value, 600)];
  try { return [safeKey, clean(JSON.stringify(value), 600)]; } catch { return [safeKey, clean(value, 600)]; }
}));
const sessionId = () => {
  if (typeof sessionStorage === 'undefined') return 'server';
  let value = sessionStorage.getItem(V7_CONFIG.telemetrySessionKey);
  if (!value) {
    value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(V7_CONFIG.telemetrySessionKey, value);
  }
  return value;
};

class V7Telemetry {
  constructor() { this.api = null; this.workspace = null; this.buffer = []; this.bound = false; this.flushing = false; this.metricUnsub = null; }

  init(api) {
    if (typeof window === 'undefined') return;
    this.api = api;
    if (!this.bound) {
      this.bound = true;
      addEventListener('error', (event) => this.capture('window_error', event.error || event.message, { source: event.filename, line: event.lineno, column: event.colno }, 'error'));
      addEventListener('unhandledrejection', (event) => this.capture('unhandled_rejection', event.reason, {}, 'error'));
      this.metricUnsub = api.subscribeMetrics((metric) => {
        if (metric.label === 'insert:client_telemetry_events') return;
        const failed = metric.status === 0 || metric.status >= 500;
        const slow = metric.ms >= V7_CONFIG.telemetrySlowRequestMs;
        if (failed || slow) this.capture(failed ? 'request_failure' : 'slow_request', `${metric.label || metric.path || metric.kind} ${metric.status || 0} ${metric.ms}ms`, { kind: metric.kind, label: metric.label, path: metric.path, method: metric.method, status: metric.status, ms: metric.ms }, failed ? 'error' : 'warn');
      });
    }
    this.restore();
  }

  setWorkspace(workspace) { this.workspace = workspace || null; this.flush(); }

  restore() {
    try {
      const rows = JSON.parse(sessionStorage.getItem(V7_CONFIG.telemetryBufferKey) || '[]');
      if (Array.isArray(rows)) this.buffer = rows.slice(-V7_CONFIG.telemetryBufferLimit);
    } catch { this.buffer = []; }
  }

  persist() {
    try { sessionStorage.setItem(V7_CONFIG.telemetryBufferKey, JSON.stringify(this.buffer.slice(-V7_CONFIG.telemetryBufferLimit))); } catch {}
  }

  capture(eventType, error, context = {}, severity = 'error') {
    if (typeof window === 'undefined') return;
    const err = error instanceof Error ? error : null;
    const message = clean(err?.message || error || eventType);
    const fingerprint = clean(`${eventType}:${err?.name || ''}:${message}`, 180);
    this.buffer.push({
      event_type: clean(eventType, 64), severity: ['info','warn','error'].includes(severity) ? severity : 'error',
      route: clean(`${location.pathname}${location.search}`, 320), message, fingerprint,
      session_id: sessionId(), context: {
        ...sanitizeContext(context),
        stack: clean(err?.stack || '', 3000),
        viewport: `${innerWidth || 0}x${innerHeight || 0}`,
        online: navigator.onLine !== false
      }
    });
    if (this.buffer.length > V7_CONFIG.telemetryBufferLimit) this.buffer.splice(0, this.buffer.length - V7_CONFIG.telemetryBufferLimit);
    this.persist();
    this.flush();
  }

  async flush() {
    if (this.flushing || !this.api?.accessToken || !this.workspace?.company?.id || !this.buffer.length) return;
    this.flushing = true;
    const batch = this.buffer.slice(0, V7_CONFIG.telemetryBatchSize);
    let drainMore = false;
    try {
      const rows = batch.map((row) => ({ ...row, company_id: this.workspace.company.id }));
      await this.api.insert('client_telemetry_events', rows, { returning: false, invalidate: false });
      this.buffer.splice(0, batch.length);
      this.persist();
      drainMore = this.buffer.length > 0;
    } catch {
      // Keep the buffer for a later authenticated flush; telemetry must never break the product flow.
    } finally {
      this.flushing = false;
      if (drainMore) queueMicrotask(() => this.flush());
    }
  }
}

export const telemetry = new V7Telemetry();
