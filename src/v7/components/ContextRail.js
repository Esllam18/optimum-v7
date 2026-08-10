'use client';

import { useRouter } from 'next/navigation';
import Icon from './Icon';
import { projectAreaHref } from '../lib/navigation';

const labels = {
  ar: { overview: 'نظرة عامة', work: 'العمل', documents: 'المستندات', engineering: 'الهندسة', delivery: 'التسليم' },
  en: { overview: 'Overview', work: 'Work', documents: 'Documents', engineering: 'Engineering', delivery: 'Delivery' }
};

export default function ContextRail({ project, site, cabinet, locale = 'en', active = 'overview' }) {
  const router = useRouter();
  if (!project?.id) return null;
  const t = labels[locale] || labels.en;
  const context = {
    project_id: project.id,
    site_id: site?.id || null,
    cabinet_id: cabinet?.id || null,
    folder_id: cabinet?.root_folder_id || null
  };
  const areas = [
    { key: 'overview', area: 'project', icon: 'grid' },
    { key: 'work', area: 'work', icon: 'check' },
    { key: 'documents', area: 'documents', icon: 'folder' },
    { key: 'engineering', area: 'engineering', icon: 'drafting' },
    { key: 'delivery', area: 'delivery', icon: 'delivery' }
  ];
  return <div className="v7-context-rail" aria-label="Project workspace navigation">
    <div className="v7-context-rail-path">
      <span><Icon name="briefcase" size={14} />{project.code || project.name}</span>
      {site ? <span><Icon name="map" size={14} />{site.code || site.name}</span> : null}
      {cabinet ? <span><Icon name="layers" size={14} />{cabinet.code || cabinet.name}</span> : null}
    </div>
    <nav>{areas.map(item => <button key={item.key} className={active === item.key ? 'is-active' : ''} onClick={() => router.push(projectAreaHref(item.area, context))}><Icon name={item.icon} size={15} /><span>{t[item.key]}</span></button>)}</nav>
  </div>;
}
