import React, { useState } from 'react';
import { BUNDLED_SERVICES, findExactService, type SubscriptionService } from '../services/serviceCatalog';
import { useServiceCatalog } from '../services/serviceCatalogStore';
import { getSubscriptionLogoDataUrl, getServiceLogoUrls } from '../services/subscriptionLogoService';

interface Props {
  name: string;
  serviceId?: string;
  logoUrl?: string;
  service?: SubscriptionService;
  className?: string;
}

export default function SubscriptionLogo({ name, serviceId, logoUrl, service, className = 'w-full h-full' }: Props) {
  const catalog = useServiceCatalog();
  const resolvedId = serviceId || (logoUrl?.startsWith('catalog:') ? logoUrl.slice(8) : undefined);
  const resolved = service || (resolvedId
    ? catalog.find(s => s.id === resolvedId) || BUNDLED_SERVICES.find(s => s.id === resolvedId)
    : findExactService(name, catalog));
  const customLogo = logoUrl && /^(https:\/\/|data:image\/(?:png|jpeg|webp|gif);base64,|\/[^/])/.test(logoUrl) ? logoUrl : undefined;
  const candidates = [...new Set([customLogo, ...getServiceLogoUrls(resolved)].filter((url): url is string => Boolean(url)))];
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const fallback = getSubscriptionLogoDataUrl(name);
  const src = candidates.find(url => !failedSources.includes(url)) || fallback;
  return <img src={src}
    alt="" className={`${className} object-contain`} loading="lazy" decoding="async" referrerPolicy="origin"
    onError={() => {
      if (src !== fallback) setFailedSources(previous => previous.includes(src) ? previous : [...previous, src]);
    }} />;
}
