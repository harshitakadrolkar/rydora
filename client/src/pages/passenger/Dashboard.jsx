import { Link } from 'react-router-dom';
import { CarFront, Wallet, PiggyBank, Clock, MapPinned, ArrowRight, Users, History } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { useApi, useFleet } from '../../lib/hooks';
import { PageHeader, StatCard, Section, Badge, Loading, Empty, SimBadge, chartTooltip, axisProps } from '../../components/ui';
import { BaseMap, DriverMarkers } from '../../components/MapKit';
import { RideStepper } from '../../components/RideBits';
import { CityRideIllustration } from '../../components/Illustrations';
import { EcoCard, TrustedContacts } from '../../components/SafetyKit';
import { useEffect } from 'react';
import { inr, dateTime, km } from '../../lib/format';

export default function PassengerDashboard() {
  const { user, refreshUser } = useAuth();
  useEffect(() => { refreshUser().catch(() => {}); }, []);
  const active = useApi('/rides/active', { interval: 5000 });
  const hist = useApi('/rides/mine');
  const fleet = useFleet();
  const rides = hist.data?.rides || [];
  const completed = rides.filter((r) => r.status === 'COMPLETED');
  const spent = completed.reduce((s, r) => s + (r.fare?.final || 0), 0);
  const saved = completed.reduce((s, r) => s + (r.pool?.savings || 0), 0);
  const waits = completed.filter((r) => r.waitTimeMin != null);
  const avgWait = waits.length ? waits.reduce((s, r) => s + r.waitTimeMin, 0) / waits.length : 0;
  const byDay = {};
  [...completed].reverse().forEach((r) => { const k = new Date(r.requestedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); byDay[k] = (byDay[k] || 0) + (r.fare?.final || 0); });
  const chart = Object.entries(byDay).map(([day, amount]) => ({ day, amount })).slice(-10);
  const ride = active.data?.ride;

  return (
    <div>
      <div className="mb-6 grid items-center gap-4 overflow-hidden rounded-2xl border border-white/[.06] bg-ink-850 md:grid-cols-[1fr_minmax(0,360px)]">
        <div className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-auto-400">Namaskara</p>
          <h1 className="mt-2 text-3xl font-bold">Hello, {user.name.split(' ')[0]}</h1>
          <p className="mt-1 text-slate-400">Where are you heading today? {fleet.length ? `${fleet.filter((d) => d.status === 'available').length} drivers are free near you.` : ''}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/passenger/book" className="btn-auto"><CarFront className="h-4 w-4" />Book a ride</Link>
            <Link to="/analytics/pooling" className="btn-ghost"><Users className="h-4 w-4" />Share & save</Link>
          </div>
        </div>
        <CityRideIllustration className="hidden w-full translate-y-3 md:block" compact />
      </div>
      {ride && (
        <Link to={`/passenger/track/${ride._id}`} className="card mb-6 block border-brand-500/30 p-5 shadow-glow transition hover:brightness-110">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-xs uppercase tracking-wide text-brand-300">Active ride · {ride.code}</p><p className="mt-1 font-semibold text-white">{ride.pickup.address} → {ride.drop.address}</p></div>
            <span className="btn-ghost btn-sm">Track live <ArrowRight className="h-3.5 w-3.5" /></span>
          </div>
          <RideStepper status={ride.status} />
        </Link>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total rides" value={rides.length} hint={`${completed.length} completed`} icon={History} />
        <StatCard label="Total spent" value={inr(spent)} icon={Wallet} tone="aqua" />
        <StatCard label="Saved with pooling" value={inr(saved)} icon={PiggyBank} tone="green" />
        <StatCard label="Avg pickup wait" value={`${avgWait.toFixed(1)} min`} icon={Clock} tone="amber" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Section className="xl:col-span-3" title="Drivers near you" subtitle={`${fleet.length} drivers online right now`} right={<SimBadge text="Simulated fleet" />}>
          <BaseMap className="h-[360px]"><DriverMarkers drivers={fleet} /></BaseMap>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />Available</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand-400" />On a trip</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />Reviewing an offer</span>
          </div>
        </Section>
        <Section className="xl:col-span-2" title="Spending trend" subtitle="Completed ride fares by day">
          {chart.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chart}><defs><linearGradient id="sp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b5cf6" stopOpacity={0.5} /><stop offset="1" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="#1c2550" vertical={false} /><XAxis dataKey="day" {...axisProps} /><YAxis {...axisProps} width={40} /><Tooltip {...chartTooltip} formatter={(v) => inr(v)} />
                <Area dataKey="amount" stroke="#a78bfa" strokeWidth={2} fill="url(#sp)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <Empty title="No rides yet" text="Your spending will appear here." />}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link to="/analytics/pooling" className="rounded-xl border border-white/[.06] bg-white/[.02] p-3 hover:bg-white/[.05]"><Users className="mb-1 h-4 w-4 text-emerald-400" /><p className="text-sm font-semibold text-white">Ride pooling</p><p className="text-xs text-slate-500">Share & save up to 30%</p></Link>
            <Link to="/passenger/track" className="rounded-xl border border-white/[.06] bg-white/[.02] p-3 hover:bg-white/[.05]"><MapPinned className="mb-1 h-4 w-4 text-aqua-400" /><p className="text-sm font-semibold text-white">Live tracking</p><p className="text-xs text-slate-500">Follow your driver</p></Link>
          </div>
        </Section>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <EcoCard />
        <Section title="Trusted contacts" subtitle="They receive your live trip link when you share a ride or press SOS">
          <TrustedContacts compact />
        </Section>
      </div>
      <Section className="mt-6" title="Recent rides" right={<Link to="/passenger/history" className="text-xs font-semibold text-brand-300">View all</Link>}>
        {hist.loading ? <Loading /> : rides.length === 0 ? <Empty icon={CarFront} title="No rides yet" text="Book your first ride to see it here." /> : (
          <div className="overflow-x-auto"><table className="table-x"><thead><tr><th>Ride</th><th>Route</th><th>Driver</th><th>Distance</th><th>Fare</th><th>Status</th></tr></thead>
            <tbody>{rides.slice(0, 6).map((r) => (
              <tr key={r._id}><td><p className="font-medium text-white">{r.code}</p><p className="text-xs text-slate-500">{dateTime(r.requestedAt)}</p></td>
                <td className="max-w-[260px] truncate text-xs">{r.pickup.address} → {r.drop.address}</td><td>{r.driverName || '-'}</td><td>{km(r.distanceKm)}</td><td>{inr(r.fare?.final ?? r.fare?.total)}</td><td><Badge status={r.status} /></td></tr>
            ))}</tbody></table></div>
        )}
      </Section>
    </div>
  );
}
