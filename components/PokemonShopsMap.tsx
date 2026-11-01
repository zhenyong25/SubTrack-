import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SHOP_TYPE_COLOR, SHOP_TYPE_LABEL, type PokemonShop } from '../services/pokemonShopService';

// The shops on an OpenStreetMap map: one dot per store, coloured by type, gyms a little larger.
// Dots are drawn on a canvas so all 600-odd stores stay quick. Clicking a dot shows the store;
// `focus` flies to one (from the list's "show on map").

const SINGAPORE: L.LatLngTuple = [1.3521, 103.8198];

interface Props {
  shops: PokemonShop[];
  here: { latitude: number; longitude: number; label?: string } | null;
  nearest: PokemonShop[] | null; // with a location: frame it and these stores instead of everything
  focus: { id: string; n: number } | null;
}

// Popup contents built from text nodes, never HTML strings - names come from an outside feed.
const popupFor = (shop: PokemonShop) => {
  const box = document.createElement('div');
  box.style.cssText = 'display:grid;gap:3px;font-size:12px;line-height:1.35;max-width:230px';
  const title = document.createElement('strong');
  title.style.fontSize = '13px';
  title.textContent = shop.name;
  const type = document.createElement('div');
  type.style.cssText = `font-weight:700;color:${SHOP_TYPE_COLOR[shop.type]}`;
  type.textContent = SHOP_TYPE_LABEL[shop.type];
  const address = document.createElement('div');
  address.textContent = shop.address || 'Address not listed';
  const link = document.createElement('a');
  link.href = shop.mapUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Directions ↗';
  box.append(title, type, address, link);
  return box;
};

const PokemonShopsMap: React.FC<Props> = ({ shops, here, nearest, focus }) => {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const hereLayer = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<string, L.CircleMarker>());

  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, { center: SINGAPORE, zoom: 11, preferCanvas: true, scrollWheelZoom: false, zoomControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(instance);
    // Wheel zoom only after you click the map, so scrolling the page doesn't get caught by it.
    instance.on('click', () => instance.scrollWheelZoom.enable());
    instance.on('mouseout', () => instance.scrollWheelZoom.disable());
    layer.current = L.layerGroup().addTo(instance);
    hereLayer.current = L.layerGroup().addTo(instance);
    map.current = instance;
    return () => { instance.remove(); map.current = null; markers.current.clear(); };
  }, []);

  // Redraw the dots for the current filters.
  const shopKey = shops.map(shop => shop.id).join(',');
  useEffect(() => {
    const instance = map.current;
    if (!instance || !layer.current) return;
    layer.current.clearLayers();
    markers.current.clear();
    // Gyms last so they sit on top of nearby shops.
    [...shops].sort((a, b) => Number(a.type.startsWith('gym')) - Number(b.type.startsWith('gym'))).forEach(shop => {
      const gym = shop.type === 'gym' || shop.type === 'gym-deluxe' || shop.type === 'pokemon-center';
      const marker = L.circleMarker([shop.latitude, shop.longitude], {
        radius: gym ? 8 : 6, color: '#ffffff', weight: 1.5, fillColor: SHOP_TYPE_COLOR[shop.type], fillOpacity: 0.9,
      }).bindPopup(() => popupFor(shop)).bindTooltip(shop.name, { direction: 'top', offset: [0, -6] });
      marker.addTo(layer.current!);
      markers.current.set(shop.id, marker);
    });
  }, [shopKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Frame what matters: you and your nearest stores when there's a location, else every dot.
  const nearestKey = nearest ? nearest.map(shop => shop.id).join(',') : '';
  const hereKey = here ? `${here.latitude},${here.longitude}` : '';
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const points: L.LatLngTuple[] = nearest && here
      ? [[here.latitude, here.longitude], ...nearest.map(shop => [shop.latitude, shop.longitude] as L.LatLngTuple)]
      : shops.map(shop => [shop.latitude, shop.longitude] as L.LatLngTuple);
    if (points.length === 1) instance.setView(points[0], 16);
    else if (points.length > 1) instance.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 16 });
  }, [shopKey, nearestKey, hereKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    hereLayer.current?.clearLayers();
    if (!here || !hereLayer.current) return;
    L.circleMarker([here.latitude, here.longitude], { radius: 7, color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 })
      .bindTooltip(!here.label || here.label === 'your location' ? 'You are here' : here.label, { direction: 'top', offset: [0, -6], permanent: true }).addTo(hereLayer.current);
  }, [here]);

  useEffect(() => {
    const instance = map.current;
    const marker = focus && markers.current.get(focus.id);
    if (!instance || !marker) return;
    element.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    instance.flyTo(marker.getLatLng(), Math.max(instance.getZoom(), 16), { duration: 0.6 });
    instance.once('moveend', () => marker.openPopup());
  }, [focus]);

  return <div ref={element} className="relative z-0 h-[clamp(320px,52vh,500px)] w-full overflow-hidden rounded-2xl border border-border" role="region" aria-label="Map of Pokémon TCG stores" />;
};

export default PokemonShopsMap;
