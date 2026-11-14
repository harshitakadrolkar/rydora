import { useState } from 'react';
import { Grid3x3, AlertTriangle, ArrowRight, Navigation, Gauge, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { api, errMsg } from '../../lib/api';
import { useApi, useFleet } from '../../lib/hooks';
import { useAuth, useSocketEvent } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PageHeader, Section, Loading, Badge, Tabs, StatCard, SimBadge, chartTooltip, axisProps } from '../../components/ui';
import { BaseMap, ZoneCircles, DriverMarkers } from '../../components/MapKit';
import { SimulationControls } from '../admin/Dashboard';

export default function Zones() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, setData, reload } = useApi('/analytics/zones', { interval: 10000 });
  const settings = useApi(user.role === 'admin' ? '/admin/settings' : null);
  const fleet = useFleet();
  const [mode, setMode] = useState('surge');
  const [selected, setSelected] = useState(null);
  useSocketEvent('zones:update', (z) => setData((d) => (d ? { ...d, zones: z.zones } : d)));
  if (loading || !data) return <Loading text="Analysing zones..." />;
  const zones = data.zones;
  const moves = data.repositioning?.moves || [];
  const apply = async () => {
    try { const { data: r } = await api.post('/admin/reposition/apply'); toast('Repositioning applied', `${r.applied} drivers moving to shortage zones`, 'success'); reload(); } catch (e) { toast('Failed', errMsg(e), 'danger'); }
  };
  const chart = zones.map((z) => ({ name: z.name.split(' ')[0], 'Available drivers': z.supply.available, 'Drivers needed': z.driversNeeded, 'Needed next hour': z.next.driversNeeded, surge: z.surge, 'Predicted surge': z.next.surge }));
  const sel = zones.find((z) => z.zoneId === selected);
  return (
    <div>
      <PageHeader title="Zone intelligence engine" subtitle="Supply vs demand per zone, surge multipliers, shortage detection and repositioning" icon={Grid3x3} actions={<SimBadge />} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Shortage zones" value={zones.filter((z) => z.status === 'shortage').length} icon={AlertTriangle} tone="rose" />
        <StatCard label="Shortage expected (next hour)" value={zones.filter((z) => z.next?.shortageExpected).length} hint={zones.filter((z) => z.next?.shortageExpected).map((z) => z.name.split(' ')[0]).join(', ') || 'none predicted'} icon={TrendingUp} tone="amber" />
        <StatCard label="Avg surge" value={`${(zones.reduce((s, z) => s + z.surge, 0) / zones.length).toFixed(2)}x`} icon={Gauge} />
        <StatCard label="Suggested moves" value={moves.length} icon={Navigation} tone="aqua" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Section className="xl:col-span-3" title="City zones" right={<Tabs value={mode} onChange={setMode} tabs={[{ value: 'surge', label: 'Surge' }, { value: 'status', label: 'Shortage' }]} />}>
          <BaseMap className="h-[460px]"><ZoneCircles zones={zones} mode={mode} onClick={(z) => setSelected(z.zoneId)} /><DriverMarkers drivers={fleet} /></BaseMap>
          <p className="mt-2 text-xs text-slate-500">Click a zone for details. Surge = 1 + (pressure − 1) × sensitivity, capped. Pressure = drivers needed ÷ available drivers.</p>
        </Section>
        <div className="space-y-6 xl:col-span-2">
          {sel && (
            <Section title={sel.name} right={<Badge status={sel.status} />}>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[['Available', sel.supply.available], ['Busy', sel.supply.busy], ['Open requests', sel.demand.openRequests], ['Requests (60 min)', sel.demand.last60min], ['Forecast now', `${sel.demand.forecastNow}/h`], ['Forecast next hour', `${sel.demand.forecastNext}/h`], ['Drivers needed', sel.driversNeeded], ['Pressure', `${sel.pressure}x`]].map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-white/[.03] p-3"><p className="text-xs text-slate-500">{l}</p><p className="font-semibold text-white">{v}</p></div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-center">
                <div className="rounded-xl bg-white/[.03] p-3"><p className="text-xs text-slate-500">Surge now</p><p className="font-display text-2xl font-bold text-amber-300">{sel.surge}x</p></div>
                <div className="rounded-xl bg-white/[.03] p-3"><p className="text-xs text-slate-500">Predicted at {sel.next.hour}:00</p><p className="font-display text-2xl font-bold text-brand-300">{sel.next.surge}x</p><p className="text-[10px] text-slate-500">pressure {sel.next.pressure}x · demand {sel.next.trend}</p></div>
              </div>
              {sel.next.shortageExpected && <p className="mt-3 rounded-lg bg-amber-400/10 p-2 text-xs text-amber-200">Shortage expected in about 60 minutes. Move drivers here now.</p>}
            </Section>
          )}
          <Section title="Repositioning recommendations" subtitle="Covers current shortages and shortages predicted for the next hour by the ML forecast" right={user.role === 'admin' && moves.length > 0 && <button onClick={apply} className="btn-primary btn-sm">Apply plan</button>}>
            {!moves.length ? <p className="text-sm text-slate-400">Supply is balanced - no moves needed right now.</p> : (
              <div className="max-h-[360px] space-y-2 overflow-y-auto">
                {moves.map((m) => (
                  <div key={m.driverId} className="rounded-xl bg-white/[.03] p-3">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white"><Badge status={m.trigger === 'predicted' ? 'tight' : 'shortage'}>{m.trigger === 'predicted' ? 'predicted' : 'now'}</Badge>{m.driverName}<span className="text-xs font-normal text-slate-400">{m.fromZone}</span><ArrowRight className="h-3.5 w-3.5 text-aqua-400" /><span className="text-aqua-300">{m.toZone}</span><span className="text-xs text-slate-500">{m.distanceKm} km</span></p>
                    <p className="mt-1 text-xs text-slate-400">{m.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Section className="xl:col-span-2" title="Supply vs demand by zone">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chart}><CartesianGrid stroke="#1c2550" vertical={false} /><XAxis dataKey="name" {...axisProps} /><YAxis {...axisProps} width={30} /><Tooltip {...chartTooltip} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Available drivers" fill="#34d399" radius={[4, 4, 0, 0]} /><Bar dataKey="Drivers needed" fill="#f97316" radius={[4, 4, 0, 0]} /><Bar dataKey="Needed next hour" fill="#a78bfa" radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </Section>
        <Section title="Surge multipliers">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chart} layout="vertical"><XAxis type="number" domain={[1, 'dataMax']} {...axisProps} /><YAxis type="category" dataKey="name" {...axisProps} width={80} /><Tooltip {...chartTooltip} /><Bar dataKey="surge" name="Now" fill="#fbbf24" radius={[0, 6, 6, 0]} /><Bar dataKey="Predicted surge" fill="#a78bfa" radius={[0, 6, 6, 0]} /><Legend wrapperStyle={{ fontSize: 11 }} /></BarChart>
          </ResponsiveContainer>
        </Section>
      </div>
      <Section className="mt-6" title="Zone table">
        <div className="overflow-x-auto"><table className="table-x"><thead><tr><th>Zone</th><th>Type</th><th>Available</th><th>Busy</th><th>Open</th><th>Last 15 min</th><th>Forecast now / next</th><th>Needed</th><th>Gap</th><th>Pressure</th><th>Surge</th><th>Status</th><th>Next hour (predicted)</th></tr></thead>
          <tbody>{zones.map((z) => <tr key={z.zoneId} className="cursor-pointer" onClick={() => setSelected(z.zoneId)}><td className="font-medium text-white">{z.name}</td><td className="text-xs capitalize text-slate-400">{z.type}</td><td>{z.supply.available}</td><td>{z.supply.busy}</td><td>{z.demand.openRequests}</td><td>{z.demand.last15min}</td><td>{z.demand.forecastNow} / {z.demand.forecastNext}</td><td>{z.driversNeeded}</td><td className={z.gap > 0 ? 'text-rose-300' : 'text-emerald-300'}>{z.gap > 0 ? `+${z.gap}` : z.gap}</td><td>{z.pressure}x</td><td className="font-semibold">{z.surge}x</td><td><Badge status={z.status} /></td><td className="text-xs">{z.next.pressure}x · {z.next.surge}x · {z.next.trend}{z.next.shortageExpected && <span className="ml-1"><Badge status="tight">shortage expected</Badge></span>}</td></tr>)}</tbody></table></div>
      </Section>
      {user.role === 'admin' && settings.data?.settings && <div className="mt-6 max-w-xl"><SimulationControls settings={settings.data.settings} /></div>}
    </div>
  );
}
