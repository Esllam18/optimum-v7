import { CONFIG } from './config.js?v=6.9.0';

class ApiError extends Error {
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


const decodeJwtPayload = (token) => {
  try {
    const part = token.split('.')[1];
    if (!part) return {};
    const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    return JSON.parse(decodeURIComponent(Array.from(atob(padded), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')));
  } catch { return {}; }
};

const readImplicitAuthCallback = () => {
  if (typeof location === 'undefined' || !location.hash.includes('access_token=')) return null;
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  const claims = decodeJwtPayload(accessToken);
  const expiresIn = Number(params.get('expires_in') || 3600);
  const session = {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: params.get('token_type') || 'bearer',
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    user: {
      id: claims.sub,
      email: claims.email,
      role: claims.role,
      aud: claims.aud,
      user_metadata: claims.user_metadata || {},
      app_metadata: claims.app_metadata || {}
    }
  };
  const callbackType = params.get('type') || null;
  session.recovery = callbackType === 'recovery';
  session.callbackType = callbackType;
  const cleanUrl = `${location.pathname}${location.search}${session.recovery ? '#/password-reset' : '#/dashboard'}`;
  history.replaceState({}, '', cleanUrl);
  return session;
};

const normalizeError = (payload, fallback) => {
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload;
  return payload.message || payload.msg || payload.error_description || payload.error || payload.details || fallback;
};

class OptimumApi {
  constructor() {
    this.url = CONFIG.supabaseUrl.replace(/\/$/, '');
    this.key = CONFIG.supabasePublishableKey;
    this.scope = this.detectAppScope();
    this.sessionKey = `${CONFIG.sessionStorageKey}.${this.scope}`;
    this.session = readImplicitAuthCallback() || this.readSession();
    if (this.session) this.persistSession(this.session);
    this.refreshPromise = null;
  }

  detectAppScope() {
    if (typeof document === 'undefined') return 'client';
    const declared = document.documentElement?.dataset?.app || document.querySelector('#app')?.dataset?.appScope;
    if (declared === 'platform' || declared === 'client') return declared;
    if (location.pathname.startsWith('/platform') || location.port === '4174') return 'platform';
    return 'client';
  }

  readSession() {
    try {
      const scoped = localStorage.getItem(this.sessionKey);
      if (scoped) return JSON.parse(scoped);
      const legacy = localStorage.getItem(CONFIG.sessionStorageKey);
      if (!legacy) return null;
      const parsed = JSON.parse(legacy);
      localStorage.setItem(this.sessionKey, legacy);
      localStorage.removeItem(CONFIG.sessionStorageKey);
      return parsed;
    } catch { return null; }
  }

  persistSession(session) {
    localStorage.setItem(this.sessionKey, JSON.stringify(session));
  }

  saveSession(session) {
    this.session = session || null;
    if (session) this.persistSession(session);
    else localStorage.removeItem(this.sessionKey);
    window.dispatchEvent(new CustomEvent('optimum:session', { detail: { session: this.session, scope: this.scope } }));
  }

  get user() { return this.session?.user || null; }
  get accessToken() { return this.session?.access_token || null; }

  async ensureFreshSession(minSeconds = 90) {
    const expiresAt = Number(this.session?.expires_at || 0);
    if (this.session?.refresh_token && expiresAt && expiresAt - Math.floor(Date.now() / 1000) < minSeconds) {
      await this.refreshSession();
    }
  }

  async authRequest(path, { method = 'POST', body, token } = {}) {
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
    if (!response.ok) throw new ApiError(normalizeError(payload, 'Authentication request failed'), response.status, payload);
    return payload;
  }

  async signIn({ email, password }) {
    const payload = await this.authRequest('/token?grant_type=password', {
      body: { email: email.trim().toLowerCase(), password }
    });
    this.saveSession(payload);
    return payload;
  }

  async resetPasswordForEmail(email, redirectTo = `${location.origin}${location.pathname}`) {
    return this.authRequest(`/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
      body: { email: String(email || '').trim().toLowerCase() }
    });
  }

  async updateUser(attributes = {}) {
    if (!this.accessToken) throw new ApiError('Authentication required', 401);
    const payload = await this.authRequest('/user', { method: 'PUT', token: this.accessToken, body: attributes });
    if (payload?.id && this.session) {
      this.session.user = payload;
      this.saveSession(this.session);
    }
    return payload;
  }

  async updatePassword(password) { return this.updateUser({ password }); }

  async refreshSession() {
    if (!this.session?.refresh_token) throw new ApiError('Session expired', 401);
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.authRequest('/token?grant_type=refresh_token', {
      body: { refresh_token: this.session.refresh_token }
    }).then((payload) => {
      this.saveSession(payload);
      return payload;
    }).catch((error) => {
      this.saveSession(null);
      throw new ApiError('Session expired. Please sign in again.', 401, error?.details || null);
    }).finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  async ensureActiveSession() {
    if (!this.session?.access_token) throw new ApiError('Session expired. Please sign in again.', 401);
    await this.ensureFreshSession();
    try {
      const user = await this.authRequest('/user', { method: 'GET', token: this.accessToken });
      if (user?.id && this.session) {
        this.session.user = user;
        this.saveSession(this.session);
      }
      return user;
    } catch (error) {
      if (error?.status !== 401 || !this.session?.refresh_token) throw error;
      await this.refreshSession();
      return this.authRequest('/user', { method: 'GET', token: this.accessToken });
    }
  }

  async signOut({ scope = 'local' } = {}) {
    try {
      if (this.accessToken) await this.authRequest(`/logout?scope=${encodeURIComponent(scope)}`, { token: this.accessToken });
    } finally { this.saveSession(null); }
  }

  async request(path, { method = 'GET', body, headers = {}, retry = true } = {}) {
    const response = await fetch(`${this.url}${path}`, {
      method,
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.accessToken || this.key}`,
        'Content-Type': 'application/json',
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    if (response.status === 401 && retry && this.session?.refresh_token) {
      try {
        await this.refreshSession();
        return this.request(path, { method, body, headers, retry: false });
      } catch (refreshError) {
        this.saveSession(null);
        throw new ApiError('Session expired. Please sign in again.', 401, refreshError?.details || null);
      }
    }

    const payload = await safeJson(response);
    if (!response.ok) throw new ApiError(normalizeError(payload, 'Request failed'), response.status, payload);
    return { data: payload, response };
  }

  async select(table, { select = '*', filters = {}, order, limit, extra = '' } = {}) {
    const params = new URLSearchParams({ select });
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value);
    });
    if (order) params.set('order', order);
    if (limit) params.set('limit', String(limit));
    const suffix = extra ? `&${extra.replace(/^&/, '')}` : '';
    const { data } = await this.request(`/rest/v1/${table}?${params}${suffix}`);
    return data || [];
  }

  async insert(table, row, { returning = true } = {}) {
    const { data } = await this.request(`/rest/v1/${table}`, {
      method: 'POST',
      body: row,
      headers: { Prefer: returning ? 'return=representation' : 'return=minimal' }
    });
    return returning ? (Array.isArray(data) ? data[0] : data) : null;
  }

  async update(table, filters, changes, { returning = true } = {}) {
    const params = new URLSearchParams(filters);
    const { data } = await this.request(`/rest/v1/${table}?${params}`, {
      method: 'PATCH',
      body: changes,
      headers: { Prefer: returning ? 'return=representation' : 'return=minimal' }
    });
    return returning ? (Array.isArray(data) ? data[0] : data) : null;
  }


  async remove(table, filters, { returning = false } = {}) {
    const params = new URLSearchParams(filters);
    const { data } = await this.request(`/rest/v1/${table}?${params}`, {
      method: 'DELETE',
      headers: { Prefer: returning ? 'return=representation' : 'return=minimal' }
    });
    return returning ? (data || []) : null;
  }

  async delete(table, filters, options = {}) { return this.remove(table, filters, options); }

  async uploadObject(bucket, path, file, { upsert = false, onProgress } = {}) {
    await this.ensureFreshSession();
    const url = `${this.url}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`;
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
      xhr.onerror = () => reject(new ApiError('Network error while uploading the file'));
      xhr.onabort = () => reject(new ApiError('File upload was cancelled'));
      xhr.onload = () => {
        let payload = null;
        try { payload = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { payload = xhr.responseText; }
        if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
        else reject(new ApiError(normalizeError(payload, 'File upload failed'), xhr.status, payload));
      };
      xhr.send(file);
    });
  }

  async createSignedUrl(bucket, path, expiresIn = 900, downloadName = '') {
    await this.ensureFreshSession();
    const { data } = await this.request(`/storage/v1/object/sign/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST', body: { expiresIn }
    });
    const signed = data?.signedURL || data?.signedUrl || data?.signed_url;
    if (!signed) throw new ApiError('Could not create a secure file link');
    let absolute;
    if (signed.startsWith('http')) absolute = signed;
    else if (signed.startsWith('/storage/v1/')) absolute = `${this.url}${signed}`;
    else absolute = `${this.url}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}`;
    if (downloadName) {
      const u = new URL(absolute);
      u.searchParams.set('download', downloadName);
      absolute = u.toString();
    }
    return absolute;
  }

  async downloadObject(bucket, path, filename) {
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
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    }
  }

  async deleteObject(bucket, path) {
    await this.ensureFreshSession();
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
    if (!response.ok) throw new ApiError(normalizeError(payload, 'Could not delete uploaded object'), response.status, payload);
    return payload;
  }

  async invokeFunction(name, body = {}) {
    await this.ensureActiveSession();
    const { data } = await this.request(`/functions/v1/${encodeURIComponent(name)}`, {
      method: 'POST', body
    });
    return data;
  }

  async rpc(name, args = {}) {
    const { data } = await this.request(`/rest/v1/rpc/${name}`, {
      method: 'POST',
      body: args
    });
    return data;
  }
}

export const api = new OptimumApi();
export { ApiError };
