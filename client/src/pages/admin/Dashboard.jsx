import { useEffect, useState } from 'react';
import { Activity, Car, Users, IndianRupee, Clock, RefreshCcw, Zap, Gauge, Database, Play, Pause, Settings2, Radio, Route, Leaf, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { api, errMsg } from '../../lib/api';
import { useApi, useFleet } from '../../lib/hooks';
import { useSocketEvent } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PageHeader, StatCard, Section, Loading, Tabs, SimBadge, Badge, chartTooltip, axisProps } from '../../components/ui';
import { BaseMap, DriverMarkers, ZoneCircles, HeatLayer, TrafficLayer } from '../../components/MapKit';
import { useTraffic } from '../../lib/hooks';
import { inr, time } from '../../lib/format';

const PIE = { COMPLETED: '#34d399', CANCELLED: '#f43f5e', REQUESTED: '#fbbf24', ACCEPTED: '#38bdf8', ARRIVING: '#22d3ee', ONGOING: '#a78bfa' };
const EV = { traffic: 'text-orange-400', rebook: 'text-auto-400', safety: 'text-rose-400', request: 'text-amber-300', accepted: 'text-sky-300', completed: 'text-emerald-300', cancelled: 'text-rose-300', reassign: 'text-orange-300', pool: 'text-emerald-300', reposition: 'text-aqua-400', ml: 'text-brand-300' };

export function TrafficControls() {
  const toast = useToast();
  const incidents = useTraffic();
  const [f, setF] = useState({ place: 'Silk Board Junction', severity: 'heavy', minutes: 8, cause: 'Heavy traffic' });
  const places = ['Silk Board Junction', 'Hebbal Flyover', 'Marathahalli Bridge', 'KR Puram', 'Sony World Signal', 'Tin Factory', 'Majestic', 'Domlur Flyover'];
  const report = async () => { try { await api.post('/admin/traffic', f); toast('Traffic reported', `${f.cause} at ${f.place}: vehicles on that road will be rerouted`, 'warning'); } catch (e) { toast('Failed', errMsg(e), 'danger'); } };
  const clear = async (id) => { try { await api.delete(`/admin/traffic/${id}`); } catch (e) { toast('Failed', errMsg(e), 'danger'); } };
  return (
    <Section title="Traffic control" subtitle="Report a jam: every car whose route passes through it is rerouted on the fastest free road">
      <div className="grid grid-cols-2 gap-2">
        <select id="tr-place" className="input" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })}>{places.map((p) => <option key={p}>{p}</option>)}</select>
        <select id="tr-cause" className="input" value={f.cause} onChange={(e) => setF({ ...f, cause: e.target.value })}><option>Heavy traffic</option><option>Waterlogging</option><option>Accident</option><option>Road work</option></select>
        <select id="tr-sev" className="input" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}><option value="moderate">Moderate (40% speed)</option><option value="heavy">Heavy (20% speed)</option><option value="gridlock">Gridlock (8% speed)</option></select>
        <input id="tr-min" className="input" type="number" min="2" max="30" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} aria-label="Duration in minutes" />
      </div>
      <button onClick={report} className="btn-danger btn-sm mt-3 w-full">Report traffic</button>
      <div className="mt-3 space-y-1.5">
        {incidents.length === 0 && <p className="text-xs text-slate-500">No traffic incidents right now. Random jams also appear at hotspots while the simulation runs.</p>}
        {incidents.map((i) => <div key={i.id} className="flex items-center justify-between rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs"><span className="text-rose-200">{i.cause} · {i.name} · {i.speedPct}% speed</span><button onClick={() => clear(i.id)} className="text-slate-400 hover:text-white">Clear</button></div>)}
      </div>
    </Section>
  );
}

