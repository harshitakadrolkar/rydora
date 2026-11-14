import { useEffect, useState, useCallback } from 'react';
import { Power, Wallet, Route, Percent, Star, Timer, Navigation, MapPin, Check, X, Compass, FlaskConical, Play, Flag, UserCheck, XCircle, BellRing, Sparkles } from 'lucide-react';
import { BarChart, Bar as RBar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api, errMsg } from '../../lib/api';
import { useSocketEvent } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useApi } from '../../lib/hooks';
import { PageHeader, StatCard, Section, Badge, Loading, Modal, Spinner, Empty, SimBadge, chartTooltip, axisProps } from '../../components/ui';
import { BaseMap, Marker, Polyline, PICKUP_ICON, DROP_ICON, carIcon, ZoneCircles, FitBounds, pinIcon, TrafficLayer, RouteLines } from '../../components/MapKit';
import { useTraffic } from '../../lib/hooks';
import { Baby, Users as UsersIcon, KeyRound } from 'lucide-react';
import { ScoreBreakdown } from '../../components/RideBits';
import { inr, km, mins, pct } from '../../lib/format';

const TARGET_ICON = pinIcon('R', '#22d3ee');

function OfferModal({ offer, onRespond, busy }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, []);
  if (!offer) return null;
  const r = offer.ride;
  const total = (offer.timeoutSec || 15) * 1000;
  const left = Math.max(0, offer.expiresAt - now);
  return (
    <Modal open title="New ride request">
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-amber-400 to-rose-500 transition-all" style={{ width: `${(left / total) * 100}%` }} /></div>
      <div className="mb-4 flex items-center justify-between">
        <div><p className="text-xs text-slate-400">Passenger</p><p className="font-semibold text-white">{r.passengerName}</p></div>
        <div className="text-right"><p className="text-xs text-slate-400">Respond within</p><p className="font-display text-2xl font-bold text-amber-300">{Math.ceil(left / 1000)}s</p></div>
      </div>
      <div className="space-y-2.5 rounded-xl bg-white/[.03] p-4">
        <div className="flex gap-3"><MapPin className="h-4 w-4 text-emerald-400" /><div><p className="text-xs text-slate-500">Pickup · {r.pickup.zoneName} · {km(offer.match?.distanceKm)} away</p><p className="text-sm text-white">{r.pickup.address}</p></div></div>
        <div className="flex gap-3"><Navigation className="h-4 w-4 text-pink-400" /><div><p className="text-xs text-slate-500">Destination · {r.drop.zoneName}</p><p className="text-sm text-white">{r.drop.address}</p></div></div>
      </div>
      {(r.passengers > 1 || r.prefs?.childSeat || r.prefs?.women) && <div className="mt-3 flex flex-wrap gap-2">
        {r.passengers > 1 && <span className="chip bg-white/10 text-slate-200"><UsersIcon className="h-3 w-3" />{r.passengers} passengers</span>}
        {r.prefs?.childSeat && <span className="chip bg-amber-400/15 text-amber-200"><Baby className="h-3 w-3" />Child seat needed</span>}
        {r.prefs?.women && <span className="chip bg-pink-500/15 text-pink-300">Woman-driver request</span>}
      </div>}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-white/[.03] p-2.5"><p className="text-sm font-bold text-white">{inr(r.fare.total * 0.8)}</p><p className="text-[10px] text-slate-500">Your earning</p></div>
        <div className="rounded-xl bg-white/[.03] p-2.5"><p className="text-sm font-bold text-white">{km(r.distanceKm)}</p><p className="text-[10px] text-slate-500">Trip</p></div>
        <div className="rounded-xl bg-white/[.03] p-2.5"><p className="text-sm font-bold text-white">{mins(offer.match?.etaMin)}</p><p className="text-[10px] text-slate-500">To pickup</p></div>
      </div>
      {offer.match?.contributions && <details className="mt-4 text-xs"><summary className="cursor-pointer text-brand-300">Why was I chosen? (score {offer.match.score})</summary><div className="mt-3"><ScoreBreakdown c={offer.match} /></div></details>}
      <p className="mt-3 text-[11px] text-slate-500">If you reject or do not respond, RYDORA automatically reassigns the ride to the next best driver.</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button className="btn-danger" disabled={busy} onClick={() => onRespond(false)}><X className="h-4 w-4" />Reject</button>
        <button className="btn-success" disabled={busy} onClick={() => onRespond(true)}><Check className="h-4 w-4" />Accept</button>
      </div>
    </Modal>
  );
}

