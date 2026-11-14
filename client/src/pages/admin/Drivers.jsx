import { useState } from 'react';
import { Car, Search, Power } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useToast } from '../../context/ToastContext';
import { PageHeader, Section, Badge, Loading, Tabs, Bar, StatCard } from '../../components/ui';
import { inr, pct } from '../../lib/format';

export default function AdminDrivers() {
  const toast = useToast();
  const { data, loading, reload } = useApi('/admin/drivers', { interval: 5000 });
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');
  const drivers = (data?.drivers || []).filter((d) => (tab === 'all' || d.status === tab) && (d.name.toLowerCase().includes(q.toLowerCase()) || d.vehicle?.plate?.toLowerCase().includes(q.toLowerCase())));
  const all = data?.drivers || [];
  const toggle = async (d) => {
    try { await api.post(`/admin/drivers/${d._id}/status`, { online: d.status === 'offline' }); toast(`${d.name} is now ${d.status === 'offline' ? 'online' : 'offline'}`, '', 'success'); reload(); } catch (e) { toast('Failed', errMsg(e), 'danger'); }
  };
  return (
    <div>
      <PageHeader title="Driver management" subtitle={`${all.length} drivers · ${all.filter((d) => d.isSimulated).length} simulated with different acceptance behaviours`} icon={Car} />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Available" value={all.filter((d) => d.status === 'available').length} tone="green" />
        <StatCard label="On trip" value={all.filter((d) => d.status === 'busy').length} />
        <StatCard label="Offline" value={all.filter((d) => d.status === 'offline').length} tone="slate" />
        <StatCard label="Avg acceptance" value={pct(all.reduce((s, d) => s + d.acceptanceRate, 0) / Math.max(1, all.length))} tone="aqua" />
      </div>
      <Section title="All drivers" right={<div className="flex flex-wrap gap-2"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input className="input !py-2 pl-9" placeholder="Search name/plate" value={q} onChange={(e) => setQ(e.target.value)} /></div><Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All' }, { value: 'available', label: 'Available' }, { value: 'busy', label: 'Busy' }, { value: 'offline', label: 'Offline' }]} /></div>}>
        {loading ? <Loading /> : (
          <div className="overflow-x-auto"><table className="table-x"><thead><tr><th>Driver</th><th>Vehicle</th><th>Zone</th><th>Status</th><th>Acceptance</th><th>Trips today</th><th>Earnings today</th><th>Idle</th><th>Rating</th><th /></tr></thead>
            <tbody>{drivers.map((d) => (
              <tr key={d._id}>
                <td><p className="font-medium text-white">{d.name}</p><p className="text-[10px] text-slate-500">{d.isSimulated ? 'simulated' : 'real account'}{d.stalled ? ' · stalled' : ''}</p></td>
                <td className="text-xs">{d.vehicle?.model}{d.ev && <span className="ml-1 chip bg-emerald-500/15 text-emerald-300">EV</span>}{d.gender === 'female' && <span className="ml-1 chip bg-pink-500/15 text-pink-300">woman</span>}{d.flagged && <span className="ml-1 chip bg-rose-500/15 text-rose-300">suspended</span>}<p className="font-mono text-slate-500">{d.vehicle?.plate}</p></td>
                <td>{d.zoneId}</td>
                <td><Badge status={d.hasOffer ? 'offered' : d.status}>{d.hasOffer ? 'offered' : d.status}</Badge></td>
                <td className="w-32"><div className="flex items-center gap-2"><Bar value={d.acceptanceRate * 100} color={d.acceptanceRate > 0.8 ? 'bg-emerald-400' : d.acceptanceRate > 0.65 ? 'bg-amber-400' : 'bg-rose-400'} /><span className="text-xs">{pct(d.acceptanceRate)}</span></div></td>
                <td>{d.stats.todayTrips}</td><td>{inr(d.stats.todayEarnings)}</td><td>{d.idleMinutes} min</td><td>{d.rating?.toFixed(2)}</td>
                <td><button disabled={d.status === 'busy'} onClick={() => toggle(d)} className={d.status === 'offline' ? 'btn-success btn-sm' : 'btn-ghost btn-sm'}><Power className="h-3.5 w-3.5" />{d.status === 'offline' ? 'Online' : 'Offline'}</button></td>
              </tr>
            ))}</tbody></table></div>
        )}
      </Section>
    </div>
  );
}
