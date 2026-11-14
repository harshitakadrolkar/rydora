import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Circle, Polyline, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CITY_CENTER } from '../lib/format';

export const DRIVER_COLORS = { available: '#34d399', busy: '#a78bfa', offered: '#fbbf24', offline: '#64748b', stalled: '#f43f5e' };

const iconCache = {};
export function carIcon(status, highlight = false, ev = false) {
  const key = status + highlight + ev;
  if (!iconCache[key]) {
    const c = DRIVER_COLORS[status] || '#94a3b8';
    const size = highlight ? 22 : 16;
    iconCache[key] = L.divIcon({
      className: 'marker-wrap',
      html: `<div class="car-dot" style="width:${size}px;height:${size}px;background:${c};color:${c};${highlight ? 'border-width:3px;' : ''}${ev ? 'outline:2px solid #22c55e;outline-offset:2px;' : ''}"></div>`,
      iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    });
  }
  return iconCache[key];
}
export function pinIcon(letter, color) {
  return L.divIcon({ className: 'marker-wrap', html: `<div class="pin" style="background:${color}"><span>${letter}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 30] });
}
export const PICKUP_ICON = pinIcon('P', '#34d399');
export const DROP_ICON = pinIcon('D', '#f472b6');

export function BaseMap({ center = CITY_CENTER, zoom = 12, className = 'h-[420px]', children }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-white/[.06] ${className}`}>
      <MapContainer center={center} zoom={zoom} className="h-full w-full" scrollWheelZoom>
        <Tiles />
        {children}
      </MapContainer>
    </div>
  );
}

const TILE_SOURCES = [
  // Free OpenStreetMap tiles (no API key), darkened with a CSS filter to match the theme
  { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', dark: true },
  // Fallback mirror
  { url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> France', dark: true },
];
let preferredSource = 0;

/** Dark CARTO basemap with automatic fallback to OpenStreetMap if tiles fail to load. */
function Tiles() {
  const [idx, setIdx] = useState(preferredSource);
  const errors = useRef(0);
  const src = TILE_SOURCES[idx];
  return (
    <TileLayer key={src.url} url={src.url} attribution={src.attribution} className={src.dark ? 'osm-dark' : ''}
      eventHandlers={{ tileerror: () => { errors.current += 1; if (errors.current > 4 && idx < TILE_SOURCES.length - 1) { preferredSource = idx + 1; errors.current = 0; setIdx(idx + 1); } } }} />
  );
}

export function FitBounds({ points, padding = 60, maxZoom = 15 }) {
  const map = useMap();
  const key = JSON.stringify(points.map((p) => [p.lat?.toFixed(3), p.lng?.toFixed(3)]));
  useEffect(() => {
    const valid = points.filter((p) => p && Number.isFinite(p.lat));
    if (valid.length === 1) map.setView([valid[0].lat, valid[0].lng], 14);
    else if (valid.length > 1) map.fitBounds(L.latLngBounds(valid.map((p) => [p.lat, p.lng])), { padding: [padding, padding], maxZoom });
  }, [key]);
  return null;
}

export function ClickToPick({ onPick }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

export function DriverMarkers({ drivers, highlightId, onClick }) {
  return drivers.map((d) => (
    <Marker key={d._id} position={[d.location.lat, d.location.lng]} icon={carIcon(d.stalled ? 'stalled' : d.status, d._id === highlightId, d.ev)} eventHandlers={onClick ? { click: () => onClick(d) } : undefined}>
      <Popup>
        <b>{d.name}</b><br />
        {d.status}{d.category ? ` · ${d.category}` : ''}{d.ev ? ' · EV' : ''}{d.female ? ' · woman driver' : ''}{d.isSimulated === false ? ' · real user' : ' · simulated'}
      </Popup>
    </Marker>
  ));
}

export function surgeColor(s) {
  if (s >= 2) return '#f43f5e';
  if (s >= 1.5) return '#f97316';
  if (s > 1) return '#fbbf24';
  return '#34d399';
}

export function ZoneCircles({ zones, mode = 'surge', onClick }) {
  return zones.map((z) => {
    const color = mode === 'surge' ? surgeColor(z.surge) : mode === 'status'
      ? ({ shortage: '#f43f5e', tight: '#fbbf24', balanced: '#38bdf8', surplus: '#34d399' })[z.status] : '#8b5cf6';
    return (
      <Circle key={z.zoneId} center={[z.lat, z.lng]} radius={1700} pathOptions={{ color, fillColor: color, fillOpacity: 0.16, weight: 1.5 }} eventHandlers={onClick ? { click: () => onClick(z) } : undefined}>
        <Tooltip direction="center" permanent className="!bg-transparent !border-0 !shadow-none !text-white !font-semibold">{z.name.split(' ')[0]} {z.surge > 1 ? `${z.surge}x` : ''}</Tooltip>
      </Circle>
    );
  });
}

/** Simple heatmap: intensity-weighted circles (no paid plugin needed). */
export function HeatLayer({ points, max }) {
  const m = useMemo(() => max || Math.max(1, ...points.map((p) => p.value || 1)), [points, max]);
  return points.map((p, i) => {
    const t = Math.min(1, (p.value || 1) / m);
    const color = t > 0.75 ? '#f43f5e' : t > 0.5 ? '#f97316' : t > 0.25 ? '#fbbf24' : '#8b5cf6';
    return <CircleMarker key={i} center={[p.lat, p.lng]} radius={p.radius || 6 + t * 26} pathOptions={{ stroke: false, fillColor: color, fillOpacity: 0.18 + t * 0.35 }}>{p.label && <Tooltip>{p.label}</Tooltip>}</CircleMarker>;
  });
}

/** Red zones where heavy traffic slows vehicles down (the router avoids them). */
export function TrafficLayer({ incidents = [] }) {
  return incidents.map((i) => (
    <Circle key={i.id} center={[i.center.lat, i.center.lng]} radius={i.radiusKm * 1000} pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.22, weight: 2, dashArray: '4 4' }}>
      <Tooltip>{i.cause} · {i.name} · traffic moving at {i.speedPct}% speed</Tooltip>
    </Circle>
  ));
}

/** Planned road route (solid) and, after a reroute, the abandoned route (red dashed). */
export function RouteLines({ route, previous }) {
  return (
    <>
      {previous?.length > 1 && <Polyline positions={previous.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#ef4444', weight: 4, opacity: 0.6, dashArray: '8 8' }}><Tooltip>Old route (heavy traffic)</Tooltip></Polyline>}
      {route?.length > 1 && <Polyline positions={route.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#22d3ee', weight: 5, opacity: 0.9 }}><Tooltip>Planned route</Tooltip></Polyline>}
    </>
  );
}

export { Marker, Popup, Polyline, Circle, CircleMarker, Tooltip };
