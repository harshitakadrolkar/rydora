import { useEffect, useState } from 'react';
import { Scale, Play, Clock, Ban, Gauge, Users, Brain } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, PieChart, Pie, Cell } from 'recharts';
import { api, errMsg } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useToast } from '../../context/ToastContext';
import { PageHeader, Section, StatCard, Loading, Badge, Spinner, SimBadge, Bar as Meter, chartTooltip, axisProps } from '../../components/ui';
import { inr, pct, time } from '../../lib/format';

const PIE = ['#f97316', '#fbbf24', '#f43f5e', '#a78bfa', '#22d3ee'];

function Compare({ label, a, b, unit = '', lowerBetter = true }) {
  const better = lowerBetter ? b < a : b > a;
  const same = a === b;
  return (
    <div className="rounded-xl bg-white/[.03] p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div><p className="text-[10px] uppercase text-slate-500">Nearest</p><p className="font-semibold text-slate-300">{a}{unit}</p></div>
        <div className="text-right"><p className="text-[10px] uppercase text-brand-300">RYDORA</p><p className={`font-display text-lg font-bold ${same ? 'text-white' : better ? 'text-emerald-300' : 'text-amber-300'}`}>{b}{unit}</p></div>
      </div>
    </div>
  );
}

export default function Allocation() {
  const toast = useToast();
  const live = useApi('/analytics/allocation/live', { interval: 10000 });
  const [params, setParams] = useState({ seed: 2026, requests: 200, drivers: 20 });
  const [cmp, setCmp] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { const { data } = await api.get('/analytics/allocation/compare', { params }); setCmp(data); } catch (e) { toast('Simulation failed', errMsg(e), 'danger'); } finally { setBusy(false); }
  };
  useEffect(() => { run(); }, []);
  const L = live.data;
  const n = cmp?.nearest; const i = cmp?.intelligent;
  const perDriver = n ? n.perDriver.map((d, k) => ({ name: d.driver.replace('SimDriver ', 'D'), Nearest: d.trips, RYDORA: i.perDriver[k].trips })) : [];
  return (
    <div>
      <PageHeader title="Driver allocation & fairness analytics" subtitle="Weighted scoring vs nearest-driver matching: waiting time, utilisation and fairness" icon={Scale} />
      {L && <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Live match decisions (24h)" value={L.totals.decisions} icon={Brain} />
        <StatCard label="Different from nearest" value={`${L.totals.differsPct}%`} hint={`avg +${L.totals.extraKmVsNearest} km when different`} icon={Users} tone="aqua" />
        <StatCard label="Avg pickup wait" value={`${L.totals.avgWaitMin} min`} icon={Clock} tone="amber" />
        <StatCard label="Reassignments" value={L.totals.reassignments} icon={Ban} tone="rose" />
        <StatCard label="Trips Gini (today)" value={L.totals.tripsGini} hint="0 = perfectly even" icon={Gauge} tone="green" />
      </div>}

      <Section className="mt-6" title="Strategy comparison (Monte-Carlo simulation)" subtitle="Same simulated 12-hour day, same requests and driver behaviour; only the allocation strategy changes." right={<SimBadge text="Simulated experiment" />}>
        <div className="mb-5 flex flex-wrap items-end gap-3">
          {[['seed', 'Seed'], ['requests', 'Requests'], ['drivers', 'Drivers']].map(([k, l]) => <div key={k}><label className="label">{l}</label><input className="input !w-28" type="number" value={params[k]} onChange={(e) => setParams({ ...params, [k]: +e.target.value })} /></div>)}
          <button className="btn-primary" onClick={run} disabled={busy}>{busy ? <Spinner className="!text-white" /> : <Play className="h-4 w-4" />}Run comparison</button>
        </div>
        {!cmp ? <Loading /> : <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <Compare label="Avg wait (min)" a={n.avgWaitMin} b={i.avgWaitMin} />
            <Compare label="P90 wait (min)" a={n.p90WaitMin} b={i.p90WaitMin} />
            <Compare label="Rejections" a={n.rejections} b={i.rejections} />
            <Compare label="Reassigned requests" a={n.reassignedRequests} b={i.reassignedRequests} />
            <Compare label="Served" a={n.served} b={i.served} lowerBetter={false} />
            <Compare label="Min utilisation" a={n.minUtilizationPct} b={i.minUtilizationPct} unit="%" lowerBetter={false} />
            <Compare label="Trips Gini" a={n.tripsGini} b={i.tripsGini} />
            <Compare label="Jain fairness" a={n.jainFairness} b={i.jainFairness} lowerBetter={false} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {Object.entries(cmp.improvements).map(([k, v]) => <span key={k} className={`chip ${v >= 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{k.replace('Pct', '')}: {v >= 0 ? '+' : ''}{v}% {v >= 0 ? 'better' : 'worse'}</span>)}
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <p className="mb-2 text-sm font-semibold text-white">Trips per driver</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={perDriver}><CartesianGrid stroke="#1c2550" vertical={false} /><XAxis dataKey="name" {...axisProps} /><YAxis {...axisProps} width={30} /><Tooltip {...chartTooltip} /><Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Nearest" fill="#64748b" radius={[3, 3, 0, 0]} /><Bar dataKey="RYDORA" fill="#8b5cf6" radius={[3, 3, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-white">Scoring weights</p>
              <div className="space-y-3">{Object.entries(cmp.weights).map(([k, w]) => <div key={k}><div className="mb-1 flex justify-between text-xs"><span className="capitalize text-slate-400">{k}</span><span className="text-white">{Math.round(w * 100)}%</span></div><Meter value={w * 100} max={30} /></div>)}</div>
              <p className="mt-4 text-xs text-slate-500">Nearest-driver matching ignores how likely a driver is to accept, and how long they have been idle. RYDORA balances pickup speed with reliability and fairness.</p>
            </div>
          </div>
        </>}
      </Section>

      {L && <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Section title="Average factor contribution" subtitle="Points (out of 100) contributed by each factor in live decisions">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={L.avgFactorContribution} layout="vertical"><XAxis type="number" {...axisProps} /><YAxis type="category" dataKey="factor" {...axisProps} width={110} /><Tooltip {...chartTooltip} /><Bar dataKey="value" fill="#22d3ee" radius={[0, 6, 6, 0]} /></BarChart>
          </ResponsiveContainer>
        </Section>
        <Section title="Automatic reassignment reasons">
          {L.reassignmentReasons.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart><Pie data={L.reassignmentReasons} dataKey="count" nameKey="reason" innerRadius={50} outerRadius={85} paddingAngle={3}>{L.reassignmentReasons.map((r, k) => <Cell key={r.reason} fill={PIE[k % PIE.length]} />)}</Pie><Tooltip {...chartTooltip} /><Legend wrapperStyle={{ fontSize: 10 }} /></PieChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-slate-500">No reassignments yet.</p>}
        </Section>
        <Section title="Driver fairness board" subtitle="Live, online drivers">
          <div className="max-h-[260px] overflow-y-auto"><table className="table-x"><thead><tr><th>Driver</th><th>Trips</th><th>Accept.</th><th>Idle</th><th>Reliab.</th></tr></thead>
            <tbody>{L.driverFairness.map((d) => <tr key={d.driverId}><td className="text-white">{d.name}</td><td>{d.todayTrips}</td><td>{pct(d.acceptance)}</td><td>{d.idleMin}m</td><td>{d.reliability}</td></tr>)}</tbody></table></div>
        </Section>
      </div>}

      {L && <Section className="mt-6" title="Recent allocation decisions (explainable)">
        <div className="overflow-x-auto"><table className="table-x"><thead><tr><th>Ride</th><th>Chosen</th><th>Nearest</th><th>Offers</th><th>Explanation</th></tr></thead>
          <tbody>{L.recentDecisions.map((d) => <tr key={d.code}>
            <td><p className="font-medium text-white">{d.code}</p><p className="text-xs text-slate-500">{time(d.at)} · {d.passengerName}</p></td>
            <td><p className="text-white">{d.chosen}</p><p className="text-xs text-slate-500">{d.chosenKm} km · {d.chosenScore ?? 'pool'}</p></td>
            <td>{d.pooled ? <Badge status="surplus">pool</Badge> : d.sameAsNearest ? <Badge status="available">same</Badge> : <><p>{d.nearest}</p><p className="text-xs text-slate-500">{d.nearestKm} km</p></>}</td>
            <td>{d.offers}{d.reassignments > 0 && <span className="ml-1 text-orange-300">({d.reassignments} reassign)</span>}</td>
            <td className="max-w-[520px] text-xs text-slate-400">{d.explanation}</td>
          </tr>)}</tbody></table></div>
      </Section>}
    </div>
  );
}
