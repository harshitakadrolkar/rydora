import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MapPin, Navigation, Search, Users, CarFront, Zap, Clock, Route, FlaskConical, Crosshair, ArrowRight, AlertTriangle, Leaf, ShieldCheck, UserRound, Gift, Baby, Minus, Plus, RefreshCcw } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { api, errMsg } from '../../lib/api';
import { useApi, useFleet } from '../../lib/hooks';
import { useToast } from '../../context/ToastContext';
import { PageHeader, Section, Spinner, Badge, SimBadge } from '../../components/ui';
import { BaseMap, DriverMarkers, Marker, Polyline, PICKUP_ICON, DROP_ICON, ClickToPick, FitBounds } from '../../components/MapKit';
import { MatchPanel } from '../../components/RideBits';
import { inr, km, mins, pct } from '../../lib/format';

function PlacePicker({ label, icon: Icon, color, value, onChange, places, active, onActivate }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const list = useMemo(() => places.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8), [q, places]);
  return (
    <div className="relative">
      <label className="label">{label}</label>
      <div className={`flex items-center gap-2 rounded-xl border bg-ink-900/70 px-3 ${active ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-white/10'}`}>
        <Icon className={`h-4 w-4 shrink-0 ${color}`} />
        <input className="w-full bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-slate-500" placeholder="Search a landmark..." value={open ? q : value?.address || ''}
          onFocus={() => { setOpen(true); setQ(''); }} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => setQ(e.target.value)} />
        <button type="button" onClick={onActivate} title="Pick on map" className={`rounded-lg p-1.5 ${active ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'}`}><Crosshair className="h-4 w-4" /></button>
      </div>
      {open && (
        <div className="card absolute z-[1100] mt-1 max-h-64 w-full overflow-y-auto p-1">
          {list.map((p) => <button key={p.name} type="button" onMouseDown={() => { onChange({ lat: p.lat, lng: p.lng, address: p.name }); setOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/[.06]"><Search className="h-3.5 w-3.5 text-slate-500" />{p.name}</button>)}
          {!list.length && <p className="p-3 text-xs text-slate-500">No match - use the map picker instead.</p>}
        </div>
      )}
    </div>
  );
}

export default function BookRide() {
  const navigate = useNavigate();
  const toast = useToast();
  const fleet = useFleet();
  const { data: placesData } = useApi('/rides/places');
  const active = useApi('/rides/active');
  const places = placesData?.places || [];
  const [pickup, setPickup] = useState(null);
  const [drop, setDrop] = useState(null);
  const [pickMode, setPickMode] = useState('pickup');
  const [category, setCategory] = useState('sedan');
  const [type, setType] = useState('solo');
  const [scenario, setScenario] = useState('normal');
  const [est, setEst] = useState(null);
  const [estErr, setEstErr] = useState('');
  const [loadingEst, setLoadingEst] = useState(false);
  const [booking, setBooking] = useState(false);
  const [ev, setEv] = useState(false);
  const [women, setWomen] = useState(false);
  const [safety, setSafety] = useState(new Date().getHours() >= 21 || new Date().getHours() < 6);
  const [applyBonus, setApplyBonus] = useState(true);
  const [passengers, setPassengers] = useState(1);
  const [childSeat, setChildSeat] = useState(false);
  const [autoRebook, setAutoRebook] = useState(true);
  const poolBlocked = women || childSeat || passengers > 2;
  useEffect(() => { if (poolBlocked && type === 'pool') setType('solo'); if (passengers > 4) setCategory('suv'); }, [poolBlocked, passengers]);
  const location = useLocation();

  // Prefill from the voice assistant ("book an EV ride from Forum Mall to MG Road")
  useEffect(() => {
    const v = location.state?.voice;
    if (!v) return;
    if (v.pickup) setPickup(v.pickup);
    if (v.drop) setDrop(v.drop);
    if (v.ev) setEv(true);
    if (v.women) { setWomen(true); setSafety(true); setType('solo'); }
    if (v.pool) setType('pool');
  }, [location.state]);

  useEffect(() => {
    if (!pickup || !drop) { setEst(null); return undefined; }
    let cancel = false;
    setLoadingEst(true); setEstErr('');
    const t = setTimeout(() => api.post('/rides/estimate', { pickup, drop, category, ev, women, passengers, childSeat }).then(({ data }) => { if (!cancel) setEst(data); })
      .catch((e) => { if (!cancel) { setEst(null); setEstErr(errMsg(e)); } }).finally(() => !cancel && setLoadingEst(false)), 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [pickup, drop, category, ev, women, passengers, childSeat]);

  const onMapPick = (p) => {
    const pt = { ...p, address: `Pinned (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})` };
    if (pickMode === 'pickup') { setPickup(pt); setPickMode('drop'); } else { setDrop(pt); setPickMode(null); }
  };

  const book = async () => {
    if (!pickup || !drop) return toast('Choose locations', 'Select both pickup and destination', 'warning');
    setBooking(true);
    try {
      const { data } = await api.post('/rides', { pickup, drop, category, type, scenario, ev, women, safety, passengers, childSeat, autoRebook, applyGreenBonus: applyBonus && est?.greenCoupons > 0 });
      toast('Ride requested', `${data.ride.code} - matching engine is ranking drivers`, 'success');
      navigate(`/passenger/track/${data.ride._id}`);
    } catch (e) {
      toast('Could not book', errMsg(e), 'danger');
      if (e?.response?.data?.rideId) navigate(`/passenger/track/${e.response.data.rideId}`);
    } finally { setBooking(false); }
  };

  // voice command "confirm" -> book
  useEffect(() => {
    const h = (e) => { if (e.detail?.action === 'confirm') book(); };
    window.addEventListener('rydora:voice', h);
    return () => window.removeEventListener('rydora:voice', h);
  });

  const fare = est?.options.find((o) => o.category === category)?.fare;
  const bonusAmt = est && applyBonus && est.greenCoupons > 0 && fare ? Math.min(est.greenBonus.cap, Math.round((type === 'pool' ? est.pool.total : fare.total) * est.greenBonus.pct / 100)) : 0;
  const ranked = est?.drivers || [];
  const rankedIds = new Set(ranked.slice(0, 3).map((d) => d.driverId));

  return (
    <div>
      <PageHeader title="Book a ride" subtitle="Pick locations from the list or click the map. The matching engine previews driver ranking in real time." icon={CarFront} />
      {active.data?.ride && (
        <Link to={`/passenger/track/${active.data.ride._id}`} className="mb-4 flex items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200"><AlertTriangle className="h-4 w-4" />You already have an active ride ({active.data.ride.code}). Click to track it.</Link>
      )}
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-2">
          <Section title="Trip details">
            <div className="space-y-4">
              <PlacePicker label="Pickup" icon={MapPin} color="text-emerald-400" value={pickup} onChange={setPickup} places={places} active={pickMode === 'pickup'} onActivate={() => setPickMode('pickup')} />
              <PlacePicker label="Destination" icon={Navigation} color="text-pink-400" value={drop} onChange={setDrop} places={places} active={pickMode === 'drop'} onActivate={() => setPickMode('drop')} />
              {pickMode && <p className="text-xs text-brand-300">Click on the map to set the {pickMode === 'pickup' ? 'pickup point' : 'destination'}.</p>}
              <div>
                <label className="label">Ride type</label>
                <div className="grid grid-cols-2 gap-2">
                  {[['solo', 'Solo ride', CarFront], ['pool', 'Pool (share)', Users]].map(([v, l, I]) => (
                    <button key={v} disabled={v === 'pool' && poolBlocked} title={v === 'pool' && poolBlocked ? 'Pooling is available for 1-2 riders without a child seat or woman-driver request' : ''} onClick={() => setType(v)} className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-semibold ${type === v ? 'border-brand-500 bg-brand-500/15 text-white' : 'border-white/10 text-slate-400 hover:text-white'}`}><I className="h-4 w-4" />{l}</button>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="pax">Passengers</label>
                  <div className="flex items-center justify-between rounded-xl border border-white/10 bg-ink-900/70 px-2 py-1.5">
                    <button type="button" aria-label="Fewer passengers" onClick={() => setPassengers(Math.max(1, passengers - 1))} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10"><Minus className="h-4 w-4" /></button>
                    <span id="pax" className="font-display text-lg font-bold text-white">{passengers} <span className="text-xs font-normal text-slate-400">{passengers === 1 ? 'person' : 'people'}</span></span>
                    <button type="button" aria-label="More passengers" onClick={() => setPassengers(Math.min(6, passengers + 1))} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10"><Plus className="h-4 w-4" /></button>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{passengers > 4 ? 'XL (6-seater) required' : est ? `${est.seatsNearby} cars nearby fit ${passengers}` : 'Up to 4 in Mini/Sedan, 6 in XL'}</p>
                </div>
                <button type="button" onClick={() => setChildSeat(!childSeat)} className={`flex items-start gap-2 rounded-xl border p-3 text-left ${childSeat ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 hover:bg-white/[.03]'}`}>
                  <Baby className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <span className="min-w-0"><span className="block text-sm font-semibold text-white">Baby / toddler</span><span className="block text-[11px] text-slate-400">{est ? `${est.childSeatNearby} cars with a child car seat nearby` : 'Only cars with a child car seat'}</span></span>
                </button>
              </div>
              <div>
                <label className="label">Ride preferences</label>
                <div className="space-y-2">
                  {[
                    { on: ev, set: (x) => setEv(x), icon: Leaf, color: 'text-emerald-400', title: 'EV only (eco ride)', text: est ? `${est.evNearby} electric vehicles nearby · avoids ~${est.co2Kg} kg CO₂ · earns 10% off your next ride` : 'Electric vehicles only · earn a green bonus' },
                    { on: women, set: (x) => { setWomen(x); if (x) { setType('solo'); setSafety(true); } }, icon: UserRound, color: 'text-pink-400', title: 'Woman driver', text: est ? `${est.womenNearby} women drivers nearby · we wait for one rather than assign anyone else` : 'Only women drivers will be offered this ride' },
                    { on: safety, set: (x) => setSafety(x), icon: ShieldCheck, color: 'text-aqua-400', title: 'Safety monitoring', text: 'Alerts you if the driver leaves the route or stops unexpectedly (always on 9 pm - 6 am)' },
                  ].map((p) => (
                    <button key={p.title} type="button" onClick={() => p.set(!p.on)} className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${p.on ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 hover:bg-white/[.03]'}`}>
                      <p.icon className={`mt-0.5 h-4 w-4 shrink-0 ${p.color}`} />
                      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">{p.title}</span><span className="block text-xs text-slate-400">{p.text}</span></span>
                      <span className={`mt-0.5 h-5 w-9 shrink-0 rounded-full p-0.5 transition ${p.on ? 'bg-brand-500' : 'bg-white/15'}`}><span className={`block h-4 w-4 rounded-full bg-white transition ${p.on ? 'translate-x-4' : ''}`} /></span>
                    </button>
                  ))}
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 p-3">
                    <RefreshCcw className="h-4 w-4 text-auto-400" />
                    <span className="flex-1 text-sm text-white">Auto-rebook if this ride is cancelled <span className="block text-xs text-slate-400">If the driver can't make it or no driver is found, we book again for you with priority</span></span>
                    <input id="auto-rebook" type="checkbox" checked={autoRebook} onChange={(e) => setAutoRebook(e.target.checked)} className="h-4 w-4 accent-yellow-400" />
                  </label>
                  {est?.greenCoupons > 0 && (
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/[.06] p-3">
                      <Gift className="h-4 w-4 text-emerald-300" />
                      <span className="flex-1 text-sm text-white">Use green bonus <span className="text-xs text-slate-400">({est.greenCoupons} available · 10% off, max ₹50)</span></span>
                      <input id="use-bonus" type="checkbox" checked={applyBonus} onChange={(e) => setApplyBonus(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
                    </label>
                  )}
                </div>
              </div>
              {type === 'solo' && est && (
                <div>
                  <label className="label">Vehicle</label>
                  <div className="space-y-2">
                    {est.options.map((o) => (
                      <button key={o.category} disabled={passengers > o.seats} title={passengers > o.seats ? `Fits only ${o.seats}` : ''} onClick={() => setCategory(o.category)} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left disabled:opacity-40 ${category === o.category ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 hover:bg-white/[.03]'}`}>
                        <div><p className="text-sm font-semibold text-white">{o.label}</p><p className="text-xs text-slate-500">{o.seats} seats</p></div>
                        <p className="font-display text-lg font-bold text-white">{inr(o.fare.total)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="label flex items-center gap-1"><FlaskConical className="h-3 w-3" />Demo scenario (reassignment)</label>
                <select className="input" value={scenario} onChange={(e) => setScenario(e.target.value)}>
                  <option value="normal">Normal - drivers respond by their own acceptance behaviour</option>
                  <option value="reject_first">First driver rejects → automatic reassignment</option>
                  <option value="timeout_first">First driver does not respond → timeout reassignment</option>
                  <option value="late_night">Late-night ride → safety monitoring on</option>
                </select>
              </div>
            </div>
          </Section>
          <Section title="Fare estimate" right={est?.surge > 1 ? <Badge status="shortage">Surge {est.surge}x</Badge> : null}>
            {loadingEst ? <div className="flex justify-center py-6"><Spinner /></div> : estErr ? <p className="text-sm text-rose-300">{estErr}</p> : !est ? <p className="text-sm text-slate-500">Select pickup and destination to see the estimate.</p> : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-white/[.03] p-3"><Route className="mx-auto mb-1 h-4 w-4 text-brand-300" /><p className="text-sm font-bold text-white">{km(est.distanceKm)}</p><p className="text-[10px] text-slate-500">Road distance</p></div>
                  <div className="rounded-xl bg-white/[.03] p-3"><Clock className="mx-auto mb-1 h-4 w-4 text-aqua-400" /><p className="text-sm font-bold text-white">{mins(est.durationMin)}</p><p className="text-[10px] text-slate-500">Trip time</p></div>
                  <div className="rounded-xl bg-white/[.03] p-3"><Zap className="mx-auto mb-1 h-4 w-4 text-amber-400" /><p className="text-sm font-bold text-white">{ranked[0] ? mins(ranked[0].etaMin) : '-'}</p><p className="text-[10px] text-slate-500">Pickup ETA</p></div>
                </div>
                {type === 'pool' ? (
                  <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[.06] p-4">
                    <p className="text-xs uppercase tracking-wide text-emerald-300">Pool fare (when matched)</p>
                    <div className="mt-1 flex items-end gap-3"><p className="font-display text-3xl font-bold text-white">{inr(est.pool.total)}</p><p className="pb-1 text-sm text-slate-500 line-through">{inr(est.pool.soloEquivalent)}</p></div>
                    <p className="mt-1 text-xs text-slate-400">Save {inr(est.pool.soloEquivalent - est.pool.total)} ({est.pool.poolDiscountPct}%). If no co-rider is found you pay a 15% discounted solo fare.</p>
                  </div>
                ) : fare && (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between text-slate-400"><span>Base fare</span><span>{inr(fare.base)}</span></div>
                    <div className="flex justify-between text-slate-400"><span>Distance charge</span><span>{inr(fare.distanceCharge)}</span></div>
                    <div className="flex justify-between text-slate-400"><span>Time charge</span><span>{inr(fare.timeCharge)}</span></div>
                    {fare.surge > 1 && <div className="flex justify-between text-amber-300"><span>Zone surge ({est.pickupZone.name})</span><span>x{fare.surge}</span></div>}
                    {bonusAmt > 0 && <div className="flex justify-between text-emerald-300"><span>Green bonus (10%)</span><span>- {inr(bonusAmt)}</span></div>}
                    <div className="flex justify-between border-t border-white/10 pt-2 font-semibold text-white"><span>Approx. total</span><span className="font-display text-xl">{inr(fare.total - bonusAmt)}</span></div>
                  </div>
                )}
                <button onClick={book} disabled={booking || !!active.data?.ride} className="btn-primary w-full">{booking ? <Spinner className="!text-white" /> : <>Confirm & request ride <ArrowRight className="h-4 w-4" /></>}</button>
              </div>
            )}
          </Section>
        </div>
        <div className="space-y-6 xl:col-span-3">
          <Section title="Map" subtitle="Green = available, purple = on trip. Top-ranked candidates are enlarged." right={<SimBadge text="Simulated fleet" />}>
            <BaseMap className="h-[440px]">
              <ClickToPick onPick={onMapPick} />
              <DriverMarkers drivers={fleet} highlightId={[...rankedIds][0]} />
              {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={PICKUP_ICON} />}
              {drop && <Marker position={[drop.lat, drop.lng]} icon={DROP_ICON} />}
              {pickup && drop && <Polyline positions={[[pickup.lat, pickup.lng], [drop.lat, drop.lng]]} pathOptions={{ color: '#a78bfa', weight: 4, opacity: 0.8 }} />}
              {pickup && ranked.slice(0, 3).map((d) => <Polyline key={d.driverId} positions={[[d.location.lat, d.location.lng], [pickup.lat, pickup.lng]]} pathOptions={{ color: '#34d399', weight: 1.5, dashArray: '4 6', opacity: 0.7 }} />)}
              <FitBounds points={[pickup, drop].filter(Boolean)} />
            </BaseMap>
          </Section>
          <Section title="Nearby driver discovery" subtitle="Live ranking from the weighted matching engine (preview - final match runs on booking).">
            {!est ? <p className="text-sm text-slate-500">Choose a pickup point to rank nearby drivers.</p> : !ranked.length ? <p className="text-sm text-amber-300">No drivers available nearby right now. Your request will be queued and retried automatically.</p> : (
              <>
                <div className="mb-4 overflow-x-auto"><table className="table-x"><thead><tr><th>#</th><th>Driver</th><th>Distance</th><th>ETA</th><th>Acceptance</th><th>Idle</th><th>Trips today</th><th>Score</th></tr></thead>
                  <tbody>{ranked.map((d, i) => (
                    <tr key={d.driverId}><td className="font-bold text-slate-500">{i + 1}</td><td><p className="font-medium text-white">{d.name}</p><p className="text-xs text-slate-500">{d.vehicle?.model} · {d.vehicle?.category}</p></td>
                      <td>{km(d.distanceKm)}{est.nearest?.driverId === d.driverId && <span className="ml-1"><Badge status="balanced">nearest</Badge></span>}</td><td>{mins(d.etaMin)}</td><td>{pct(d.acceptanceRate)}</td><td>{d.idleMin} min</td><td>{d.todayTrips}</td><td className="font-bold text-white">{d.score}</td></tr>
                  ))}</tbody></table></div>
                <MatchPanel match={{ chosen: ranked[0], ranked, nearest: est.nearest, explanation: est.explanation, upgraded: est.upgraded, candidates: ranked.length }} />
              </>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
