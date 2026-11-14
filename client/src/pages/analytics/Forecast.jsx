import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, RefreshCw, Target, TrendingUp, Database, Compass, Navigation, ArrowRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, BarChart, Bar } from 'recharts';
import { api, errMsg } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PageHeader, Section, StatCard, Loading, SimBadge, Tabs, Spinner, chartTooltip, axisProps } from '../../components/ui';
import { BaseMap, HeatLayer } from '../../components/MapKit';

function heatColor(t) {
  const stops = [[11, 16, 32], [109, 40, 217], [139, 92, 246], [249, 115, 22], [244, 63, 94]];
  const x = Math.min(0.999, Math.max(0, t)) * (stops.length - 1);
  const i = Math.floor(x); const f = x - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgb(${c.join(',')})`;
}

export default function Forecast() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, setData } = useApi('/analytics/forecast');
  const [zone, setZone] = useState('ALL');
  const [heatMode, setHeatMode] = useState('actual');
  const [hour, setHour] = useState(new Date().getHours());
  const [training, setTraining] = useState(false);
  const [testDate, setTestDate] = useState(null);
  const [plan, setPlan] = useState(null);
  const [dispatching, setDispatching] = useState(false);

  const testDates = useMemo(() => [...new Set((data?.testSeries || []).map((p) => p.date))].sort(), [data]);
  const day = testDate || testDates[testDates.length - 1];
  const testGrid = useMemo(() => {
    const g = { actual: {}, predicted: {}, error: {} };
    for (const p of data?.testSeries || []) {
      if (p.date !== day) continue;
      for (const k of ['actual', 'predicted', 'error']) g[k][p.zoneId] = g[k][p.zoneId] || Array(24).fill(0);
      g.actual[p.zoneId][p.hour] = p.actual;
      g.predicted[p.zoneId][p.hour] = Math.round(p.predicted * 10) / 10;
      g.error[p.zoneId][p.hour] = Math.round((p.predicted - p.actual) * 10) / 10;
    }
    return g;
  }, [data, day]);
  const dayMae = useMemo(() => {
    const errs = Object.values(testGrid.error).flat();
    return errs.length ? (errs.reduce((a, b) => a + Math.abs(b), 0) / errs.length).toFixed(2) : '-';
  }, [testGrid]);

  const loadPlan = (h) => api.get('/analytics/preposition', { params: { hour: h } }).then(({ data: d }) => setPlan(d)).catch(() => {});
  useEffect(() => { loadPlan(hour); }, [hour]);
  const dispatchNow = async () => {
    setDispatching(true);
    try { const { data: r } = await api.post('/admin/preposition/apply', { hour }); toast('Proactive dispatch started', `${r.applied} idle drivers are moving to forecast hotspots for ${hour}:00`, 'success'); loadPlan(hour); }
    catch (e) { toast('Failed', errMsg(e), 'danger'); } finally { setDispatching(false); }
  };

  const series = useMemo(() => {
    if (!data?.testSeries?.length) return [];
    const map = new Map();
    for (const p of data.testSeries) {
      if (zone !== 'ALL' && p.zoneId !== zone) continue;
      const key = `${p.date} ${String(p.hour).padStart(2, '0')}`;
      const cur = map.get(key) || { t: key, label: `${p.date.slice(5)} ${p.hour}h`, actual: 0, predicted: 0 };
      cur.actual += p.actual; cur.predicted += p.predicted;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => a.t.localeCompare(b.t)).map((x) => ({ ...x, predicted: Math.round(x.predicted * 10) / 10 }));
  }, [data, zone]);

  const retrain = async () => {
    setTraining(true);
    try { const { data: r } = await api.post('/analytics/forecast/retrain'); setData(r.forecast); toast('Model retrained', `Completed in ${r.seconds}s`, 'success'); }
    catch (e) { toast('Retraining failed', errMsg(e), 'danger'); } finally { setTraining(false); }
  };

  if (loading || !data) return <Loading text="Loading ML forecast..." />;
  const zones = data.zones;
  const heat = { forecast: data.forecastNext24h, history: data.historyHeatmap, actual: testGrid.actual, predicted: testGrid.predicted, error: testGrid.error }[heatMode] || data.forecastNext24h;
  const isError = heatMode === 'error';
  const cmpMax = Math.max(1, ...Object.values(testGrid.actual).flat(), ...Object.values(testGrid.predicted).flat());
  const maxHeat = isError ? Math.max(1, ...Object.values(heat).flat().map(Math.abs)) : ['actual', 'predicted'].includes(heatMode) ? cmpMax : Math.max(...Object.values(heat).flat());
  const cellColor = (v) => {
    if (!isError) return heatColor(v / maxHeat);
    const t = Math.min(1, Math.abs(v) / maxHeat);
    return v >= 0 ? `rgba(167,139,250,${0.12 + t * 0.85})` : `rgba(34,211,238,${0.12 + t * 0.85})`;
  };
  const pos = data.positioning?.find((p) => p.hour === hour);
  const mapPoints = zones.map((z) => ({ lat: z.lat, lng: z.lng, value: data.forecastNext24h[z.id][hour], label: `${z.name}: ${data.forecastNext24h[z.id][hour]} rides predicted at ${hour}:00` }));

  return (
    <div>
      <PageHeader title="Predictive demand forecasting" subtitle={`${data.model} trained on ${data.historyDays} days of simulated hourly demand`} icon={BrainCircuit}
        actions={<><SimBadge text="Simulated historical demand" />{user.role === 'admin' && <button onClick={retrain} disabled={training} className="btn-primary">{training ? <Spinner className="!text-white" /> : <RefreshCw className="h-4 w-4" />}Retrain model (Python)</button>}</>} />
      {data.fallback && <p className="mb-4 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200">Python model output not found - showing fallback profile. Run <code>python ml/train_demand_model.py</code>.</p>}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="MAE (test week)" value={data.metrics.mae ?? '-'} hint="rides / zone / hour" icon={Target} />
        <StatCard label="R² score" value={data.metrics.r2 ?? '-'} icon={TrendingUp} tone="green" />
        <StatCard label="Baseline MAE" value={data.metrics.baselineMaeLastWeek ?? '-'} hint="same hour last week" tone="slate" />
        <StatCard label="Improvement" value={`${data.metrics.improvementVsBaselinePct ?? 0}%`} hint="vs naive baseline" tone="aqua" />
        <StatCard label="Training rows" value={(data.trainRows || 0).toLocaleString()} hint={data.trainedAt ? `trained ${new Date(data.trainedAt).toLocaleString()}` : ''} icon={Database} tone="amber" />
      </div>

      <Section className="mt-6" title="Predicted vs actual demand (held-out last 7 days)" right={<select className="input !w-auto !py-1.5" value={zone} onChange={(e) => setZone(e.target.value)}><option value="ALL">All zones (city total)</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select>}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={series}><CartesianGrid stroke="#1c2550" vertical={false} /><XAxis dataKey="label" {...axisProps} interval={23} /><YAxis {...axisProps} width={40} /><Tooltip {...chartTooltip} /><Legend wrapperStyle={{ fontSize: 12 }} />
            <Line dataKey="actual" stroke="#22d3ee" dot={false} strokeWidth={1.5} name="Actual (simulated)" /><Line dataKey="predicted" stroke="#a78bfa" dot={false} strokeWidth={2} name="Predicted (GBR)" /></LineChart>
        </ResponsiveContainer>
      </Section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Section className="xl:col-span-2" title="Demand heatmap · zone × hour" subtitle={['actual', 'predicted', 'error'].includes(heatMode) ? `Held-out test day ${day} · same colour scale for actual and predicted · MAE ${dayMae}` : heatMode === 'forecast' ? 'ML forecast for the next 24 hours' : 'Average of 60 simulated days'}
          right={<div className="flex flex-wrap justify-end gap-2"><Tabs value={heatMode} onChange={setHeatMode} tabs={[{ value: 'actual', label: 'Actual' }, { value: 'predicted', label: 'Predicted' }, { value: 'error', label: 'Error' }, { value: 'forecast', label: 'Next 24h' }, { value: 'history', label: 'Hist. avg' }]} />
            {['actual', 'predicted', 'error'].includes(heatMode) && <select className="input !w-auto !py-1.5 text-xs" value={day} onChange={(e) => setTestDate(e.target.value)}>{testDates.map((d) => <option key={d} value={d}>{d}</option>)}</select>}</div>}>
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="ml-32 grid grid-cols-24 text-center text-[10px] text-slate-500" style={{ gridTemplateColumns: 'repeat(24,minmax(0,1fr))' }}>{Array.from({ length: 24 }, (_, h) => <span key={h}>{h}</span>)}</div>
              {zones.map((z) => (
                <div key={z.id} className="mt-1 flex items-center">
                  <span className="w-32 shrink-0 truncate pr-2 text-xs text-slate-300">{z.name}</span>
                  <div className="grid flex-1 gap-0.5" style={{ gridTemplateColumns: 'repeat(24,minmax(0,1fr))' }}>
                    {heat[z.id].map((v, h) => <button key={h} onClick={() => setHour(h)} title={`${z.name} ${h}:00 → ${v}`} className={`h-6 rounded-[4px] transition hover:scale-110 ${h === hour ? 'ring-2 ring-white' : ''}`} style={{ background: cellColor(v) }} />)}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">{isError ? 'Error = predicted − actual. Purple = over-predicted, cyan = under-predicted, faint = accurate.' : 'Click a cell to select an hour. Darker = lower demand, orange/red = peak demand. Switch between Actual and Predicted to compare them on the same scale.'}</p>
        </Section>
        <Section title="Feature importance" subtitle="What drives the model">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.featureImportance.slice(0, 10)} layout="vertical" margin={{ left: 20 }}><XAxis type="number" {...axisProps} /><YAxis type="category" dataKey="feature" {...axisProps} width={90} /><Tooltip {...chartTooltip} /><Bar dataKey="importance" fill="#8b5cf6" radius={[0, 6, 6, 0]} /></BarChart>
          </ResponsiveContainer>
        </Section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Section className="xl:col-span-3" title={`Forecast map at ${hour}:00`} right={<input type="range" min="0" max="23" value={hour} onChange={(e) => setHour(+e.target.value)} className="w-40 accent-brand-500" />}>
          <BaseMap className="h-[380px]"><HeatLayer points={mapPoints} max={Math.max(...Object.values(data.forecastNext24h).flat())} /></BaseMap>
        </Section>
        <Section className="xl:col-span-2" title="Proactive dispatch" subtitle={`Pre-position idle drivers for forecast demand at ${hour}:00`} right={<Compass className="h-4 w-4 text-aqua-400" />}>
          <div className="space-y-3">
            {pos?.topZones.map((z, i) => (
              <div key={z.zoneId} className="flex items-center justify-between rounded-xl bg-white/[.03] px-3 py-2">
                <p className="text-sm text-white">#{i + 1} {z.zoneName}</p>
                <p className="text-xs text-slate-400"><b className="text-brand-300">{z.predicted}</b> rides · {Math.round(z.share * 100)}% of demand</p>
              </div>
            ))}
            {plan && (
              <div className="rounded-xl border border-aqua-400/20 bg-aqua-400/[.05] p-3">
                <p className="text-sm font-semibold text-white">Plan: {plan.moves.length} move{plan.moves.length === 1 ? '' : 's'} for {plan.idleDrivers} idle drivers</p>
                <div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto">
                  {plan.moves.length === 0 && <p className="text-xs text-slate-400">Idle drivers already match the forecast distribution.</p>}
                  {plan.moves.map((m) => <p key={m.driverId} className="flex flex-wrap items-center gap-1 text-xs text-slate-300"><b className="text-white">{m.driverName}</b> {m.fromZone} <ArrowRight className="h-3 w-3 text-aqua-400" /> <span className="text-aqua-300">{m.toZone}</span> <span className="text-slate-500">{m.distanceKm} km</span></p>)}
                </div>
                {user.role === 'admin'
                  ? <button onClick={dispatchNow} disabled={dispatching || !plan.moves.length} className="btn-primary btn-sm mt-3 w-full">{dispatching ? <Spinner className="!text-white" /> : <Navigation className="h-3.5 w-3.5" />}{plan.moves.length ? 'Pre-position drivers now' : 'Already balanced for this hour'}</button>
                  : <p className="mt-2 text-xs text-slate-500">Admins can dispatch this plan; your own suggestion is on the driver dashboard.</p>}
              </div>
            )}
            <p className="text-xs text-slate-500">Pick an hour with the slider or the heatmap. Watch the cars move on the Admin dashboard or Zone Intelligence map.</p>
          </div>
        </Section>
      </div>
    </div>
  );
}
