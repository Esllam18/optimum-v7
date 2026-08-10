'use client';

import { V7_CONFIG } from './config';

export class ApiError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

const safeJson = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
};

const normalizeError = (payload, fallback = 'Request failed') => {
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload;
  return payload.message || payload.msg || payload.error_description || payload.error || payload.details || fallback;
};

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = stableValue(value[key]);
      return acc;
    }, {});
  }
  return value;
};

const stableKey = (...parts) => JSON.stringify(parts.map(stableValue));

class V7Api {
  constructor() {
    this.url = V7_CONFIG.supabaseUrl.replace(/\/$/, '');
    this.key = V7_CONFIG.supabasePublishableKey;
    this.session = null;
    this.refreshPromise = null;
    this.inflight = new Map();
    this.cache = new Map();
    this.assetCache = new Map();
    this.metrics = [];
    this.metricListeners = new Set();
  }

  init() {
    if (typeof window === 'undefined') return;
    this.session = this.readSession();
    window.__OPTIMUM_V7_METRICS__ = this.metrics;
  }

  readSession() {
    const parse = (key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      try { return JSON.parse(raw); }
      catch { localStorage.removeItem(key); return null; }
    };

    const scoped = parse(V7_CONFIG.sessionStorageKey);
    if (scoped) return scoped;

    const legacy = parse(V7_CONFIG.legacySessionStorageKey);
    if (!legacy) return null;
    localStorage.setItem(V7_CONFIG.sessionStorageKey, JSON.stringify(legacy));
    localStorage.removeItem(V7_CONFIG.legacySessionStorageKey);
    return legacy;
  }

  persistSession(session) {
    this.session = session || null;
    if (typeof window === 'undefined') return;
    if (session) localStorage.setItem(V7_CONFIG.sessionStorageKey, JSON.stringify(session));
    else {
      localStorage.removeItem(V7_CONFIG.sessionStorageKey);
      localStorage.removeItem(V7_CONFIG.legacySessionStorageKey);
    }
    window.dispatchEvent(new CustomEvent('optimum:v7-session', { detail: { session: this.session } }));
  }

  get user() { return this.session?.user || null; }
  get accessToken() { return this.session?.access_token || null; }

  subscribeMetrics(listener) {
    this.metricListeners.add(listener);
    return () => this.metricListeners.delete(listener);
  }

  recordMetric(metric) {
    this.metrics.push(metric);
    if (this.metrics.length > V7_CONFIG.metricsLimit) this.metrics.splice(0, this.metrics.length - V7_CONFIG.metricsLimit);
    for (const listener of this.metricListeners) listener(metric, this.metrics);
  }

  clearReadCache(prefix = '') {
    for (const key of this.cache.keys()) if (!prefix || key.includes(prefix)) this.cache.delete(key);
  }

