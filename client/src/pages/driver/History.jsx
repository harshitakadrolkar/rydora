import { useState } from 'react';
import { Wallet, Download } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useApi } from '../../lib/hooks';
import { PageHeader, Section, StatCard, Loading, Empty, Tabs, chartTooltip, axisProps } from '../../components/ui';
import { RideTable, RideDetail, exportCsv } from '../passenger/History';
import { inr, km } from '../../lib/format';

export default function DriverHistory() {
  const { data, loading } = useApi('/rides/mine');
  const earn = useApi('/drivers/me/earnings');
  const [tab, setTab] = useState('all');
  const [open, setOpen] = useState(null);
  const rides = data?.rides || [];
  const done = rides.filter((r) => r.status === 'COMPLETED');
  const list = rides.filter((r) => tab === 'all' || r.status === tab);
  const total = done.reduce((s, r) => s + (r.driverEarning || 0), 0);
  return (
    <div>
      <PageHeader title="Earnings & ride history" icon={Wallet} actions={<button className="btn-ghost" onClick={() => exportCsv(list, 'rydora-driver-rides.csv')} disabled={!list.length}><Download className="h-4 w-4" />Export CSV</button>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total earnings (recorded rides)" value={inr(total)} tone="green" />
        <StatCard label="Completed trips" value={done.length} />
        <StatCard label="Avg earning / trip" value={inr(done.length ? total / done.length : 0)} tone="aqua" />
        <StatCard label="Distance driven" value={km(done.reduce((s, r) => s + (r.distanceKm || 0), 0))} tone="amber" />
      </div>
      <Section title="Last 7 days" className="mb-6">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={earn.data?.days || []}><defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#34d399" stopOpacity={0.45} /><stop offset="1" stopColor="#34d399" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid stroke="#1c2550" vertical={false} /><XAxis dataKey="label" {...axisProps} /><YAxis {...axisProps} width={45} /><Tooltip {...chartTooltip} formatter={(v, n) => (n === 'earnings' ? inr(v) : v)} />
            <Area dataKey="earnings" stroke="#34d399" strokeWidth={2} fill="url(#eg)" /><Area dataKey="trips" stroke="#a78bfa" fill="none" />
          </AreaChart>
        </ResponsiveContainer>
      </Section>
      <Section title={`${list.length} rides`} right={<Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'CANCELLED', label: 'Cancelled' }]} />}>
        {loading ? <Loading /> : list.length ? <RideTable rides={list} onOpen={setOpen} perspective="driver" /> : <Empty icon={Wallet} title="No rides yet" />}
      </Section>
      <RideDetail ride={open} onClose={() => setOpen(null)} />
    </div>
  );
}
