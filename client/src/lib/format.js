export const inr = (v) => `₹${Math.round(v || 0).toLocaleString('en-IN')}`;
export const km = (v) => `${(+v || 0).toFixed(1)} km`;
export const mins = (v) => `${Math.max(0, Math.round(+v || 0))} min`;
export const time = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-');
export const dateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');
export const pct = (v) => `${Math.round((+v || 0) * 100)}%`;
export const ago = (d) => {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
};
export const CITY_CENTER = [12.9550, 77.6350];
