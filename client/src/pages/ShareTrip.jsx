import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Siren, Car, MapPin, Navigation, ShieldAlert, Phone } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { Logo } from '../components/Layout';
import { BaseMap, Marker, Polyline, PICKUP_ICON, DROP_ICON, carIcon, FitBounds } from '../components/MapKit';
import { Badge, Loading } from '../components/ui';
import { HELPLINES } from '../components/SafetyKit';
import { time } from '../lib/format';

/** Public page for family members: follow a shared trip live (no login). */
export default function ShareTrip() {
  const { token } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const load = () => api.get(`/public/share/${token}`).then(({ data }) => { setD(data); setErr(''); }).catch((e) => setErr(errMsg(e)));
    load(); const t = setInterval(load, 3000); return () => clearInterval(t);
  }, [token]);
  return (
    <div className="min-h-screen bg-ink-950 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between"><Logo /><span className="text-xs text-slate-500">Shared trip · updates every 3 s</span></div>
        {err ? <p className="card card-pad text-center text-slate-300">{err}</p> : !d ? <Loading text="Loading shared trip..." /> : (
          <div className="space-y-4">
            {d.sos && d.sos.status !== 'RESOLVED' && (
              <div className="rounded-2xl border-2 border-rose-500 bg-rose-600/20 p-4">
                <p className="flex items-center gap-2 font-bold text-white"><Siren className="h-5 w-5 animate-pulse text-rose-300" />{d.passengerName} pressed SOS at {time(d.sos.at)}</p>
                <p className="mt-1 text-sm text-rose-100">The RYDORA safety team has been alerted. If you cannot reach {d.passengerName}, call the police.</p>
                <div className="mt-3 flex flex-wrap gap-2">{HELPLINES.map((h) => <a key={h.number} href={`tel:${h.number}`} className="btn btn-sm bg-white text-ink-950"><Phone className="h-3.5 w-3.5" />{h.number}</a>)}</div>
              </div>
            )}
            {d.alerts.filter((a) => a.status === 'OPEN').map((a, i) => <p key={i} className="flex items-center gap-2 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200"><ShieldAlert className="h-4 w-4" />{a.message}</p>)}
            <div className="card card-pad">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h1 className="text-xl font-bold">{d.passengerName}&apos;s ride · {d.code}</h1>
                <Badge status={d.status} />
              </div>
              {d.driverName && <p className="mt-2 flex items-center gap-2 text-sm text-slate-300"><Car className="h-4 w-4 text-auto-400" />{d.driverName} · {d.vehicle?.model} · <span className="font-mono">{d.vehicle?.plate}</span></p>}
              <p className="mt-2 flex items-center gap-2 text-xs text-slate-400"><MapPin className="h-3.5 w-3.5 text-emerald-400" />{d.pickup.address} <Navigation className="ml-2 h-3.5 w-3.5 text-pink-400" />{d.drop.address}</p>
              {d.etaMin != null && <p className="mt-2 text-sm text-white">{d.status === 'ONGOING' ? 'Arriving at destination' : 'Driver reaches pickup'} in about <b>{Math.round(d.etaMin)} min</b></p>}
            </div>
            <BaseMap className="h-[420px]">
              <Marker position={[d.pickup.lat, d.pickup.lng]} icon={PICKUP_ICON} />
              <Marker position={[d.drop.lat, d.drop.lng]} icon={DROP_ICON} />
              <Polyline positions={[[d.pickup.lat, d.pickup.lng], [d.drop.lat, d.drop.lng]]} pathOptions={{ color: '#a78bfa', weight: 3, dashArray: '6 6' }} />
              {d.trail?.length > 1 && <Polyline positions={d.trail.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#f43f5e', weight: 3 }} />}
              {d.driverLocation && <Marker position={[d.driverLocation.lat, d.driverLocation.lng]} icon={carIcon('busy', true)} />}
              <FitBounds points={[d.pickup, d.drop, d.driverLocation].filter(Boolean)} />
            </BaseMap>
            <p className="text-center text-xs text-slate-500">This page was shared with you by a RYDORA rider. Demo data is simulated.</p>
          </div>
        )}
      </div>
    </div>
  );
}
