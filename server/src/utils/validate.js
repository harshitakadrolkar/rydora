export const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
export const isPhone = (s) => typeof s === 'string' && /^[+]?[0-9\s-]{8,15}$/.test(s);
export const isPoint = (p) => p && Number.isFinite(+p.lat) && Number.isFinite(+p.lng) && +p.lat > 12.6 && +p.lat < 13.4 && +p.lng > 77.3 && +p.lng < 77.95;
export function required(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || String(body[f]).trim() === '');
  return missing.length ? `Missing required field(s): ${missing.join(', ')}` : null;
}