export default function DriverDashboard() {
  const toast = useToast();
  const [state, setState] = useState(null);
  const [offer, setOffer] = useState(null);
  const [zones, setZones] = useState([]);
  const [busy, setBusy] = useState(false);
  const earnings = useApi('/drivers/me/earnings');
  const incidents = useTraffic();
  const [pinFor, setPinFor] = useState(null);
  const [pinVal, setPinVal] = useState('');

  const load = useCallback(() => api.get('/drivers/me').then(({ data }) => {
    setState(data);
    if (data.offer) setOffer((o) => o || { ...data.offer, timeoutSec: 15 });
    else setOffer(null);
  }).catch((e) => toast('Error', errMsg(e), 'danger')), []);
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [load]);
  useEffect(() => { api.get('/analytics/zones').then(({ data }) => setZones(data.zones)).catch(() => {}); }, []);

  useSocketEvent('driver:state', (d) => setState((s) => (s ? { ...s, driver: d } : s)));
  useSocketEvent('zones:update', (z) => setZones(z.zones));
  useSocketEvent('ride:offer', (o) => { setOffer(o); toast('New ride request', `${o.ride.passengerName} · ${o.ride.pickup.zoneName}`, 'info'); });
  useSocketEvent('ride:offer:cancelled', (p) => { setOffer(null); if (p.reason === 'timeout') toast('Offer expired', 'You did not respond in time - the ride was reassigned.', 'warning'); load(); });
  useSocketEvent('ride:update', () => load());
  useSocketEvent('ride:removed', (p) => { toast('Ride reassigned', p.reason.replaceAll('_', ' ').toLowerCase(), 'warning'); load(); });
  useSocketEvent('driver:repositioned', (p) => toast('Repositioned', `You reached ${p.zone}`, 'success'));
  useSocketEvent('driver:rerouted', (p) => { toast('Rerouted', `Heavy traffic near ${p.incident}. New route saves ${p.savedMin} min.`, 'info'); load(); });

  const call = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); if (okMsg) toast(okMsg, '', 'success'); await load(); earnings.reload(); }
    catch (e) { toast('Action failed', errMsg(e), 'danger'); } finally { setBusy(false); }
  };
  const respond = (accept) => call(async () => { await api.post(`/drivers/offers/${offer.ride._id}/respond`, { accept }); setOffer(null); }, accept ? 'Ride accepted' : 'Ride rejected');

  if (!state) return <Loading text="Loading driver console..." />;
  const d = state.driver;
  const online = d.status !== 'offline';
  const rides = state.rides || [];
  const sugg = state.suggestion;
  const nextStop = state.stops?.[0];

  return (
    <div>
      <PageHeader title="Driver console" subtitle={`${d.vehicle?.model} · ${d.vehicle?.plate} · ${d.vehicle?.category}${d.ev ? ' · electric' : ''}`} actions={<>
        <button disabled={busy || !online || d.status !== 'available'} onClick={() => call(() => api.post('/drivers/me/test-ride'), 'Test request created - offer arriving')} className="btn-ghost"><FlaskConical className="h-4 w-4 text-amber-400" />Request test ride</button>
        <button disabled={busy} onClick={() => call(() => api.post('/drivers/me/status', { online: !online }), online ? 'You are offline' : 'You are online')} className={online ? 'btn-danger' : 'btn-success'}><Power className="h-4 w-4" />{online ? 'Go offline' : 'Go online'}</button>
      </>} />

      <div className={`mb-6 flex items-center gap-3 rounded-2xl border p-4 ${online ? 'border-emerald-400/30 bg-emerald-400/[.07]' : 'border-white/10 bg-white/[.02]'}`}>
        <span className={`h-3 w-3 rounded-full ${online ? 'animate-pulse bg-emerald-400' : 'bg-slate-500'}`} />
        <p className="text-sm"><b className="text-white">{online ? (d.status === 'busy' ? 'On a trip' : d.hasOffer ? 'Reviewing an offer' : 'Online - waiting for requests') : 'You are offline'}</b>
          <span className="ml-2 text-slate-400">{online ? `Zone: ${zones.find((z) => z.zoneId === d.zoneId)?.name || d.zoneId} · idle ${d.idleMinutes} min` : 'Go online to receive ride requests.'}</span></p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Today's earnings" value={inr(d.stats.todayEarnings)} icon={Wallet} tone="green" />
        <StatCard label="Trips today" value={d.stats.todayTrips} icon={Route} />
        <StatCard label="Acceptance rate" value={pct(d.acceptanceRate)} hint={`${d.stats.accepted}/${d.stats.offered} offers`} icon={Percent} tone="aqua" />
        <StatCard label="Rating" value={d.rating?.toFixed(2)} icon={Star} tone="amber" />
        <StatCard label="Idle time" value={`${d.idleMinutes} min`} hint="Higher idle = higher priority" icon={Timer} tone="slate" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          <Section title="Live map" subtitle="Zones coloured by current surge. Your vehicle position is simulated." right={<SimBadge text="Simulated GPS" />}>
            <BaseMap className="h-[440px]">
              <ZoneCircles zones={zones} />
              <TrafficLayer incidents={incidents} />
              {rides.filter((r) => r.route).slice(0, 1).map((r) => <RouteLines key={r._id} route={r.route.points} previous={r.reroutes?.length ? r.reroutes[r.reroutes.length - 1].oldPoints : null} />)}
              <Marker position={[d.location.lat, d.location.lng]} icon={carIcon(d.status === 'offline' ? 'offline' : d.status, true)} />
              {rides.map((r) => <span key={r._id}>
                {r.status !== 'ONGOING' && <Marker position={[r.pickup.lat, r.pickup.lng]} icon={PICKUP_ICON} />}
                <Marker position={[r.drop.lat, r.drop.lng]} icon={DROP_ICON} />
              </span>)}
              {nextStop && <Polyline positions={[[d.location.lat, d.location.lng], [nextStop.lat, nextStop.lng]]} pathOptions={{ color: '#34d399', weight: 3, dashArray: '6 8' }} />}
              {d.repositionTarget && <><Marker position={[d.repositionTarget.lat, d.repositionTarget.lng]} icon={TARGET_ICON} /><Polyline positions={[[d.location.lat, d.location.lng], [d.repositionTarget.lat, d.repositionTarget.lng]]} pathOptions={{ color: '#22d3ee', dashArray: '4 6' }} /></>}
              <FitBounds points={[d.location, ...rides.flatMap((r) => [r.pickup, r.drop])]} />
            </BaseMap>
          </Section>
          <Section title="Weekly earnings">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={earnings.data?.days || []}><CartesianGrid stroke="#1c2550" vertical={false} /><XAxis dataKey="label" {...axisProps} /><YAxis {...axisProps} width={45} /><Tooltip {...chartTooltip} formatter={(v, n) => (n === 'earnings' ? inr(v) : v)} />
                <RBar dataKey="earnings" fill="#8b5cf6" radius={[6, 6, 0, 0]} /></BarChart>
            </ResponsiveContainer>
          </Section>
        </div>

        <div className="space-y-6 xl:col-span-2">
          <Section title="Current trip" right={rides.length > 1 ? <Badge status="surplus">Pool · {rides.length} riders</Badge> : null}>
            {!rides.length ? <Empty icon={BellRing} title={online ? 'Waiting for ride requests' : 'Offline'} text={online ? 'Requests appear here as a pop-up. Use “Request test ride” for a guided demo.' : 'Go online to start.'} /> : (
              <div className="space-y-4">
                {rides.map((r) => (
                  <div key={r._id} className="rounded-xl border border-white/[.06] bg-white/[.02] p-4">
                    <div className="mb-3 flex items-center justify-between"><div><p className="font-semibold text-white">{r.passengerName}</p><p className="text-xs text-slate-500">{r.code} · {inr(r.fare.total)}</p></div><Badge status={r.status} /></div>
                    {(r.passengers > 1 || r.prefs?.childSeat) && <p className="mb-2 flex gap-2 text-xs">{r.passengers > 1 && <span className="chip bg-white/10 text-slate-200">{r.passengers} passengers</span>}{r.prefs?.childSeat && <span className="chip bg-amber-400/15 text-amber-200">Child seat needed</span>}</p>}
                    <div className="space-y-1.5 text-xs">
                      <p className="flex gap-2"><MapPin className="h-3.5 w-3.5 text-emerald-400" />{r.pickup.address}</p>
                      <p className="flex gap-2"><Navigation className="h-3.5 w-3.5 text-pink-400" />{r.drop.address}</p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {r.status === 'ACCEPTED' && <button disabled={busy} onClick={() => call(() => api.post(`/drivers/rides/${r._id}/start`), 'Heading to pickup')} className="btn-primary btn-sm"><Play className="h-3.5 w-3.5" />Start pickup</button>}
                      {r.status === 'ARRIVING' && !r.driverArrived && <span className="flex items-center gap-2 text-xs text-aqua-400"><Spinner className="h-4 w-4" />Driving to pickup...</span>}
                      {r.status === 'ARRIVING' && r.driverArrived && <button disabled={busy} onClick={() => { setPinFor(r); setPinVal(''); }} className="btn-success btn-sm"><KeyRound className="h-3.5 w-3.5" />Enter ride PIN · Start trip</button>}
                      {r.status === 'ONGOING' && !r.atDrop && <span className="flex items-center gap-2 text-xs text-brand-300"><Spinner className="h-4 w-4" />On trip to destination...</span>}
                      {r.status === 'ONGOING' && r.atDrop && <button disabled={busy} onClick={() => call(() => api.post(`/drivers/rides/${r._id}/complete`), 'Ride completed')} className="btn-success btn-sm"><Flag className="h-3.5 w-3.5" />Complete ride</button>}
                      {['ACCEPTED', 'ARRIVING'].includes(r.status) && <button disabled={busy} onClick={() => call(() => api.post(`/drivers/rides/${r._id}/cancel`, { reason: 'vehicle issue' }), 'Ride cancelled - passenger is being reassigned')} className="btn-danger btn-sm"><XCircle className="h-3.5 w-3.5" />Cancel</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Repositioning suggestion" subtitle="From the zone intelligence engine + demand forecast" right={<Sparkles className="h-4 w-4 text-brand-300" />}>
            {!sugg ? <p className="text-sm text-slate-500">Go online to get positioning suggestions.</p> : (
              <div>
                <div className={`rounded-xl p-4 ${sugg.stay ? 'bg-emerald-400/[.07]' : 'bg-aqua-400/[.07]'}`}>
                  <p className="flex items-center gap-2 text-sm font-semibold text-white"><Compass className="h-4 w-4 text-aqua-400" />{sugg.stay ? 'Stay where you are' : `Head to ${sugg.zone.name}`}</p>
                  <p className="mt-1 text-xs text-slate-300">{sugg.message}</p>
                </div>
                {!sugg.stay && <button disabled={busy || d.status !== 'available' || !!d.repositionTarget} onClick={() => call(() => api.post('/drivers/me/reposition', { zoneId: sugg.zone.zoneId }), `Navigating to ${sugg.zone.name}`)} className="btn-primary btn-sm mt-3"><Navigation className="h-3.5 w-3.5" />{d.repositionTarget ? 'Navigating...' : 'Navigate there'}</button>}
                {sugg.alternatives?.length > 0 && <div className="mt-3 space-y-1">{sugg.alternatives.map((a) => <p key={a.zoneId} className="text-xs text-slate-400">Alternative: {a.name} · {a.km} km · surge {a.surge}x</p>)}</div>}
              </div>
            )}
          </Section>
        </div>
      </div>
      <OfferModal offer={offer} onRespond={respond} busy={busy} />
      <Modal open={!!pinFor} onClose={() => setPinFor(null)} title="Enter the rider's PIN">
        <p className="text-sm text-slate-300">Ask <b className="text-white">{pinFor?.passengerName}</b> for the 4-digit PIN shown in their app. The trip starts only with the correct PIN.</p>
        {pinFor?.demoPin && <p className="mt-2 rounded-lg bg-amber-400/10 p-2 text-xs text-amber-200">Demo: this rider is simulated, so their PIN is <b className="font-mono">{pinFor.demoPin}</b>.</p>}
        <form onSubmit={(e) => { e.preventDefault(); call(async () => { await api.post(`/drivers/rides/${pinFor._id}/pickup`, { pin: pinVal }); setPinFor(null); }, 'PIN verified · trip started'); }} className="mt-4 flex gap-2">
          <input id="ride-pin" inputMode="numeric" maxLength={4} autoFocus value={pinVal} onChange={(e) => setPinVal(e.target.value.replace(/\D/g, ''))} className="input text-center font-mono text-2xl tracking-[0.5em]" placeholder="••••" />
          <button className="btn-success" disabled={pinVal.length !== 4 || busy}>Start trip</button>
        </form>
      </Modal>
    </div>
  );
}
