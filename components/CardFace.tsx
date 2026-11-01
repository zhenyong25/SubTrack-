import React, { useEffect, useRef, useState } from 'react';
import { loadCardFace } from '../services/cardFace';

// A card picture shown as a horizontal, edge-to-edge card face (see services/cardFace.ts). It's
// processed once the tile scrolls near the screen; until then the frame shows the bank's name.

interface Props {
  src: string | null;
  label: string;
  className?: string;
}

const CardFace: React.FC<Props> = ({ src, label, className = '' }) => {
  const frame = useRef<HTMLDivElement>(null);
  const [face, setFace] = useState<string | null | undefined>(undefined); // undefined: not ready yet
  const [near, setNear] = useState(false);

  useEffect(() => {
    const element = frame.current;
    if (!element || near) return;
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) setNear(true); }, { rootMargin: '300px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);

  useEffect(() => {
    setFace(undefined);
    if (!src || !near) return;
    let active = true;
    loadCardFace(src).then(result => { if (active) setFace(result); });
    return () => { active = false; };
  }, [src, near]);

  return (
    <div ref={frame} className={`relative aspect-[856/540] overflow-hidden rounded-lg bg-background shadow-sm ring-1 ring-black/5 ${className}`}>
      {face
        ? <img src={face} alt="" className="h-full w-full object-cover" />
        : face === null && src
          ? <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
          : <span className="absolute inset-0 flex items-center justify-center px-1 text-center text-[10px] font-bold text-secondary">{label}</span>}
    </div>
  );
};

export default CardFace;
