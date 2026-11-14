import { useEffect, useState } from 'react';
import { Siren, ShieldAlert, CheckCircle2, UserX, Phone, MapPin } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useSocketEvent } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PageHeader, Section, StatCard, Badge, Empty, Loading } from '../../components/ui';
import { BaseMap, Marker, Polyline, PICKUP_ICON, DROP_ICON, carIcon, FitBounds } from '../../components/MapKit';
import { time, ago } from '../../lib/format';

const TYPE = { SOS: 'SOS', ROUTE_DEVIATION: 'Route deviation', UNEXPECTED_STOP: 'Unexpected stop' };
const STATUS_TONE = { OPEN: 'shortage', ACTIVE: 'shortage', ESCALATED: 'tight', SAFE: 'surplus', RESOLVED: 'balanced' };

export default function AdminSafety() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null);
  const load = () => api.get('/admin/safety').then(({ data: d }) => setData(d)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);
  useSocketEvent('safety:alert', (e) => { toast(e.type === 'SOS' ? 'SOS received' : 'Safety alert', `${e.code}: ${e.message}`, 'danger'); load(); });
  useSocketEvent('safety:update', load);
  if (!data) return <Loading text="Loading safety centre..." />;

  const act = async (fn, msg) => { try { await fn(); toast(msg, '', 'success'); load(); } catch (e) { toast('Failed', errMsg(e), 'danger'); } };
  const open = data.events.filter((e) => ['OPEN', 'ACTIVE', 'ESCALATED'].includes(e.status));
  const ride = data.active.find((r) => r._id === sel) || data.active.find((r) => r.safety?.sos) || data.active[0];

  return (
    <div>
      <PageHeader title="Safety centre" subtitle="Night-time and women-driver rides, route deviations and SOS cases, live" icon={Siren} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Open cases" value={open.length} icon={ShieldAlert} tone="rose" />
        <StatCard label="Active SOS" value={data.events.filter((e) => e.type === 'SOS' && e.status === 'ACTIVE').length} icon={Siren} tone="rose" />
        <StatCard label="Rides monitored now" value={data.active.length} tone="aqua" />
        <StatCard label="Suspended drivers" value={data.flaggedDrivers.length} icon={UserX} tone="amber" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Section className="xl:col-span-3" title={ride ? `Live view · ${ride.code}` : 'Live view'} subtitle={ride ? `${ride.passengerName} with ${ride.driverName || 'no driver yet'} · ${ride.status}` : 'No monitored rides right now'}>
          {ride ? (
            <>
              <BaseMap className="h-[380px]">
                <Marker position={[ride.pickup.lat, ride.pickup.lng]} icon={PICKUP_ICON} />
                <Marker position={[ride.drop.lat, ride.drop.lng]} icon={DROP_ICON} />
                <Polyline positions={[[ride.pickup.lat, ride.pickup.lng], [ride.drop.lat, ride.drop.lng]]} pathOptions={{ color: '#a78bfa', weight: 3, dashArray: '6 6' }} />
                {ride.safety?.trail?.length > 1 && <Polyline positions={ride.safety.trail.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#f43f5e', weight: 3 }} />}
                {ride.route?.points?.length > 1 && <Polyline positions={ride.route.points.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#22d3ee', weight: 2, opacity: 0.6 }} />}
                {ride.driverLocation && <Marker position={[ride.driverLocation.lat, ride.driverLocation.lng]} icon={carIcon(ride.safety?.sos ? 'stalled' : 'busy', true)} />}
                <FitBounds points={[ride.pickup, ride.drop, ride.driverLocation].filter(Boolean)} />
              </BaseMap>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => toast('Calling passenger', 'Calls are simulated in this demo', 'info')} className="btn-ghost btn-sm"><Phone className="h-3.5 w-3.5" />Call passenger</button>
                <button onClick={() => toast('Calling driver', 'Calls are simulated in this demo', 'info')} className="btn-ghost btn-sm"><Phone className="h-3.5 w-3.5" />Call driver</button>
                <button onClick={() => toast('Police notified', 'Live location sent to 112 control room (simulated)', 'warning')} className="btn btn-sm bg-rose-600 text-white hover:bg-rose-500"><Siren className="h-3.5 w-3.5" />Notify police (112)</button>
                <button onClick={() => act(() => api.post(`/admin/safety/${ride._id}/resolve`), 'Case resolved')} className="btn-success btn-sm"><CheckCircle2 className="h-3.5 w-3.5" />Mark resolved</button>
              </div>
            </>
          ) : <Empty icon={MapPin} title="Nothing to watch" text="Rides with a woman-driver request, night-time rides and any ride with an alert appear here." />}
        </Section>

        <Section className="xl:col-span-2" title="Monitored rides">
          {!data.active.length ? <p className="text-sm text-slate-500">No monitored rides right now.</p> : (
            <div className="max-h-[440px] space-y-2 overflow-y-auto">
              {data.active.map((r) => (
                <button key={r._id} onClick={() => setSel(r._id)} className={`w-full rounded-xl p-3 text-left ${ride?._id === r._id ? 'bg-brand-500/15' : 'bg-white/[.03] hover:bg-white/[.05]'}`}>
                  <div className="flex items-center justify-between"><p className="text-sm font-semibold text-white">{r.code} · {r.passengerName}</p>{r.safety?.sos ? <Badge status="shortage">SOS</Badge> : r.safety?.alerts?.some((a) => a.status === 'OPEN') ? <Badge status="tight">alert</Badge> : <Badge status={r.status} />}</div>
                  <p className="mt-0.5 text-xs text-slate-400">{r.driverName || 'matching...'} {r.vehicle?.plate ? `· ${r.vehicle.plate}` : ''} · {r.prefs?.women ? 'woman driver · ' : ''}{r.safety?.night ? 'night ride' : 'monitoring on'}</p>
                </button>
              ))}
            </div>
          )}
        </Section>
      </div>

      <Section className="mt-6" title="Safety case log">
        {!data.events.length ? <Empty icon={ShieldAlert} title="No safety alerts yet" text="Book a late-night or woman-driver ride, start the trip, then use “Simulate wrong turn” on the tracking page." /> : (
          <div className="overflow-x-auto"><table className="table-x"><thead><tr><th>Time</th><th>Ride</th><th>Type</th><th>Passenger</th><th>Driver</th><th>Details</th><th>Status</th></tr></thead>
            <tbody>{data.events.map((e) => (
              <tr key={e.id} className="cursor-pointer" onClick={() => setSel(e.rideId)}>
                <td className="text-xs">{time(e.at)}<p className="text-slate-500">{ago(e.at)}</p></td><td className="font-medium text-white">{e.code}</td>
                <td>{e.type === 'SOS' ? <span className="font-bold text-rose-300">SOS</span> : TYPE[e.type] || e.type}</td><td>{e.passengerName}</td><td>{e.driverName}<p className="font-mono text-[10px] text-slate-500">{e.plate}</p></td>
                <td className="max-w-[320px] text-xs text-slate-400">{e.message}</td><td><Badge status={STATUS_TONE[e.status]}>{e.status.toLowerCase()}</Badge></td>
              </tr>
            ))}</tbody></table></div>
        )}
      </Section>

      <Section className="mt-6" title="Drivers suspended after SOS" subtitle="They receive no new requests until reviewed">
        {!data.flaggedDrivers.length ? <p className="text-sm text-slate-500">No suspended drivers.</p> : data.flaggedDrivers.map((d) => (
          <div key={d._id} className="mb-2 flex items-center justify-between rounded-xl bg-white/[.03] px-3 py-2">
            <p className="text-sm text-white">{d.name} <span className="text-xs text-slate-500">· {d.vehicle?.plate}</span></p>
            <button onClick={() => act(() => api.post(`/admin/drivers/${d._id}/flag`, { flagged: false }), `${d.name} reinstated`)} className="btn-ghost btn-sm">Reinstate after review</button>
          </div>
        ))}
      </Section>
    </div>
  );
}
