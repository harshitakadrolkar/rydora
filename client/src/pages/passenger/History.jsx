import { useState } from 'react';
import { History as HistoryIcon, Download } from 'lucide-react';
import { useApi } from '../../lib/hooks';
import { PageHeader, Section, Loading, Empty, Badge, Modal, Tabs, StatCard } from '../../components/ui';
import { RouteSummary, Timeline, MatchPanel } from '../../components/RideBits';
import { inr, km, dateTime, mins } from '../../lib/format';

export function exportCsv(rides, name) {
  const rows = [['code', 'requestedAt', 'status', 'type', 'pickup', 'drop', 'distanceKm', 'fare', 'driver'], ...rides.map((r) => [r.code, r.requestedAt, r.status, r.type, r.pickup?.address, r.drop?.address, r.distanceKm, r.fare?.final ?? r.fare?.total, r.driverName])];
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name; a.click();
}

export function RideTable({ rides, onOpen, perspective = 'passenger' }) {
  return (
    <div className="overflow-x-auto"><table className="table-x"><thead><tr><th>Ride</th><th>Route</th><th>{perspective === 'passenger' ? 'Driver' : 'Passenger'}</th><th>Type</th><th>Distance</th><th>{perspective === 'passenger' ? 'Fare' : 'Earning'}</th><th>Status</th></tr></thead>
      <tbody>{rides.map((r) => (
        <tr key={r._id} onClick={() => onOpen(r)} className="cursor-pointer">
          <td><p className="font-medium text-white">{r.code}</p><p className="text-xs text-slate-500">{dateTime(r.requestedAt)}</p></td>
          <td className="max-w-[280px]"><p className="truncate text-xs text-slate-300">{r.pickup?.address}</p><p className="truncate text-xs text-slate-500">→ {r.drop?.address}</p></td>
          <td>{perspective === 'passenger' ? r.driverName || '-' : r.passengerName}</td>
          <td>{r.type === 'pool' ? <Badge status="surplus">pool</Badge> : <span className="text-xs capitalize text-slate-400">{r.category}</span>}</td>
          <td>{km(r.distanceKm)}</td>
          <td className="font-semibold text-white">{perspective === 'passenger' ? inr(r.fare?.final ?? r.fare?.total) : inr(r.driverEarning || 0)}</td>
          <td><Badge status={r.status} /></td>
        </tr>
      ))}</tbody></table></div>
  );
}

export function RideDetail({ ride, onClose }) {
  return (
    <Modal open={!!ride} onClose={onClose} title={ride ? `Ride ${ride.code}` : ''} wide>
      {ride && <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2"><Badge status={ride.status} />{ride.simulated && <Badge>simulated</Badge>}<span className="text-xs text-slate-500">{dateTime(ride.requestedAt)}</span></div>
        <div className="grid gap-5 md:grid-cols-2">
          <RouteSummary ride={ride} />
          <div className="space-y-1 rounded-xl bg-white/[.03] p-4 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Fare</span><b className="text-white">{inr(ride.fare?.final ?? ride.fare?.total)}</b></div>
            {ride.type === 'pool' && <div className="flex justify-between"><span className="text-slate-400">Pool savings</span><b className="text-emerald-300">{inr(ride.pool?.savings || 0)}</b></div>}
            <div className="flex justify-between"><span className="text-slate-400">Driver</span><span>{ride.driverName || '-'}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Pickup wait</span><span>{ride.waitTimeMin != null ? mins(ride.waitTimeMin) : '-'}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Reassignments</span><span>{ride.reassignments?.length || 0}</span></div>
            {ride.cancelReason && <div className="flex justify-between"><span className="text-slate-400">Cancel reason</span><span>{ride.cancelReason}</span></div>}
          </div>
        </div>
        {ride.match && <MatchPanel match={ride.match} />}
        <Timeline items={ride.timeline} />
      </div>}
    </Modal>
  );
}

export default function RideHistory() {
  const { data, loading } = useApi('/rides/mine');
  const [tab, setTab] = useState('all');
  const [open, setOpen] = useState(null);
  const rides = data?.rides || [];
  const list = rides.filter((r) => tab === 'all' || (tab === 'pool' ? r.type === 'pool' : r.status === tab));
  const completed = rides.filter((r) => r.status === 'COMPLETED');
  return (
    <div>
      <PageHeader title="Ride history" subtitle="All your past rides with full allocation and timeline details" icon={HistoryIcon} actions={<button className="btn-ghost" onClick={() => exportCsv(list, 'rydora-rides.csv')} disabled={!list.length}><Download className="h-4 w-4" />Export CSV</button>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Completed" value={completed.length} />
        <StatCard label="Cancelled" value={rides.filter((r) => r.status === 'CANCELLED').length} tone="rose" />
        <StatCard label="Distance travelled" value={km(completed.reduce((s, r) => s + (r.distanceKm || 0), 0))} tone="aqua" />
        <StatCard label="Pool rides" value={rides.filter((r) => r.type === 'pool').length} tone="green" />
      </div>
      <Section right={<Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'CANCELLED', label: 'Cancelled' }, { value: 'pool', label: 'Pool' }]} />} title={`${list.length} rides`}>
        {loading ? <Loading /> : list.length ? <RideTable rides={list} onOpen={setOpen} /> : <Empty icon={HistoryIcon} title="No rides found" />}
      </Section>
      <RideDetail ride={open} onClose={() => setOpen(null)} />
    </div>
  );
}
