'use client';

import { api } from './api';
import { V7_CONFIG } from './config';

const permissionsFromPolicy = (policy) => {
  const raw = Array.isArray(policy?.permissions) ? policy.permissions : [];
  return new Set(raw.map(item => typeof item === 'string' ? item : item?.key).filter(Boolean));
};

const entitlementsFromPolicy = (policy) => {
  const raw = Array.isArray(policy?.entitlements) ? policy.entitlements : [];
  const map = new Map();
  for (const item of raw) if (item?.key) map.set(item.key, item);
  return map;
};

export async function bootstrapWorkspace(preferredCompanyId, { signal } = {}) {
  const user = await api.getUser();
  const userId = user?.id;
  if (!userId) throw new Error('Authentication required');

  const [profileRows, securityRows, memberships] = await Promise.all([
    api.select('profiles', { filters: { id: `eq.${userId}` }, limit: 1, cacheTtlMs: 30_000, signal }),
    api.select('account_security', { filters: { user_id: `eq.${userId}` }, limit: 1, cacheTtlMs: 30_000, signal }).catch(() => []),
    api.select('company_memberships', { filters: { user_id: `eq.${userId}`, status: 'eq.active' }, order: 'created_at.asc', cacheTtlMs: 30_000, signal })
  ]);

  const profile = profileRows[0] || { id: userId, full_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User' };
  const security = securityRows[0] || null;
  if (security?.must_change_password) return { user, profile, security, memberships, requiresSecuritySetup: true, companies: [] };
  if (!memberships.length) return { user, profile, security, memberships, companies: [], company: null, policy: null, permissions: new Set(), entitlements: new Map() };

  const ids = memberships.map(x => x.company_id);
  const companies = await api.select('companies', { filters: { id: `in.(${ids.join(',')})` }, order: 'created_at.asc', cacheTtlMs: 30_000, signal });
  const stored = preferredCompanyId || (typeof window !== 'undefined' ? localStorage.getItem(V7_CONFIG.selectedCompanyKey) : null);
  const company = companies.find(x => x.id === stored) || companies[0] || null;
  if (!company) return { user, profile, security, memberships, companies, company: null, policy: null, permissions: new Set(), entitlements: new Map() };

  if (typeof window !== 'undefined') localStorage.setItem(V7_CONFIG.selectedCompanyKey, company.id);
  const membership = memberships.find(x => x.company_id === company.id) || null;
  const [brandingRows, policy] = await Promise.all([
    api.select('company_branding', { filters: { company_id: `eq.${company.id}` }, limit: 1, cacheTtlMs: 60_000, signal }).catch(() => []),
    api.rpc('workspace_runtime_policy', { p_company_id: company.id }, { cacheTtlMs: V7_CONFIG.runtimePolicyTtlMs, signal, dedupe: true })
  ]);

  return {
    user, profile, security, memberships, companies, company, membership,
    branding: brandingRows[0] || null,
    policy,
    permissions: permissionsFromPolicy(policy),
    entitlements: entitlementsFromPolicy(policy)
  };
}

export function can(workspace, permission) {
  return Boolean(workspace?.permissions?.has(permission));
}