export function SimulationControls({ settings, onSaved }) {
  const toast = useToast();
  const [s, setS] = useState(settings);
  const [gen, setGen] = useState({ count: 3, zoneId: '', scenario: 'normal', type: '' });
  useEffect(() => setS(settings), [settings]);
  const save = async (patch) => {
    try { const { data } = await api.put('/admin/settings', patch); setS(data.settings); onSaved?.(data.settings); toast('Settings saved', '', 'success'); } catch (e) { toast('Failed', errMsg(e), 'danger'); }
  };
  const generate = async () => {
    try { const { data } = await api.post('/admin/simulate/rides', { ...gen, zoneId: gen.zoneId || undefined, type: gen.type || undefined }); toast('Simulated requests created', data.created.join(', '), 'success'); } catch (e) { toast('Failed', errMsg(e), 'danger'); }
  };
  if (!s) return null;
  return (
    <Section title="Simulation & pricing controls" subtitle="Everything here drives the live simulated city" right={<Settings2 className="h-4 w-4 text-slate-500" />}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-white/[.03] p-3">
          <div><p className="text-sm font-semibold text-white">Simulated passenger demand</p><p className="text-xs text-slate-500">Auto request every {Math.round(s.simRideIntervalMs / 1000)}s</p></div>
          <button className={s.simRunning ? 'btn-ghost btn-sm' : 'btn-success btn-sm'} onClick={() => save({ simRunning: !s.simRunning })}>{s.simRunning ? <><Pause className="h-3.5 w-3.5" />Pause</> : <><Play className="h-3.5 w-3.5" />Resume</>}</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Request interval (s)</label><input className="input" type="number" min="3" defaultValue={s.simRideIntervalMs / 1000} onBlur={(e) => save({ simRideIntervalMs: e.target.value * 1000 })} /></div>
          <div><label className="label">Offer timeout (s)</label><input className="input" type="number" min="5" max="60" defaultValue={s.offerTimeoutSec} onBlur={(e) => save({ offerTimeoutSec: e.target.value })} /></div>
          <div><label className="label">Sim speed (x)</label><input className="input" type="number" min="1" max="30" defaultValue={s.simSpeed} onBlur={(e) => save({ simSpeed: e.target.value })} /></div>
          <div><label className="label">Surge cap (x)</label><input className="input" type="number" step="0.1" min="1" max="4" defaultValue={s.surgeCap} onBlur={(e) => save({ surgeCap: e.target.value })} /></div>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-white/[.03] p-3">
          <div><p className="text-sm font-semibold text-white">Dynamic surge pricing</p><p className="text-xs text-slate-500">Sensitivity {s.surgeSensitivity}</p></div>
          <div className="flex items-center gap-2">
            <input type="range" min="0.1" max="1" step="0.05" defaultValue={s.surgeSensitivity} onMouseUp={(e) => save({ surgeSensitivity: e.target.value })} onTouchEnd={(e) => save({ surgeSensitivity: e.target.value })} className="w-20 accent-brand-500" />
            <button className={s.surgeEnabled ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} onClick={() => save({ surgeEnabled: !s.surgeEnabled })}>{s.surgeEnabled ? 'On' : 'Off'}</button>
          </div>
        </div>
        <div className="rounded-xl border border-dashed border-white/10 p-3">
          <p className="mb-2 text-sm font-semibold text-white">Generate ride requests</p>
          <div className="grid grid-cols-2 gap-2">
            <input className="input" type="number" min="1" max="10" value={gen.count} onChange={(e) => setGen({ ...gen, count: e.target.value })} />
            <select className="input" value={gen.zoneId} onChange={(e) => setGen({ ...gen, zoneId: e.target.value })}><option value="">Weighted by forecast</option>{['Z1 MG Road', 'Z2 Koramangala', 'Z3 Indiranagar', 'Z4 Whitefield', 'Z5 Electronic City', 'Z6 HSR Layout', 'Z7 Jayanagar', 'Z8 Hebbal', 'Z9 Yeshwanthpur', 'Z10 Marathahalli'].map((z) => <option key={z} value={z.split(' ')[0]}>{z.slice(z.indexOf(' ') + 1)}</option>)}</select>
            <select className="input" value={gen.scenario} onChange={(e) => setGen({ ...gen, scenario: e.target.value })}><option value="normal">Normal behaviour</option><option value="reject_first">First driver rejects</option><option value="timeout_first">First driver times out</option></select>
            <select className="input" value={gen.type} onChange={(e) => setGen({ ...gen, type: e.target.value })}><option value="">Mixed solo/pool</option><option value="solo">Solo</option><option value="pool">Pool</option></select>
          </div>
          <button onClick={generate} className="btn-primary btn-sm mt-3 w-full"><Zap className="h-3.5 w-3.5" />Generate</button>
        </div>
      </div>
    </Section>
  );
}

