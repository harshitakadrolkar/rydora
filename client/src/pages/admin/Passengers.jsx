import { useState } from 'react';
import { UserRound, Search, Ban, CheckCircle2 } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useToast } from '../../context/ToastContext';
import { PageHeader, Section, Badge, Loading, StatCard } from '../../components/ui';
import { inr, dateTime } from '../../lib/format';

export default function AdminPassengers() {
  const toast = useToast();
  const { data, loading, reload } = useApi('/admin/passengers');
  const [q, setQ] = useState('');
  const all = data?.passengers || [];
  const list = all.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.email.toLowerCase().includes(q.toLowerCase()));
  const toggle = async (p) => {
    try { await api.patch(`/admin/users/${p._id}/active`, { active: !p.active }); toast(`${p.name} ${p.active ? 'suspended' : 're-activated'}`, '', 'success'); reload(); } catch (e) { toast('Failed', errMsg(e), 'danger'); }
  };
  return (
    <div>
      <PageHeader title="Passenger management" subtitle={`${all.length} passengers (${all.filter((p) => p.simulated).length} simulated)`} icon={UserRound} />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Passengers" value={all.length} />
        <StatCard label="Riding now" value={all.filter((p) => p.activeRide).length} tone="aqua" />
        <StatCard label="Total rides" value={all.reduce((s, p) => s + p.rides, 0)} tone="green" />
        <StatCard label="Total spend" value={inr(all.reduce((s, p) => s + p.spent, 0))} tone="amber" />
      </div>
      <Section title="All passengers" right={<div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input className="input !py-2 pl-9" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} /></div>}>
        {loading ? <Loading /> : (
          <div className="overflow-x-auto"><table className="table-x"><thead><tr><th>Passenger</th><th>Contact</th><th>Rides</th><th>Spent</th><th>Last ride</th><th>Status</th><th /></tr></thead>
            <tbody>{list.map((p) => (
              <tr key={p._id}>
                <td><p className="font-medium text-white">{p.name}</p><p className="text-[10px] text-slate-500">{p.simulated ? 'simulated' : 'real account'}</p></td>
                <td className="text-xs">{p.email}<p className="text-slate-500">{p.phone}</p></td>
                <td>{p.rides}</td><td>{inr(p.spent)}</td><td className="text-xs">{dateTime(p.lastRide)}</td>
                <td>{p.activeRide ? <Badge status="ONGOING">riding</Badge> : p.active ? <Badge status="available">active</Badge> : <Badge status="CANCELLED">suspended</Badge>}</td>
                <td><button onClick={() => toggle(p)} className={p.active ? 'btn-danger btn-sm' : 'btn-success btn-sm'}>{p.active ? <><Ban className="h-3.5 w-3.5" />Suspend</> : <><CheckCircle2 className="h-3.5 w-3.5" />Activate</>}</button></td>
              </tr>
            ))}</tbody></table></div>
        )}
      </Section>
    </div>
  );
}
