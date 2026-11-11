import React, { useEffect, useMemo, useState } from 'react';
import { formatShortDate } from '../services/formatting';
import { AlertTriangle, Loader2, LocateFixed, Map as MapIcon, MapPin, Navigation, RefreshCw, Search, Store, Trophy, X } from 'lucide-react';
import {
  SHOPS_STALE_AFTER_MS, SHOP_TYPES, SHOP_TYPE_COLOR, SHOP_TYPE_LABEL, countByType, distanceKm, fetchPokemonShops, filterShops, inSingapore,
  locationErrorMessage, readCachedShops, searchPlace, type Place, type PokemonShopList, type ShopSort, type ShopType,
} from '../services/pokemonShopService';

// Every official Pokémon TCG shop in Singapore - Pokémon Card Gyms, card shops and retailers -
// from the official shop map, so you don't have to open it. The list stays on this device.

// Leaflet only loads when the map is shown.
const PokemonShopsMap = React.lazy(() => import('./PokemonShopsMap'));
const MAP_PREF_KEY = 'subtrack_pokemon_shops_map';
const input = 'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-textMain';
const PAGE = 10;
const AREAS = ['Central', 'East', 'North', 'North-East', 'West'];

export default function PokemonShopsPanel() {
  const [list, setList] = useState<PokemonShopList | null>(() => readCachedShops());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [request, setRequest] = useState<{ refresh: boolean; n: number } | null>(() => {
    const cached = readCachedShops();
    return !cached || Date.now() - Date.parse(cached.fetchedAt) > SHOPS_STALE_AFTER_MS ? { refresh: false, n: 0 } : null;
  });
  const [query, setQuery] = useState('');
  const [types, setTypes] = useState<ShopType[]>([]);
  const [area, setArea] = useState('');
  const [showSevenEleven, setShowSevenEleven] = useState(false);
  const [sort, setSort] = useState<ShopSort>('type');
  const [here, setHere] = useState<Place | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [placeQuery, setPlaceQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [showMap, setShowMap] = useState(() => { try { return localStorage.getItem(MAP_PREF_KEY) !== 'hidden'; } catch { return true; } });
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const toggleMap = () => setShowMap(current => {
    try { localStorage.setItem(MAP_PREF_KEY, current ? 'hidden' : 'shown'); } catch { /* storage blocked */ }
    return !current;
  });

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    fetchPokemonShops(request.refresh, controller.signal)
      .then(next => { if (!controller.signal.aborted) setList(next); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'The shop list couldn\'t be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [request]);

  useEffect(() => setShown(PAGE), [query, types, area, showSevenEleven, sort, here]);

  const measureFrom = (place: Place) => { setHere(place); setSort('distance'); setLocationError(''); };

  const locate = () => {
    if (!navigator.geolocation) { setLocationError(locationErrorMessage('unsupported')); return; }
    setLocating(true); setLocationError('');
    navigator.geolocation.getCurrentPosition(
      position => {
        setLocating(false);
        const { latitude, longitude } = position.coords;
        if (!inSingapore(latitude, longitude)) { setLocationError(locationErrorMessage('outside')); return; }
        measureFrom({ latitude, longitude, label: 'your location' });
      },
      failure => { setLocating(false); setLocationError(locationErrorMessage(failure.code)); },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  };

  // If location is already allowed for this site, use it straight away - no prompt.
  useEffect(() => {
    let active = true;
    navigator.permissions?.query({ name: 'geolocation' as PermissionName })
      .then(status => { if (active && status.state === 'granted') locate(); })
      .catch(() => { /* Permissions API unavailable */ });
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const findPlace = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!placeQuery.trim()) return;
    setLocating(true); setLocationError('');
    try {
      const place = await searchPlace(placeQuery);
      if (place) measureFrom(place);
      else setLocationError(`Couldn't find "${placeQuery.trim()}" in Singapore. Try a 6-digit postal code.`);
    } catch {
      setLocationError('The address search isn\'t reachable right now. Try again shortly.');
    } finally {
      setLocating(false);
    }
  };

  const clearHere = () => { setHere(null); setPlaceQuery(''); setLocationError(''); if (sort === 'distance') setSort('type'); };

  const shops = list?.shops || [];
  const counts = useMemo(() => countByType(shops, showSevenEleven), [shops, showSevenEleven]);
  const visible = useMemo(() => filterShops(shops, { query, types, area, showSevenEleven, sort, here }), [shops, query, types, area, showSevenEleven, sort, here]);
  const nearest = useMemo(() => (sort === 'distance' && here ? visible.slice(0, PAGE) : null), [sort, here, visible]);
  const gyms = counts['gym'] + counts['gym-deluxe'];
  const sevenElevens = shops.filter(shop => shop.sevenEleven).length;

  const toggleType = (type: ShopType) => setTypes(current => current.includes(type) ? current.filter(item => item !== type) : [...current, type]);
  const showOnMap = (id: string) => {
    if (!showMap) toggleMap();
    setFocus({ id, n: Date.now() });
  };

  return (
    <section className="space-y-4 rounded-3xl border border-border bg-surface p-4 text-textMain sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xl font-extrabold"><Store size={20} className="text-primary" /> Shops & gyms in Singapore</h2>
          <p className="mt-1 text-sm text-secondary">Every official Pokémon TCG store: Pokémon Card Gyms for playing, card shops and retailers for buying.</p>
          <p className="mt-1 text-xs text-secondary">
            {list
              ? <>{shops.length - sevenElevens} stores, including {gyms} gyms{sevenElevens > 0 && <> · plus {sevenElevens} 7-Elevens</>} · from the <a href={list.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">official shop map</a> · updated {formatShortDate(list.fetchedAt)}</>
              : loading ? 'Loading the official shop list…' : 'No list loaded yet.'}
          </p>
        </div>
        <button type="button" disabled={loading} onClick={() => setRequest({ refresh: true, n: Date.now() })}
          className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-bold hover:border-primary disabled:opacity-50">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}{shops.length > 0 && ' Showing the last list saved on this device.'}</p>}

      {shops.length > 0 && (
        <>
          {/* Where to measure from: the device's location, or a postal code / place. */}
          <div className="rounded-2xl border border-border bg-background p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={locate} disabled={locating}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-white disabled:opacity-60">
                {locating ? <Loader2 size={15} className="animate-spin" /> : <LocateFixed size={15} />} Use my location
              </button>
              <span className="text-xs text-secondary">or</span>
              <form onSubmit={findPlace} className="flex min-w-[220px] flex-1 gap-2">
                <input className={input} value={placeQuery} onChange={e => setPlaceQuery(e.target.value)} placeholder="Postal code, street or MRT station" aria-label="Postal code, street or MRT station" />
                <button type="submit" disabled={locating || !placeQuery.trim()} className="rounded-xl border border-border px-3 py-2 text-sm font-bold hover:border-primary disabled:opacity-50">Go</button>
              </form>
            </div>
            {locationError && <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{locationError}</p>}
            {here && !locationError && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <MapPin size={13} /> Showing stores nearest to {here.label}.
                <button type="button" onClick={clearHere} className="inline-flex items-center gap-0.5 font-bold text-secondary hover:text-textMain"><X size={12} /> Clear</button>
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {SHOP_TYPES.filter(item => counts[item.type] > 0).map(item => {
              const on = types.includes(item.type);
              return (
                <button key={item.type} type="button" aria-pressed={on} onClick={() => toggleType(item.type)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${on ? 'border-primary bg-primary text-white' : 'border-border bg-background text-secondary hover:border-primary/40 hover:text-textMain'}`}>
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full ring-1 ring-white/60" style={{ background: SHOP_TYPE_COLOR[item.type] }} />
                  {item.play && <Trophy size={12} />}{item.label} <span className={on ? 'text-white/80' : 'text-secondary'}>{counts[item.type]}</span>
                </button>
              );
            })}
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="relative">
              <span className="sr-only">Search shops</span>
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
              <input className={`${input} pl-9`} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search store name, mall or street" />
            </label>
            <select className={input} aria-label="Area" value={area} onChange={e => setArea(e.target.value)}>
              <option value="">All areas</option>
              {AREAS.map(name => <option key={name}>{name}</option>)}
            </select>
            <select className={input} aria-label="Sort" value={sort} onChange={e => { const next = e.target.value as ShopSort; if (next === 'distance' && !here) locate(); else setSort(next); }}>
              {here && <option value="distance">Nearest first</option>}
              <option value="type">Gyms first</option>
              <option value="name">Name A–Z</option>
              {!here && <option value="distance">Nearest to me</option>}
            </select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-secondary">
            <span role="status">{visible.length} {visible.length === 1 ? 'store' : 'stores'}{sort === 'distance' && here ? ', nearest first' : ''}</span>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={toggleMap} aria-pressed={showMap} className="inline-flex items-center gap-1 font-bold text-primary"><MapIcon size={13} /> {showMap ? 'Hide map' : 'Show map'}</button>
              <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={showSevenEleven} onChange={e => setShowSevenEleven(e.target.checked)} /> Include 7-Eleven ({sevenElevens})</label>
            </div>
          </div>

          {showMap && (
            <React.Suspense fallback={<div className="flex h-[clamp(320px,52vh,500px)] items-center justify-center rounded-2xl border border-border text-sm text-secondary"><Loader2 size={16} className="mr-2 animate-spin" /> Loading the map…</div>}>
              <PokemonShopsMap shops={visible} here={here} nearest={nearest} focus={focus} />
            </React.Suspense>
          )}

          {visible.length === 0
            ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-secondary">No stores match these filters.</p>
            : (
              <ul className="grid gap-2 lg:grid-cols-2">
                {visible.slice(0, shown).map((shop, index) => {
                  const play = shop.type === 'gym' || shop.type === 'gym-deluxe';
                  const selected = focus?.id === shop.id;
                  return (
                    <li key={shop.id} className={`flex items-stretch rounded-2xl border bg-background transition-colors ${selected ? 'border-primary ring-1 ring-primary' : play ? 'border-primary/40' : 'border-border'} hover:border-primary`}>
                      {/* The whole card zooms the map to the store. */}
                      <button type="button" onClick={() => showOnMap(shop.id)} className="flex min-w-0 flex-1 gap-3 p-3 text-left" aria-label={`Show ${shop.name} on the map`}>
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: SHOP_TYPE_COLOR[shop.type] }}>
                          {sort === 'distance' && here ? <span className="text-sm font-extrabold">{index + 1}</span> : play ? <Trophy size={17} /> : <MapPin size={17} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-bold leading-snug">{shop.name}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${play ? 'bg-primary text-white' : 'border border-border text-secondary'}`}>{SHOP_TYPE_LABEL[shop.type]}</span>
                          </span>
                          <span className="mt-1 block text-xs leading-relaxed text-secondary">{shop.address || 'Address not listed'}</span>
                          <span className="mt-1 block text-[11px] text-secondary">{here ? <strong className="text-textMain">{distanceKm(here, shop).toFixed(1)} km away</strong> : shop.area}{here && <> · {shop.area}</>}</span>
                        </span>
                      </button>
                      <a href={shop.mapUrl} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${shop.name}`} title="Directions"
                        className="m-3 ml-0 self-center rounded-xl border border-border p-2 text-primary hover:border-primary"><Navigation size={15} /></a>
                    </li>
                  );
                })}
              </ul>
            )}
          {visible.length > shown && <button type="button" onClick={() => setShown(count => count + PAGE)} className="w-full rounded-xl border border-border py-2 text-sm font-bold text-primary hover:border-primary">Show {Math.min(PAGE, visible.length - shown)} more ({visible.length - shown} left)</button>}
          <p className="text-[11px] leading-relaxed text-secondary">Stores and types come from Pokémon's official shop map and can change; check a gym's own page for event times before you go. Distances are straight-line. Address search by OneMap.</p>
        </>
      )}

      {loading && shops.length === 0 && <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-8 text-sm text-secondary"><Loader2 size={16} className="animate-spin" /> Loading every official store…</div>}
    </section>
  );
}
