'use client';

import { api } from './api';

const q = (value) => value ? encodeURIComponent(value) : '';

export function contextParams(context = {}, extras = {}) {
  const params = new URLSearchParams();
  const values = {
    project: context.project_id || context.projectId,
    site: context.site_id || context.siteId,
    cabinet: context.cabinet_id || context.cabinetId,
    folder: context.folder_id || context.folderId,
    document: context.document_id || context.documentId,
    drawing: context.drawing_id || context.drawingId,
    task: context.task_id || context.taskId,
    package: context.claim_package_id || context.package_id || context.packageId,
    ...extras
  };
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  return params;
}

export function projectAreaHref(area, context = {}, extras = {}) {
  const projectId = context.project_id || context.projectId;
  const siteId = context.site_id || context.siteId;
  const cabinetId = context.cabinet_id || context.cabinetId;
  if (area === 'project' && projectId) {
    const params = contextParams({ site_id: siteId, cabinet_id: cabinetId }, extras);
    return `/v7/projects/${q(projectId)}${params.size ? `?${params.toString()}` : ''}`;
  }
  const params = contextParams(context, extras);
  if (area === 'work') return `/v7/work${params.size ? `?${params.toString()}` : ''}`;
  if (area === 'documents') return `/v7/documents${params.size ? `?${params.toString()}` : ''}`;
  if (area === 'engineering') return `/v7/engineering${params.size ? `?${params.toString()}` : ''}`;
  if (area === 'delivery') return `/v7/delivery${params.size ? `?${params.toString()}` : ''}`;
  return projectId ? `/v7/projects/${q(projectId)}` : '/v7';
}

export function contextHref(context = {}) {
  const type = context.type || context.entity_type;
  const projectId = context.project_id;
  const siteId = context.site_id;
  const folderId = context.folder_id;

  if (type === 'project' && projectId) return `/v7/projects/${q(projectId)}`;
  if (type === 'site' && projectId && siteId) return `/v7/projects/${q(projectId)}?site=${q(siteId)}`;
  if (type === 'site_cabinet' && projectId) {
    const params = new URLSearchParams();
    if (siteId) params.set('site', siteId);
    if (context.cabinet_id) params.set('cabinet', context.cabinet_id);
    return `/v7/projects/${q(projectId)}?${params.toString()}`;
  }
  if (type === 'site_claim_package' && context.claim_package_id) return `/v7/delivery?package=${q(context.claim_package_id)}`;
  if (type === 'folder' && projectId) {
    const params = new URLSearchParams({ project: projectId });
    if (siteId) params.set('site', siteId);
    if (folderId) params.set('folder', folderId);
    return `/v7/documents?${params.toString()}`;
  }
  if (type === 'document' && projectId) {
    const params = new URLSearchParams({ project: projectId });
    if (siteId) params.set('site', siteId);
    if (folderId) params.set('folder', folderId);
    if (context.document_id) params.set('document', context.document_id);
    return `/v7/documents?${params.toString()}`;
  }
  if (type === 'task' && context.task_id) {
    if (!projectId && !siteId && !folderId && !context.document_id) return `/v7/work?task=${q(context.task_id)}`;
    const params = contextParams(context, { task: context.task_id });
    return `/v7/work?${params.toString()}`;
  }
  if (type === 'engineering_drawing' && context.drawing_id) {
    if (!projectId && !siteId && !folderId) return `/v7/engineering?drawing=${q(context.drawing_id)}`;
    const params = contextParams(context, { drawing: context.drawing_id });
    return `/v7/engineering?${params.toString()}`;
  }
  return '/v7';
}

export async function resolveEntityHref(entityType, entityId, fallback = {}) {
  if (!entityType || !entityId) return contextHref(fallback);
  try {
    const context = await api.rpc('resolve_entity_context', {
      p_entity_type: entityType,
      p_entity_id: entityId
    }, { cacheTtlMs: 20_000, dedupe: true });
    return contextHref(context || fallback);
  } catch {
    return contextHref({ type: entityType, ...fallback });
  }
}