export default function AdminDashboard() {
  const { data, loading, setData } = useApi('/admin/overview', { interval: 6000 });
  const fleet = useFleet();
  const incidents = useTraffic();
  const [events, setEvents] = useState([]);
  const [mapTab, setMapTab] = useState('fleet');
  useEffect(() => { api.get('/admin/events').then(({ data: d }) => setEvents(d.events)); }, []);
  useSocketEvent('admin:event', (e) => setEvents((x) => [e, ...x].slice(0, 80)));
  useSocketEvent('zones:update', (z) => setData((d) => (d ? { ...d, zones: z.zones } : d)));
  if (loading || !data) return <Loading text="Loading operations centre..." />;
  const k = data.kpis;
  return (
    <div>
      <PageHeader title="Operations centre" subtitle="Real-time view of the RYDORA network" actions={<><SimBadge text="Simulated city data" /><span className="chip bg-white/[.06] text-slate-300"><Database className="h-3 w-3" />DB: {data.dbMode}</span></>} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Active rides" value={k.activeRides} icon={Activity} />
        <StatCard label="Online drivers" value={`${k.onlineDrivers}/${k.totalDrivers}`} hint={`${k.availableDrivers} free · ${k.busyDrivers} busy`} icon={Car} tone="aqua" />
        <StatCard label="Passengers" value={k.passengers} icon={Users} tone="slate" />
        <StatCard label="Rides today" value={k.ridesToday} hint={`${k.completedToday} completed`} icon={Route} tone="purple" />
        <StatCard label="Revenue today" value={inr(k.revenueToday)} icon={IndianRupee} tone="green" />
        <StatCard label="Avg wait" value={`${k.avgWaitMin} min`} icon={Clock} tone="amber" />
        <StatCard label="Reassignments" value={k.reassignmentsToday} icon={RefreshCcw} tone="rose" />
        <StatCard label="Surge zones" value={k.surgeZones} hint={`${k.poolRidesToday} pool rides`} icon={Gauge} tone="amber" />
        <StatCard label="EV rides today" value={k.evRidesToday} hint={`${k.co2SavedToday} kg CO₂ avoided · ${k.evDrivers} EVs in fleet`} icon={Leaf} tone="green" />
        <StatCard label="Women drivers" value={k.womenDrivers} hint="available for woman-driver rides" icon={UserRound} tone="purple" />
        <Link to="/admin/safety" className={`card card-pad block transition hover:shadow-glow md:col-span-2 ${k.openSafety ? 'border-rose-500/50 bg-rose-500/10' : ''}`}><p className="text-xs font-medium uppercase tracking-wide text-slate-400">Safety centre</p><p className="mt-2 font-display text-2xl font-bold text-white">{k.openSafety} open case{k.openSafety === 1 ? '' : 's'}</p><p className="mt-1 text-xs text-slate-500">Route deviations, unexpected stops and SOS · open →</p></Link>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Section className="xl:col-span-2" title="Live city map" right={<Tabs value={mapTab} onChange={setMapTab} tabs={[{ value: 'fleet', label: 'Fleet & surge' }, { value: 'heat', label: 'Demand heatmap' }]} />}>
          <BaseMap className="h-[460px]">
            {mapTab === 'fleet' ? <><ZoneCircles zones={data.zones} /><TrafficLayer incidents={incidents} /><DriverMarkers drivers={fleet} /></> : <>
              <HeatLayer points={data.recentPickups.filter((p) => p.lat).map((p) => ({ ...p, value: 1, radius: 14 }))} max={1} />
              <HeatLayer points={data.zones.map((z) => ({ lat: z.lat, lng: z.lng, value: z.demand.forecastNow, label: `${z.name}: forecast ${z.demand.forecastNow}/h, ${z.demand.last60min} requests last hour` }))} />
            </>}
          </BaseMap>
          <p className="mt-2 text-xs text-slate-500">{mapTab === 'fleet' ? 'Zone colour = surge multiplier (green 1.0x → red 2x+). Dots = drivers.' : "Heat = today's pickup locations + ML demand forecast for this hour."}</p>
        </Section>
        <Section title="Live event stream" right={<span className="chip bg-emerald-500/15 text-emerald-300"><Radio className="h-3 w-3" />live</span>}>
          <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
            {events.map((e, i) => (
              <div key={i} className="rounded-lg bg-white/[.02] px-3 py-2 text-xs">
                <div className="flex justify-between"><span className={`font-semibold uppercase tracking-wide ${EV[e.type] || 'text-slate-300'}`}>{e.type}</span><span className="text-slate-500">{time(e.at)}</span></div>
                <p className="mt-0.5 text-slate-300">{e.message}</p>
              </div>
            ))}
            {!events.length && <p className="py-8 text-center text-sm text-slate-500">Waiting for events...</p>}
          </div>
        </Section>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Section className="xl:col-span-2" title="Ride requests by hour (today)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.byHour}><CartesianGrid stroke="#1c2550" vertical={false} /><XAxis dataKey="hour" {...axisProps} interval={2} /><YAxis {...axisProps} width={30} allowDecimals={false} /><Tooltip {...chartTooltip} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="completed" stackId="a" fill="#34d399" /><Bar dataKey="cancelled" stackId="a" fill="#f43f5e" /><Bar dataKey="requests" fill="#8b5cf6" radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </Section>
        <Section title="Today's ride outcomes">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart><Pie data={data.statusCounts} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>{data.statusCounts.map((s) => <Cell key={s.name} fill={PIE[s.name] || '#64748b'} />)}</Pie><Tooltip {...chartTooltip} /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart>
          </ResponsiveContainer>
        </Section>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Section className="xl:col-span-2" title="Zone snapshot" subtitle="Supply, demand and surge per zone">
          <div className="overflow-x-auto"><table className="table-x"><thead><tr><th>Zone</th><th>Available</th><th>Busy</th><th>Open req.</th><th>Forecast /h</th><th>Pressure</th><th>Surge</th><th>Status</th></tr></thead>
            <tbody>{data.zones.map((z) => <tr key={z.zoneId}><td className="font-medium text-white">{z.name}</td><td>{z.supply.available}</td><td>{z.supply.busy}</td><td>{z.demand.openRequests}</td><td>{z.demand.forecastNow}</td><td>{z.pressure}x</td><td className={z.surge > 1 ? 'font-bold text-amber-300' : ''}>{z.surge}x</td><td><Badge status={z.status} /></td></tr>)}</tbody></table></div>
        </Section>
        <div className="space-y-6"><SimulationControls settings={data.settings} /><TrafficControls /></div>
      </div>
    </div>
  );
}
