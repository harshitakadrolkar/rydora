import { round } from '../utils/geo.js';

export const CATEGORIES = {
  mini:  { label: 'Rydora Mini',  base: 40, perKm: 11, perMin: 1.2, seats: 4 },
  sedan: { label: 'Rydora Sedan', base: 50, perKm: 14, perMin: 1.5, seats: 4 },
  suv:   { label: 'Rydora XL',    base: 70, perKm: 18, perMin: 2.0, seats: 6 },
};
export const POOL_DISCOUNT_MATCHED = 0.30;   // when actually sharing the ride
export const POOL_DISCOUNT_UNMATCHED = 0.15; // pool request still waiting for co-riders
export const PLATFORM_COMMISSION = 0.2;

export function estimateFare({ distanceKm, durationMin, category = 'sedan', surge = 1, pool = false, matched = false }) {
  const c = CATEGORIES[category] || CATEGORIES.sedan;
  const distanceCharge = distanceKm * c.perKm;
  const timeCharge = durationMin * c.perMin;
  const subtotal = c.base + distanceCharge + timeCharge;
  const surged = subtotal * surge;
  const discountPct = pool ? (matched ? POOL_DISCOUNT_MATCHED : POOL_DISCOUNT_UNMATCHED) : 0;
  const total = surged * (1 - discountPct);
  return {
    base: c.base, distanceCharge: round(distanceCharge), timeCharge: round(timeCharge),
    subtotal: round(subtotal), surge, soloEquivalent: Math.round(surged),
    poolDiscountPct: discountPct * 100, total: Math.round(total),
  };
}
