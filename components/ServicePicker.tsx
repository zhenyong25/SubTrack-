import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { searchServices, type SubscriptionService } from '../services/serviceCatalog';
import { useServiceCatalog } from '../services/serviceCatalogStore';
import SubscriptionLogo from './SubscriptionLogo';
import LogoAttribution from './LogoAttribution';

interface Props {
  name: string;
  serviceId?: string;
  logoUrl?: string;
  onNameChange: (name: string) => void;
  onSelect: (service: SubscriptionService) => void;
}

export default function ServicePicker({ name, serviceId, logoUrl, onNameChange, onSelect }: Props) {
  const services = useServiceCatalog();
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(-1);
  const [browsing, setBrowsing] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState(40);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => searchServices(name, services).slice(0, 8), [name, services]);
  const browseMatches = useMemo(() => searchServices(query, services, category), [query, category, services]);
  const categories = useMemo(() => [...new Set(services.filter(s => s.is_active).map(s => s.category))].sort(), [services]);
  const count = services.filter(s => s.is_active).length;

  useEffect(() => { setActive(-1); }, [name, services]);
  useEffect(() => { setLimit(40); }, [query, category]);
  useEffect(() => {
    if (browsing) dialog.current?.showModal();
    else dialog.current?.close();
  }, [browsing]);

  const select = (service: SubscriptionService) => {
    onSelect(service);
    setExpanded(false);
    setActive(-1);
    setBrowsing(false);
  };

  return <div>
    <div className="flex items-start gap-3">
      <div className="w-12 h-12 flex-shrink-0 rounded-xl bg-white border border-border overflow-hidden mt-6">
        <SubscriptionLogo name={name} serviceId={serviceId} logoUrl={logoUrl} />
      </div>
      <div className="flex-1 min-w-0 relative" onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setExpanded(false);
      }}>
        <label htmlFor={`${id}-input`} className="block text-xs font-semibold text-secondary uppercase mb-1">Service Name</label>
        <input ref={input} id={`${id}-input`} required pattern=".*\S.*" title="Enter a service name" autoComplete="off" role="combobox"
          aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-suggestions`}
          aria-activedescendant={expanded && active >= 0 && matches[active] ? `${id}-option-${active}` : undefined}
          value={name} placeholder="Search Netflix, Spotify, or your own service"
          onFocus={() => setExpanded(true)}
          onChange={event => { onNameChange(event.target.value); setExpanded(true); }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault(); setExpanded(true);
              setActive(index => !matches.length ? -1 : index < 0
                ? (event.key === 'ArrowDown' ? 0 : matches.length - 1)
                : (index + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
            } else if (event.key === 'Enter' && expanded) {
              event.preventDefault();
              if (active >= 0 && matches[active]) select(matches[active]);
              else setExpanded(false);
            } else if (event.key === 'Escape') { event.preventDefault(); setExpanded(false); }
          }}
          className="w-full bg-surface border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none" />
        {expanded && <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-surface border border-border rounded-xl shadow-xl overflow-hidden">
          <div id={`${id}-suggestions`} role="listbox" aria-label="Matching services" className="max-h-72 overflow-y-auto">
            {matches.map((service, index) => <button type="button" role="option" aria-selected={active === index}
              id={`${id}-option-${index}`} key={service.id} tabIndex={-1}
              onMouseDown={event => event.preventDefault()} onClick={() => select(service)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-primary/10 ${active === index ? 'bg-primary/10' : ''}`}>
              <span className="w-8 h-8 shrink-0 rounded-lg overflow-hidden bg-white"><SubscriptionLogo name={service.name} service={service} /></span>
              <span className="min-w-0"><span className="block text-sm font-medium text-textMain truncate">{service.name}</span>
                <span className="block text-xs text-secondary truncate">{service.category} · {service.domain}</span></span>
            </button>)}
          </div>
          <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => setExpanded(false)}
            className="w-full text-left text-xs text-secondary border-t border-border px-3 py-3 hover:text-primary">
            {name.trim() ? `Use “${name.trim()}” as a custom service` : 'Type any service name to add your own'}
          </button>
        </div>}
      </div>
    </div>
    <div className="flex justify-between items-center gap-2 mt-2">
      <p className="text-xs text-secondary">Select a service to fill its category and logo.</p>
      <button type="button" className="text-xs font-semibold text-primary shrink-0" onClick={() => {
        setExpanded(false); setQuery(''); setCategory(''); setBrowsing(true);
      }}>Browse all {count.toLocaleString()}</button>
    </div>

    <dialog ref={dialog} onClose={() => setBrowsing(false)} aria-labelledby={`${id}-title`}
      onClick={event => { if (event.target === event.currentTarget) setBrowsing(false); }}
      className="p-0 bg-surface text-textMain border border-border rounded-2xl w-[calc(100%-2rem)] max-w-lg max-h-[85vh] backdrop:bg-black/60">
      <div className="flex flex-col max-h-[85vh]" onKeyDown={event => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault(); }}>
        <div className="p-4 flex justify-between items-center border-b border-border">
          <h3 id={`${id}-title`} className="font-bold">Browse services</h3>
          <button type="button" aria-label="Close service browser" onClick={() => setBrowsing(false)}><X size={22} /></button>
        </div>
        <div className="p-4 space-y-3 border-b border-border">
          <div className="relative"><Search size={18} className="absolute left-3 top-3 text-secondary" />
            <input autoFocus aria-label="Search all services" value={query} onChange={event => setQuery(event.target.value)}
              placeholder="Search by name or category" className="w-full pl-10 pr-3 py-2.5 bg-background rounded-xl border border-border outline-none focus:border-primary" />
          </div>
          <select aria-label="Filter service category" value={category} onChange={event => setCategory(event.target.value)}
            className="w-full p-2 bg-background border border-border rounded-lg">
            <option value="">All categories</option>{categories.map(value => <option key={value}>{value}</option>)}
          </select>
          <p className="text-xs text-secondary" role="status">{browseMatches.length.toLocaleString()} services</p>
        </div>
        <div className="overflow-y-auto flex-1 p-3 space-y-1">
          {browseMatches.slice(0, limit).map(service => <button type="button" key={service.id} onClick={() => select(service)}
            className="w-full flex gap-3 items-center text-left p-3 rounded-xl hover:bg-primary/10">
            <span className="w-10 h-10 shrink-0 bg-white rounded-lg overflow-hidden"><SubscriptionLogo name={service.name} service={service} /></span>
            <span className="min-w-0"><span className="block font-semibold truncate">{service.name}</span>
              <span className="block text-xs text-secondary truncate">{service.category} · {service.domain}</span></span>
          </button>)}
          {!browseMatches.length && <p className="text-center text-sm text-secondary py-6">No matching services. You can add your own service name.</p>}
          {browseMatches.length > limit && <button type="button" onClick={() => setLimit(value => value + 40)}
            className="w-full p-3 text-primary text-sm font-semibold">Show more</button>}
        </div>
        <LogoAttribution />
      </div>
    </dialog>
  </div>;
}
