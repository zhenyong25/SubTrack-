import { useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};

// Chart animations run in JavaScript, so the CSS motion preference alone cannot stop them.
export const useReducedMotion = () => useSyncExternalStore(
  subscribe,
  () => window.matchMedia(query).matches,
  () => true,
);
