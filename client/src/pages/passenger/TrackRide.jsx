import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MapPinned, Phone, Star, Car, XCircle, Timer, RefreshCcw, Users, FlaskConical, CarFront, AlertTriangle } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useAuth, useSocketEvent } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PageHeader, Section, Loading, Empty, Badge, Modal, SimBadge, Spinner } from '../../components/ui';
import { BaseMap, Marker, Polyline, PICKUP_ICON, DROP_ICON, FitBounds, carIcon, TrafficLayer, RouteLines } from '../../components/MapKit';
import { useTraffic } from '../../lib/hooks';
import { KeyRound, Baby, Users as UsersIcon, TrafficCone } from 'lucide-react';
import { RideStepper, MatchPanel, Timeline, RouteSummary } from '../../components/RideBits';
import { inr, mins, km } from '../../lib/format';
import { SafetyPanel } from '../../components/SafetyKit';
import { Leaf } from 'lucide-react';

function Countdown({ until }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  return <span>{Math.max(0, Math.ceil((until - now) / 1000))}s</span>;
}

export default function TrackRide() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { socket } = useAuth();
  const toast = useToast();
  const [ride, setRide] = useState(null);
  const [pin, setPin] = useState(null);
  const incidents = useTraffic();
  const [loc, setLoc] = useState(null);
  const [live, setLive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('Changed plans');
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(0);

  useEffect(() => {
    setLoading(true);
    if (!id) {
      api.get('/rides/active').then(({ data }) => { if (data.ride) navigate(`/passenger/track/${data.ride._id}`, { replace: true }); else setLoading(false); });
      return;
    }
    api.get(`/rides/${id}`).then(({ data }) => { setRide(data.ride); setLoc(data.driverLocation); if (data.ride.pin) setPin(data.ride.pin); }).catch((e) => toast('Error', errMsg(e), 'danger')).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!socket || !id) return undefined;
    socket.emit('ride:join', id);
    return () => socket.emit('ride:leave', id);
  }, [socket, id]);

  useSocketEvent('ride:update', (r) => { if (r._id === id) setRide(r); }, [id]);
  // Auto-rebook: when this ride is cancelled and rebooked, jump to the new ride
  useEffect(() => {
    if (!ride?.rebookedTo) return undefined;
    const t = setTimeout(() => navigate(`/passenger/track/${ride.rebookedTo}`), 2500);
    return () => clearTimeout(t);
  }, [ride?.rebookedTo]);
  const demo = async (path, title) => {
    try { const { data } = await api.post(`/rides/${id}/${path}`); toast(title, data.message, 'warning'); } catch (e) { toast('Not possible', errMsg(e), 'danger'); }
  };
  useSocketEvent('ride:location', (p) => { if (p.rideId === id) { setLoc(p.location); setLive(p); } }, [id]);
  useEffect(() => {
    const h = async (e) => {
      if (!ride) return;
      if (e.detail?.action === 'cancel') setCancelOpen(true);
      if (e.detail?.action === 'sos') document.querySelector('[data-sos]')?.click();
      if (e.detail?.action === 'share') document.querySelector('[data-share]')?.click();
    };
    window.addEventListener('rydora:voice', h);
    return () => window.removeEventListener('rydora:voice', h);
  }, [ride]);

  const cancel = async () => {
    setBusy(true);
    try { await api.post(`/rides/${id}/cancel`, { reason }); toast('Ride cancelled', reason, 'info'); setCancelOpen(false); }
    catch (e) { toast('Could not cancel', errMsg(e), 'danger'); } finally { setBusy(false); }
  };
  const simulateDelay = async () => {
    try { const { data } = await api.post(`/rides/${id}/simulate-delay`); toast('Delay simulated', data.message, 'warning'); }
    catch (e) { toast('Not possible', errMsg(e), 'danger'); }
  };
  const rate = async (n) => {
    setRating(n);
    try { await api.post(`/rides/${id}/rate`, { rating: n }); toast('Thanks for rating!', `You rated ${n} stars`, 'success'); } catch (e) { toast('Rating failed', errMsg(e), 'danger'); }
  };

  if (loading) return <Loading text="Loading ride..." />;
  if (!id || !ride) return (
    <div><PageHeader title="Live ride tracking" icon={MapPinned} />
      <Section><Empty icon={MapPinned} title="No active ride" text="Book a ride and you can follow your driver here in real time." action={<Link to="/passenger/book" className="btn-primary"><CarFront className="h-4 w-4" />Book a ride</Link>} /></Section>
    </div>
  );

  const s = ride.status;
  const canCancel = ['REQUESTED', 'ACCEPTED', 'ARRIVING'].includes(s);
  const target = s === 'ONGOING' ? ride.drop : ride.pickup;
  const headline = {
    REQUESTED: ride.currentOffer ? `Waiting for ${ride.currentOffer.driverName} to respond` : 'Finding the best driver for you...',
    ACCEPTED: `${ride.driverName} accepted your ride`,
    ARRIVING: ride.driverArrived ? `${ride.driverName} has arrived at pickup` : `${ride.driverName} is on the way`,
    ONGOING: 'On the way to your destination',
    COMPLETED: 'You have arrived. Thanks for riding with RYDORA',
    CANCELLED: `Ride cancelled${ride.cancelReason ? `: ${ride.cancelReason}` : ''}`,
  }[s];

  return (
    <div>
      <PageHeader title={`Ride ${ride.code}`} subtitle={headline} icon={MapPinned} actions={<>
        {canCancel && ride.driver && !ride.driverArrived && <button onClick={simulateDelay} className="btn-ghost"><FlaskConical className="h-4 w-4 text-amber-400" />Simulate driver delay</button>}
        {['ARRIVING', 'ONGOING'].includes(s) && ride.driver && (!live || live.remainingKm >= 2) && <button onClick={() => demo('simulate-traffic', 'Heavy traffic ahead')} className="btn-ghost"><TrafficCone className="h-4 w-4 text-rose-400" />Simulate heavy traffic</button>}
        {canCancel && <button onClick={() => demo('simulate-cancel', 'Ride cancelled by system')} className="btn-ghost"><FlaskConical className="h-4 w-4 text-amber-400" />Simulate cancellation</button>}
        {canCancel && <button onClick={() => setCancelOpen(true)} className="btn-danger"><XCircle className="h-4 w-4" />Cancel ride</button>}
        {['COMPLETED', 'CANCELLED'].includes(s) && <Link to="/passenger/book" className="btn-primary"><CarFront className="h-4 w-4" />Book another</Link>}
      </>} />

      <div className="card mb-6 p-5"><RideStepper status={s} /></div>

      {ride.rebookedTo && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-auto-400/50 bg-auto-400/10 p-4 text-sm">
          <RefreshCcw className="mt-0.5 h-5 w-5 shrink-0 text-auto-400" />
          <div><p className="font-semibold text-white">This ride was cancelled ({ride.cancelReason}). We automatically booked {ride.rebookedToCode} for you.</p><p className="text-xs text-slate-300">No action needed. Opening your new ride…</p></div>
          <Link to={`/passenger/track/${ride.rebookedTo}`} className="btn-auto btn-sm ml-auto">Open now</Link>
        </div>
      )}
      {ride.rebookedFrom && !['COMPLETED', 'CANCELLED'].includes(s) && <p className="mb-4 flex items-center gap-2 text-xs text-auto-300"><RefreshCcw className="h-3.5 w-3.5" />Automatically rebooked with priority matching after your previous ride was cancelled.</p>}

      {pin && ['REQUESTED', 'ACCEPTED', 'ARRIVING'].includes(s) && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-ink-850 p-4">
          <KeyRound className="h-6 w-6 text-auto-400" />
          <div><p className="text-xs uppercase tracking-wide text-slate-400">Your ride PIN</p><p className="font-mono text-3xl font-bold tracking-[0.4em] text-white">{pin}</p></div>
          <p className="max-w-sm text-xs text-slate-400">Share it only after checking the car plate <b className="text-white">{ride.vehicle?.plate || ''}</b>. The trip can't start until the driver enters this PIN, so you can't get into the wrong car.</p>
        </div>
      )}

      {ride.reroutes?.length > 0 && !['COMPLETED', 'CANCELLED'].includes(s) && (() => { const rr = ride.reroutes[ride.reroutes.length - 1]; return (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-aqua-400/40 bg-aqua-400/10 p-4 text-sm">
          <TrafficCone className="mt-0.5 h-5 w-5 shrink-0 text-aqua-400" />
          <div><p className="font-semibold text-white">Rerouted to avoid {rr.reason.replace(/^\w/, (c) => c.toLowerCase())}</p>
            <p className="text-xs text-slate-300">Old route: {rr.oldKm} km, {Math.round(rr.oldEtaMin)} min with traffic → New route: {rr.newKm} km, {Math.round(rr.newEtaMin)} min. <b className="text-white">You save about {rr.savedMin} min.</b> Red dashed line = old route, blue = new route.</p></div>
        </div>); })()}

      {ride.reassignments?.length > 0 && !['COMPLETED', 'CANCELLED'].includes(s) && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
          <RefreshCcw className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div><p className="font-semibold">Automatic reassignment ({ride.reassignments.length})</p><p className="text-xs text-amber-200/80">{ride.reassignments.map((r) => `${r.reason.replaceAll('_', ' ').toLowerCase()} (${r.fromDriver})`).join(' → ')}</p></div>
        </div>
      )}

      {ride.safety && <div className="mb-6 xl:hidden"><SafetyPanel ride={ride} /></div>}
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          <Section title="Live map" right={live && !['COMPLETED', 'CANCELLED', 'REQUESTED'].includes(s) ? <span className="chip bg-brand-500/15 text-brand-200"><Timer className="h-3 w-3" />{s === 'ONGOING' ? 'Drop' : 'Pickup'} in {mins(live.etaMin)} · {km(live.remainingKm)}{live.slowed ? ' · in traffic' : ''}</span> : null}>
            <BaseMap className="h-[460px]">
              <Marker position={[ride.pickup.lat, ride.pickup.lng]} icon={PICKUP_ICON} />
              <Marker position={[ride.drop.lat, ride.drop.lng]} icon={DROP_ICON} />
              <TrafficLayer incidents={incidents} />
              {!ride.route && <Polyline positions={[[ride.pickup.lat, ride.pickup.lng], [ride.drop.lat, ride.drop.lng]]} pathOptions={{ color: '#a78bfa', weight: 3, opacity: 0.4, dashArray: '4 8' }} />}
              {!['COMPLETED', 'CANCELLED'].includes(s) && <RouteLines route={ride.route?.points} previous={ride.reroutes?.length ? ride.reroutes[ride.reroutes.length - 1].oldPoints : null} />}
              {loc && ride.driver && !['COMPLETED', 'CANCELLED'].includes(s) && <>
                <Marker position={[loc.lat, loc.lng]} icon={carIcon(live?.stalled ? 'stalled' : 'busy', true)} />
                {!ride.route && <Polyline positions={[[loc.lat, loc.lng], [target.lat, target.lng]]} pathOptions={{ color: '#34d399', weight: 2, dashArray: '6 8' }} />}
              </>}
              <FitBounds points={[ride.pickup, ride.drop, ...(loc && s !== 'ONGOING' ? [loc] : [])]} />
            </BaseMap>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500"><span>Blue = planned road route (fastest with live traffic) · red zones = heavy traffic</span><SimBadge text="Simulated vehicle movement" /></div>
          </Section>
          {ride.match && <Section title="Driver allocation decision" subtitle={`Attempt ${ride.match.attempt || 1} · ${ride.match.candidates || ride.match.ranked?.length || 0} candidates evaluated`}><MatchPanel match={ride.match} /></Section>}
        </div>

        <div className="space-y-6 xl:col-span-2">
          {ride.safety && <div className="hidden xl:block"><SafetyPanel ride={ride} /></div>}
          <Section title="Your driver">
            {ride.driver ? (
              <div className="flex items-center gap-4">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-aqua-400 text-xl font-bold text-ink-950">{ride.driverName?.[0]}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">{ride.driverName}</p>
                  <p className="text-xs text-slate-400"><Car className="mr-1 inline h-3 w-3" />{ride.vehicle?.model} · <span className="font-mono text-slate-300">{ride.vehicle?.plate}</span>{ride.vehicle?.fuel === 'ev' && <span className="ml-1 chip bg-emerald-500/15 text-emerald-300">EV</span>}</p>
                  <p className="text-xs text-amber-300"><Star className="mr-1 inline h-3 w-3 fill-amber-300" />{ride.driverRating}</p>
                </div>
                <button onClick={() => toast('Calling driver', 'Calls are simulated in this demo.', 'info')} className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300"><Phone className="h-4 w-4" /></button>
              </div>
            ) : s === 'CANCELLED' ? <p className="text-sm text-slate-400">No driver assigned.</p> : (
              <div className="flex items-center gap-3 text-sm text-slate-300"><Spinner />
                {ride.currentOffer ? <span>Offered to <b className="text-white">{ride.currentOffer.driverName}</b> · auto-reassign in <b className="text-amber-300"><Countdown until={ride.currentOffer.expiresAt} /></b></span> : 'Running the matching engine...'}
              </div>
            )}
            {ride.etaPickupMin != null && s !== 'ONGOING' && s !== 'COMPLETED' && <p className="mt-3 text-xs text-slate-400">Initial pickup ETA: <b className="text-white">{mins(ride.etaPickupMin)}</b></p>}
            {ride.delayDetected && <p className="mt-3 flex items-center gap-2 rounded-lg bg-rose-500/10 p-2 text-xs text-rose-300"><AlertTriangle className="h-3.5 w-3.5" />{ride.delayDetected.message}</p>}
          </Section>

          <Section title="Trip & fare">
            <RouteSummary ride={ride} />
            {(ride.passengers > 1 || ride.prefs?.childSeat) && <div className="mt-3 flex flex-wrap gap-2">
              {ride.passengers > 1 && <span className="chip bg-white/10 text-slate-200"><UsersIcon className="h-3 w-3" />{ride.passengers} passengers</span>}
              {ride.prefs?.childSeat && <span className="chip bg-amber-400/15 text-amber-200"><Baby className="h-3 w-3" />Child car seat</span>}
            </div>}
            <div className="mt-4 rounded-xl bg-white/[.03] p-4">
              <div className="flex items-end justify-between">
                <div><p className="text-xs text-slate-500">{s === 'COMPLETED' ? 'Final fare' : 'Estimated fare'}</p><p className="font-display text-3xl font-bold text-white">{inr(ride.fare?.final ?? ride.fare?.total)}</p></div>
                {ride.surge > 1 && <Badge status="shortage">Surge {ride.surge}x</Badge>}
              </div>
              {ride.cancellationFee > 0 && <p className="mt-2 text-xs text-rose-300">Cancellation fee: {inr(ride.cancellationFee)}</p>}
              {ride.fare?.greenBonus > 0 && <p className="mt-2 text-xs text-emerald-300">Green bonus applied: -{inr(ride.fare.greenBonus)}</p>}
            </div>
            {ride.prefs?.ev && (
              <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[.06] p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300"><Leaf className="h-4 w-4" />{ride.evFallback ? 'Eco ride (no EV was free, regular vehicle assigned)' : 'Eco ride (electric vehicle)'}</p>
                {s === 'COMPLETED' && ride.greenBonusEarned ? <p className="mt-1 text-xs text-slate-300">You avoided <b className="text-white">{ride.co2SavedKg} kg of CO₂</b> and earned a <b className="text-white">green bonus: 10% off your next ride</b>.</p>
                  : <p className="mt-1 text-xs text-slate-400">{ride.evFallback ? 'No green bonus for this ride.' : `Completing this ride avoids about ${(ride.distanceKm * 0.12).toFixed(2)} kg of CO₂ and earns 10% off your next ride.`}</p>}
              </div>
            )}
            {ride.type === 'pool' && (
              <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[.06] p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300"><Users className="h-4 w-4" />{ride.pool?.matched ? 'Pooled ride' : 'Pool request - looking for co-riders'}</p>
                {ride.pool?.matched ? <>
                  <p className="mt-1 text-xs text-slate-300">Sharing with {ride.pool.coRiders.map((c) => c.name).join(', ') || 'others'} · You save <b className="text-white">{inr(ride.pool.savings)}</b> vs solo {inr(ride.fare.soloEquivalent)}</p>
                  {ride.pool.sequence && <p className="mt-2 text-[11px] text-slate-400">Optimised stop order: {ride.pool.sequence.map((x) => `${x.type === 'pickup' ? 'Pickup' : 'Drop'} ${x.name?.split(' ')[0]}`).join(' → ')}</p>}
                </> : <p className="mt-1 text-xs text-slate-400">Co-riders travelling your way will be added automatically. Your pool discount is already applied.</p>}
              </div>
            )}
            {s === 'COMPLETED' && (
              <div className="mt-4 text-center">
                <p className="mb-2 text-sm text-slate-300">Rate your ride</p>
                <div className="flex justify-center gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => rate(n)}><Star className={`h-7 w-7 ${n <= (rating || ride.rating || 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} /></button>)}</div>
              </div>
            )}
          </Section>

          <Section title="Ride timeline"><Timeline items={ride.timeline} /></Section>
        </div>
      </div>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this ride?">
        <label className="label">Reason</label>
        <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
          {['Changed plans', 'Driver is taking too long', 'Booked by mistake', 'Found another ride', 'Wrong pickup location'].map((r) => <option key={r}>{r}</option>)}
        </select>
        <p className="mt-3 text-xs text-slate-400">{ride.driver ? 'A cancellation fee of ₹30 applies if the driver has been on the way for more than 3 minutes.' : 'No fee - no driver has been assigned yet.'}</p>
        <div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setCancelOpen(false)}>Keep ride</button><button className="btn-danger" onClick={cancel} disabled={busy}>{busy ? <Spinner /> : 'Cancel ride'}</button></div>
      </Modal>
    </div>
  );
}
