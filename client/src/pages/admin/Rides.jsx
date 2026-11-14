import { useEffect, useState } from 'react';
import { Activity, RefreshCcw, XCircle, Eye } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useSocketEvent } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useApi } from '../../lib/hooks';
import { PageHeader, Section, Badge, Empty, Tabs, Loading } from '../../components/ui';
import { RideDetail } from '../passenger/History';
import { inr, km, time, ago } from '../../lib/format';

export default function AdminRides() {
  const toast = useToast();
  const [rides, setRides] = useState([]);
  const [tab, setTab] = useState('all');
  const [open, setOpen] = useState(null);
  const recent = useApi('/admin/rides?limit=60', { interval: 15000 });
  useEffect(() => { api.get('/admin/rides/active').then(({ data }) => setRides(data.rides)); }, []);
  useSocketEvent('ride:update', (r) => {
    setRides((list) => {
      const rest = list.filter((x) => x._id !== r._id);
      return ['COMPLETED', 'CANCELLED'].includes(r.status) ? rest : [r, ...rest].sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
    });
    setOpen((o) => (o && o._id === r._id ? r : o));
  });
  const act = async (id, action) => {
    try { await api.post(`/admin/rides/${id}/${action}`); toast(action === 'reassign' ? 'Reassignment triggered' : 'Ride cancelled', '', 'success'); } catch (e) { toast('Failed', errMsg(e), 'danger'); }
  };
  const list = rides.filter((r) => tab === 'all' || r.status === tab || (tab === 'pool' && r.type === 'pool'));
  const counts = rides.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }), {});
  return (
    <div>
      <PageHeader title="Active ride monitoring" subtitle="Every non-terminal ride, updating live over WebSockets" icon={Activity} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {['REQUESTED', 'ACCEPTED', 'ARRIVING', 'ONGOING'].map((s) => <div key={s} className="card p-4"><Badge status={s} /><p className="mt-2 font-display text-2xl font-bold text-white">{counts[s] || 0}</p></div>)}
        <div className="card p-4"><Badge status="tight">reassigned</Badge><p className="mt-2 font-display text-2xl font-bold text-white">{rides.filter((r) => r.reassignments?.length).length}</p></div>
      </div>
      <Section title={`${list.length} active rides`} right={<Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All' }, { value: 'REQUESTED', label: 'Requested' }, { value: 'ARRIVING', label: 'Arriving' }, { value: 'ONGOING', label: 'Ongoing' }, { value: 'pool', label: 'Pool' }]} />}>
        {!list.length ? <Empty icon={Activity} title="No active rides" text="Simulated demand will appear here shortly." /> : (
          <div className="overflow-x-auto"><table className="table-x"><thead><tr><th>Ride</th><th>Passenger</th><th>Route</th><th>Driver</th><th>Offers</th><th>Reassign</th><th>Fare</th><th>Status</th><th /></tr></thead>
            <tbody>{list.map((r) => (
              <tr key={r._id}>
                <td><p className="font-medium text-white">{r.code}</p><p className="text-xs text-slate-500">{ago(r.requestedAt)}</p></td>
                <td>{r.passengerName}{r.simulated && <p className="text-[10px] text-amber-300/80">simulated</p>}</td>
                <td className="text-xs">{r.pickup.zoneName} → {r.drop.zoneName}<p className="text-slate-500">{km(r.distanceKm)} {r.type === 'pool' && '· pool'}</p></td>
                <td>{r.driverName || (r.currentOffer ? <span className="text-xs text-amber-300">offered: {r.currentOffer.driverName}</span> : <span className="text-xs text-slate-500">matching...</span>)}</td>
                <td>{r.offers?.length || 0}</td>
                <td>{r.reassignments?.length ? <span className="font-semibold text-orange-300">{r.reassignments.length}</span> : 0}</td>
                <td>{inr(r.fare.total)}{r.surge > 1 && <p className="text-[10px] text-amber-300">{r.surge}x</p>}</td>
                <td><Badge status={r.status} /></td>
                <td><div className="flex gap-1">
                  <button title="Details" onClick={() => setOpen(r)} className="btn-ghost btn-sm"><Eye className="h-3.5 w-3.5" /></button>
                  {['ACCEPTED', 'ARRIVING'].includes(r.status) && <button title="Force reassignment" onClick={() => act(r._id, 'reassign')} className="btn-ghost btn-sm"><RefreshCcw className="h-3.5 w-3.5 text-orange-300" /></button>}
                  <button title="Cancel" onClick={() => act(r._id, 'cancel')} className="btn-danger btn-sm"><XCircle className="h-3.5 w-3.5" /></button>
                </div></td>
              </tr>
            ))}</tbody></table></div>
        )}
      </Section>
      <Section className="mt-6" title="Recently finished rides">
        {recent.loading ? <Loading /> : (
          <div className="max-h-[420px] overflow-auto"><table className="table-x"><thead><tr><th>Ride</th><th>Passenger</th><th>Driver</th><th>Status</th><th>Wait</th><th>Fare</th><th>Time</th></tr></thead>
            <tbody>{(recent.data?.rides || []).filter((r) => ['COMPLETED', 'CANCELLED'].includes(r.status)).map((r) => <tr key={r._id} className="cursor-pointer" onClick={() => setOpen(r)}><td className="font-medium text-white">{r.code}</td><td>{r.passengerName}</td><td>{r.driverName || '-'}</td><td><Badge status={r.status} /></td><td>{r.waitTimeMin != null ? `${r.waitTimeMin} min` : '-'}</td><td>{inr(r.fare?.final ?? r.fare?.total)}</td><td className="text-xs text-slate-500">{time(r.requestedAt)}</td></tr>)}</tbody></table></div>
        )}
      </Section>
      <RideDetail ride={open} onClose={() => setOpen(null)} />
    </div>
  );
}
