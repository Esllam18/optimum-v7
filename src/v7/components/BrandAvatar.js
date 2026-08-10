'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { initials } from '../lib/format';

export default function BrandAvatar({ path, name, size = 36, className = '' }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (path) api.signedAssetUrl('identity-assets', path).then(value => { if (live) setUrl(value); });
    return () => { live = false; };
  }, [path]);
  return <span className={`v7-avatar ${className}`} style={{ '--avatar-size': `${size}px` }}>{url ? <img src={url} alt="" onError={() => { api.markAssetFailed('identity-assets', path); setUrl(null); }} /> : initials(name)}</span>;
}
