import { useEffect, useState } from 'react';
import { Users, Play, Leaf, Route, PiggyBank, Car, Shuffle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { api, errMsg } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useToast } from '../../context/ToastContext';
import { PageHeader, Section, StatCard, Loading, Badge, Spinner, SimBadge, Tabs, chartTooltip, axisProps } from '../../components/ui';
import { BaseMap, Polyline, CircleMarker, Tooltip as MapTip, FitBounds } from '../../components/MapKit';
import { inr, km, mins } from '../../lib/format';

const COLORS = ['#a78bfa', '#22d3ee', '#34d399', '#fbbf24', '#f472b6', '#f97316', '#60a5fa', '#e879f9', '#4ade80', '#facc15'];

export default function Pooling() {
  const toast = useToast();
  const stats = useApi('/analytics/pooling/stats', { interval: 10000 });
  const [count, setCount] = useState(12);
  const [seed, setSeed] = useState(42);
  const [source, setSource] = useState('simulated');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState(null);

  const run = async (s = seed) => {
    setBusy(true);
    try { const { data } = await api.post('/analytics/pooling/analyze', { count, seed: s, source }); setRes(data); setFocus(null); }
    catch (e) { toast('Analysis failed', errMsg(e), 'danger'); } finally { setBusy(false); }
  };
  useEffect(() => { run(); }, []);

  const groups = res?.groups || [];
  const shown = focus ? groups.filter((g) => g.groupId === focus) : groups;
  const t = res?.totals;
  const chart = groups.filter((g) => g.pooled).map((g) => ({ name: g.groupId, 'Individual rides (km)': g.individualKm, 'Pooled route (km)': g.pooledKm }));
  const st = stats.data;

  return (
    <div>
      <PageHeader title="Multi-passenger ride pooling" subtitle="Compatibility detection, optimal pickup/drop sequencing and per-passenger savings" icon={Users} actions={<SimBadge />} />
      <Section title="Pooling engine" subtitle={res ? `Rules: ≤${res.rules.maxRiders} riders · pickups within ${res.rules.maxPickupGapKm} km · direction within ${res.rules.maxBearingDiff}° · detour ≤ ${res.rules.maxDetourRatio}x · ≤ ${res.rules.maxExtraMinutes} extra min` : ''}>
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="label">Requests</label><input className="input !w-24" type="number" min="2" max="24" value={count} onChange={(e) => setCount(+e.target.value)} /></div>
          <div><label className="label">Scenario seed</label><input className="input !w-28" type="number" value={seed} onChange={(e) => setSeed(+e.target.value)} /></div>
          <div><label className="label">Source</label><Tabs value={source} onChange={setSource} tabs={[{ value: 'simulated', label: 'Simulated batch' }, { value: 'live', label: 'Live requests' }]} /></div>
          <button onClick={() => run()} disabled={busy} className="btn-primary">{busy ? <Spinner className="!text-white" /> : <Play className="h-4 w-4" />}Run pooling</button>
          <button onClick={() => { const s = Math.floor(Math.random() * 9999); setSeed(s); run(s); }} disabled={busy} className="btn-ghost"><Shuffle className="h-4 w-4" />Random scenario</button>
          {res && <span className="text-xs text-slate-500">Source: {res.source}</span>}
        </div>
      </Section>

      {!res ? <Loading /> : <>
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="Pool rate" value={`${t.poolRate}%`} hint={`${t.pooledRiders}/${t.requests} riders pooled`} icon={Users} />
          <StatCard label="Vehicles saved" value={t.vehiclesSaved} hint={`${t.groups} vehicles for ${t.requests} requests`} icon={Car} tone="aqua" />
          <StatCard label="Distance saved" value={km(t.kmSaved)} hint={`${km(t.individualKm)} → ${km(t.pooledKm)}`} icon={Route} tone="purple" />
          <StatCard label="Passenger savings" value={inr(t.passengerSavings)} icon={PiggyBank} tone="green" />
          <StatCard label="CO₂ avoided" value={`${t.co2SavedKg} kg`} icon={Leaf} tone="green" />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-5">
          <Section className="xl:col-span-3" title="Pooled routes" subtitle="Each colour is one vehicle. Numbers show the optimised stop order." right={focus && <button className="btn-ghost btn-sm" onClick={() => setFocus(null)}>Show all</button>}>
            <BaseMap className="h-[480px]">
              {shown.map((g) => {
                const c = COLORS[groups.indexOf(g) % COLORS.length];
                return <span key={g.groupId}>
                  <Polyline positions={g.sequence.map((s) => [s.point.lat, s.point.lng])} pathOptions={{ color: c, weight: g.pooled ? 4 : 2, opacity: g.pooled ? 0.9 : 0.4, dashArray: g.pooled ? null : '4 6' }} />
                  {g.sequence.map((s, i) => (
                    <CircleMarker key={i} center={[s.point.lat, s.point.lng]} radius={s.type === 'pickup' ? 7 : 5} pathOptions={{ color: c, fillColor: s.type === 'pickup' ? c : '#0b1020', fillOpacity: 1, weight: 2 }}>
                      <MapTip>{g.groupId} · {i + 1}. {s.type === 'pickup' ? 'Pickup' : 'Drop'} {s.name}</MapTip>
                    </CircleMarker>
                  ))}
                </span>;
              })}
              <FitBounds points={shown.flatMap((g) => g.sequence.map((s) => s.point))} padding={30} />
            </BaseMap>
          </Section>
          <Section className="xl:col-span-2" title="Individual vs pooled distance">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chart}><CartesianGrid stroke="#1c2550" vertical={false} /><XAxis dataKey="name" {...axisProps} /><YAxis {...axisProps} width={30} /><Tooltip {...chartTooltip} /><Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Individual rides (km)" fill="#64748b" radius={[4, 4, 0, 0]} /><Bar dataKey="Pooled route (km)" fill="#34d399" radius={[4, 4, 0, 0]} /></BarChart>
            </ResponsiveContainer>
            {st && <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white/[.03] p-2.5"><p className="text-sm font-bold text-white">{st.totals.poolRequests}</p><p className="text-[10px] text-slate-500">Pool requests (platform)</p></div>
              <div className="rounded-xl bg-white/[.03] p-2.5"><p className="text-sm font-bold text-white">{st.totals.matchRatePct}%</p><p className="text-[10px] text-slate-500">Matched</p></div>
              <div className="rounded-xl bg-white/[.03] p-2.5"><p className="text-sm font-bold text-white">{inr(st.totals.avgSavings)}</p><p className="text-[10px] text-slate-500">Avg saving</p></div>
            </div>}
          </Section>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {groups.map((g, gi) => (
            <div key={g.groupId} className={`card card-pad cursor-pointer transition hover:shadow-glow ${focus === g.groupId ? 'ring-1 ring-brand-400' : ''}`} onClick={() => setFocus(g.groupId)}>
              <div className="mb-3 flex items-center justify-between">
                <p className="flex items-center gap-2 font-semibold text-white"><span className="h-3 w-3 rounded-full" style={{ background: COLORS[gi % COLORS.length] }} />{g.groupId} · {g.size} rider{g.size > 1 ? 's' : ''}</p>
                {g.pooled ? <Badge status="surplus">pooled · saves {km(g.kmSaved)}</Badge> : <Badge>no compatible match</Badge>}
              </div>
              <p className="mb-3 text-xs text-slate-400">Route {km(g.pooledKm)} · pooled ETA {mins(g.pooledEtaMin)} · sequence: {g.sequence.map((s) => `${s.type === 'pickup' ? 'P' : 'D'}:${s.name.split(' ')[0]}`).join(' → ')}</p>
              <table className="table-x"><thead><tr><th>Rider</th><th>Solo</th><th>Pooled</th><th>Extra time</th><th>Solo fare</th><th>Pool fare</th><th>Saves</th></tr></thead>
                <tbody>{g.members.map((m) => <tr key={m.id}><td className="text-white">{m.name}</td><td className="text-xs">{km(m.soloKm)}<br />{mins(m.soloMin)}</td><td className="text-xs">{km(m.pooledKm)}<br />{mins(m.pooledMin)}</td><td className={m.extraMin > 0 ? 'text-amber-300' : 'text-emerald-300'}>+{Math.max(0, m.extraMin)}m</td><td>{inr(m.soloFare)}</td><td className="font-semibold text-white">{inr(m.pooledFare)}</td><td className="text-emerald-300">{m.savingsPct}%</td></tr>)}</tbody></table>
            </div>
          ))}
        </div>
      </>}

      {st && (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Section title="Live pooled trips" subtitle="Real pool matches made by the dispatcher right now">
            {!st.activeGroups.length ? <p className="text-sm text-slate-500">No live pooled trips right now. Book a Pool ride (or generate pool requests as admin) to see one form.</p> : st.activeGroups.map((g) => (
              <div key={g.groupId} className="mb-2 rounded-xl bg-white/[.03] p-3"><p className="text-sm font-semibold text-white">{g.groupId} · driver {g.driver}</p>{g.riders.map((r) => <p key={r.name} className="text-xs text-slate-400">{r.name} · {r.status} · {inr(r.fare)} (saves {inr(r.savings)})</p>)}</div>
            ))}
          </Section>
          <Section title="Recent pool requests">
            <div className="max-h-72 overflow-y-auto"><table className="table-x"><thead><tr><th>Ride</th><th>Passenger</th><th>Matched</th><th>Fare</th><th>Saved</th></tr></thead>
              <tbody>{st.recent.map((r) => <tr key={r.code}><td>{r.code}</td><td>{r.passengerName}</td><td>{r.matched ? <Badge status="surplus">with {r.coRiders.join(', ') || 'co-rider'}</Badge> : <Badge>solo</Badge>}</td><td>{inr(r.fare)}</td><td className="text-emerald-300">{inr(r.savings)}</td></tr>)}</tbody></table></div>
          </Section>
        </div>
      )}
    </div>
  );
}