  async authRequest(path, { method = 'POST', body, token } = {}) {
    const started = performance.now();
    const response = await fetch(`${this.url}/auth/v1${path}`, {
      method,
      headers: {
        apikey: this.key,
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await safeJson(response);
    this.recordMetric({ kind: 'auth', path, method, status: response.status, ms: Math.round(performance.now() - started), at: Date.now() });
    if (!response.ok) throw new ApiError(normalizeError(payload, 'Authentication request failed'), response.status, payload);
    return payload;
  }

  async signIn(email, password) {
    const payload = await this.authRequest('/token?grant_type=password', {
      body: { email: String(email || '').trim().toLowerCase(), password }
    });
    this.persistSession(payload);
    this.clearReadCache();
    return payload;
  }

  async signOut() {
    try {
      if (this.accessToken) await this.authRequest('/logout?scope=local', { token: this.accessToken });
    } finally {
      this.persistSession(null);
      this.clearReadCache();
      this.assetCache.clear();
    }
  }

  async refreshSession() {
    if (!this.session?.refresh_token) throw new ApiError('Session expired', 401);
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.authRequest('/token?grant_type=refresh_token', {
      body: { refresh_token: this.session.refresh_token }
    }).then((payload) => {
      this.persistSession(payload);
      return payload;
    }).catch((error) => {
      this.persistSession(null);
      throw new ApiError('Session expired. Please sign in again.', 401, error?.details || error);
    }).finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  async ensureFreshSession(minSeconds = 90) {
    const expiresAt = Number(this.session?.expires_at || 0);
    if (!this.session?.refresh_token || !expiresAt) return;
    if (expiresAt - Math.floor(Date.now() / 1000) < minSeconds) await this.refreshSession();
  }

  async getUser() {
    if (!this.accessToken) throw new ApiError('Authentication required', 401);
    await this.ensureFreshSession();
    try {
      const user = await this.authRequest('/user', { method: 'GET', token: this.accessToken });
      if (user?.id && this.session) this.persistSession({ ...this.session, user });
      return user;
    } catch (error) {
      if (error?.status !== 401 || !this.session?.refresh_token) throw error;
      await this.refreshSession();
      const user = await this.authRequest('/user', { method: 'GET', token: this.accessToken });
      if (user?.id && this.session) this.persistSession({ ...this.session, user });
      return user;
    }
  }

  async captureSessionFromUrl() {
    if (typeof window === 'undefined') return null;
    const raw = window.location.hash.replace(/^#/, '');
    if (!raw) return null;
    const params = new URLSearchParams(raw);
    const errorMessage = params.get('error_description') || params.get('error');
    if (errorMessage) {
      history.replaceState({}, '', `${location.pathname}${location.search}`);
      throw new ApiError(errorMessage, 401, { code: params.get('error_code') || '' });
    }
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!accessToken || !refreshToken) return null;
    const expiresIn = Math.max(1, Number(params.get('expires_in') || 3600));
    const session = {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: params.get('token_type') || 'bearer',
      expires_in: expiresIn,
      expires_at: Math.floor(Date.now() / 1000) + expiresIn,
      auth_flow_type: params.get('type') || '',
      user: null
    };
    this.persistSession(session);
    history.replaceState({}, '', `${location.pathname}${location.search}`);
    const user = await this.getUser();
    return { ...this.session, user };
  }

  async updateCurrentUser({ password, data } = {}) {
    if (!this.accessToken) throw new ApiError('Authentication required', 401);
    const body = {};
    if (password !== undefined) body.password = password;
    if (data !== undefined) body.data = data;
    const user = await this.authRequest('/user', { method: 'PUT', body, token: this.accessToken });
    if (user?.id && this.session) this.persistSession({ ...this.session, user });
    return user;
  }

  async invokeFunction(name, body = {}) {
    if (!this.accessToken) throw new ApiError('Authentication required', 401);
    const { data } = await this.request(`/functions/v1/${encodeURIComponent(name)}`, {
      method: 'POST', body, dedupe: false, metricLabel: `edge:${name}`
    });
    if (data?.ok === false) throw new ApiError(normalizeError(data, 'Edge function request failed'), 400, data);
    return data;
  }

  async request(path, {
    method = 'GET', body, headers = {}, retry = true,
    cacheTtlMs = 0, dedupe = false, signal, metricLabel = ''
  } = {}) {
    await this.ensureFreshSession();
    const key = stableKey(method, path, body || null);
    const now = Date.now();

    if (cacheTtlMs > 0) {
      const cached = this.cache.get(key);
      if (cached && cached.expiresAt > now) return cached.value;
      if (cached) this.cache.delete(key);
    }
    if (dedupe && this.inflight.has(key)) return this.inflight.get(key);

    const task = (async () => {
      const started = performance.now();
      let response;
      try {
        response = await fetch(`${this.url}${path}`, {
          method,
          headers: {
            apikey: this.key,
            Authorization: `Bearer ${this.accessToken || this.key}`,
            'Content-Type': 'application/json',
            ...headers
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal
        });

        if (response.status === 401 && retry && this.session?.refresh_token) {
          await this.refreshSession();
          return this.request(path, { method, body, headers, retry: false, cacheTtlMs, dedupe: false, signal, metricLabel });
        }

        const payload = await safeJson(response);
        const value = { data: payload, response };
        const elapsed = Math.round(performance.now() - started);
        this.recordMetric({ kind: 'api', path, label: metricLabel || path, method, status: response.status, ms: elapsed, at: Date.now() });
        if (!response.ok) throw new ApiError(normalizeError(payload), response.status, payload);
        if (cacheTtlMs > 0) this.cache.set(key, { expiresAt: Date.now() + cacheTtlMs, value });
        return value;
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        if (!response) this.recordMetric({ kind: 'api', path, label: metricLabel || path, method, status: 0, ms: Math.round(performance.now() - started), at: Date.now(), error: true });
        throw error;
      }
    })();

    if (dedupe) this.inflight.set(key, task);
    try { return await task; }
    finally { if (dedupe) this.inflight.delete(key); }
  }

  async select(table, { select = '*', filters = {}, order, limit, offset, cacheTtlMs = V7_CONFIG.defaultReadTtlMs, signal } = {}) {
    const params = new URLSearchParams({ select });
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value);
    });
    if (order) params.set('order', order);
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    const { data } = await this.request(`/rest/v1/${table}?${params.toString()}`, {
      cacheTtlMs, dedupe: true, signal, metricLabel: `select:${table}`
    });
    return Array.isArray(data) ? data : [];
  }


  async insert(table, values, { returning = true, signal, invalidate = true } = {}) {
    const { data } = await this.request(`/rest/v1/${table}`, {
      method: 'POST', body: values,
      headers: { Prefer: returning ? 'return=representation' : 'return=minimal' },
      signal, metricLabel: `insert:${table}`
    });
    if (invalidate) this.clearReadCache();
    return returning ? (Array.isArray(data) ? data : data ? [data] : []) : [];
  }

  async update(table, values, { filters = {}, signal } = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value);
    });
    const { data } = await this.request(`/rest/v1/${table}${params.size ? `?${params.toString()}` : ''}`, {
      method: 'PATCH', body: values, headers: { Prefer: 'return=representation' }, signal, metricLabel: `update:${table}`
    });
    this.clearReadCache();
    return Array.isArray(data) ? data : data ? [data] : [];
  }

  async deleteRows(table, { filters = {}, signal } = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value);
    });
    const { data } = await this.request(`/rest/v1/${table}${params.size ? `?${params.toString()}` : ''}`, {
      method: 'DELETE', headers: { Prefer: 'return=representation' }, signal, metricLabel: `delete:${table}`
    });
    this.clearReadCache();
    return Array.isArray(data) ? data : data ? [data] : [];
  }

  async uploadObject(bucket, path, file, { upsert = false, onProgress } = {}) {
    await this.ensureFreshSession();
    const url = `${this.url}/storage/v1/object/${encodeURIComponent(bucket)}/${String(path).split('/').map(encodeURIComponent).join('/')}`;
    const started = performance.now();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.setRequestHeader('apikey', this.key);
      xhr.setRequestHeader('Authorization', `Bearer ${this.accessToken || this.key}`);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('x-upsert', upsert ? 'true' : 'false');
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && typeof onProgress === 'function') onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onerror = () => {
        this.recordMetric({ kind: 'storage', label: 'storage:upload', status: 0, ms: Math.round(performance.now() - started), at: Date.now(), error: true });
        reject(new ApiError('Network error while uploading the file'));
      };
      xhr.onabort = () => reject(new ApiError('File upload was cancelled'));
      xhr.onload = () => {
        let payload = null;
        try { payload = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { payload = xhr.responseText; }
        this.recordMetric({ kind: 'storage', label: 'storage:upload', status: xhr.status, ms: Math.round(performance.now() - started), at: Date.now() });
        if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
        else reject(new ApiError(normalizeError(payload, 'File upload failed'), xhr.status, payload));
      };
      xhr.send(file);
    });
  }

  async deleteObject(bucket, path) {
    await this.ensureFreshSession();
    const started = performance.now();
    const response = await fetch(`${this.url}/storage/v1/object/${encodeURIComponent(bucket)}`, {
      method: 'DELETE',
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.accessToken || this.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prefixes: [path] })
    });
    const payload = await safeJson(response);
    this.recordMetric({ kind: 'storage', label: 'storage:delete', status: response.status, ms: Math.round(performance.now() - started), at: Date.now() });
    if (!response.ok) throw new ApiError(normalizeError(payload, 'Could not delete uploaded object'), response.status, payload);
    return payload;
  }

  async rpc(name, args = {}, { cacheTtlMs = 0, signal, dedupe = cacheTtlMs > 0 } = {}) {
    const { data } = await this.request(`/rest/v1/rpc/${name}`, {
      method: 'POST', body: args, cacheTtlMs, dedupe, signal, metricLabel: `rpc:${name}`
    });
    return data;
  }

  async createSignedUrl(bucket, path, expiresIn = 300, downloadName = '') {
    if (!path) throw new ApiError('File path is missing');
    await this.ensureFreshSession();
    const { data } = await this.request(`/storage/v1/object/sign/${encodeURIComponent(bucket)}/${String(path).split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST', body: { expiresIn }, dedupe: false, metricLabel: 'storage:file-signed-url'
    });
    const signed = data?.signedURL || data?.signedUrl || data?.signed_url;
    if (!signed) throw new ApiError('Could not create a secure file link');
    let absolute = signed.startsWith('http') ? signed : signed.startsWith('/storage/v1/') ? `${this.url}${signed}` : `${this.url}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}`;
    if (downloadName) {
      const url = new URL(absolute);
      url.searchParams.set('download', downloadName);
      absolute = url.toString();
    }
    return absolute;
  }

  async downloadObject(bucket, path, filename = 'download') {
    const started = performance.now();
    const signedUrl = await this.createSignedUrl(bucket, path, 300);
    const response = await fetch(signedUrl);
    if (!response.ok) throw new ApiError('Could not download the file', response.status);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename || 'download';
      anchor.style.display = 'none';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      this.recordMetric({ kind: 'storage', label: 'storage:download', status: 200, ms: Math.round(performance.now() - started), at: Date.now() });
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    }
  }

  markAssetFailed(bucket, path, backoffMs = 5 * 60_000) {
    if (!path) return;
    const cacheKey = `${bucket}:${path}`;
    this.assetCache.set(cacheKey, { url: null, expiresAt: 0, failedUntil: Date.now() + backoffMs });
  }

  async signedAssetUrl(bucket, path, expiresIn = 900) {
    if (!path) return null;
    const cacheKey = `${bucket}:${path}`;
    const cached = this.assetCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.url;
    if (cached?.failedUntil > Date.now()) return null;
    try {
      const { data } = await this.request(`/storage/v1/object/sign/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST', body: { expiresIn }, dedupe: true, metricLabel: 'storage:signed-url'
      });
      const signed = data?.signedURL || data?.signedUrl || data?.signed_url;
      if (!signed) throw new ApiError('Could not create secure asset URL');
      const url = signed.startsWith('http') ? signed : signed.startsWith('/storage/v1/') ? `${this.url}${signed}` : `${this.url}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}`;
      this.assetCache.set(cacheKey, { url, expiresAt: Date.now() + Math.min(V7_CONFIG.assetUrlTtlMs, (expiresIn - 60) * 1000) });
      return url;
    } catch {
      this.assetCache.set(cacheKey, { url: null, expiresAt: 0, failedUntil: Date.now() + 5 * 60_000 });
      return null;
    }
  }
}

export const api = new V7Api();
