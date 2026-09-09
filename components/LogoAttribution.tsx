import React from 'react';
import { hasLogoDevKey } from '../services/subscriptionLogoService';

export default function LogoAttribution() {
  if (!hasLogoDevKey) return null;
  return <p className="text-center text-xs text-secondary py-3">
    <a href="https://logo.dev" target="_blank" rel="noopener" className="hover:text-primary underline underline-offset-2">Logos provided by Logo.dev</a>
  </p>;
}
