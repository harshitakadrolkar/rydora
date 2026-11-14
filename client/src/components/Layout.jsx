import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard, CarFront, MapPinned, History, BrainCircuit, Grid3x3, Users, Scale, Bell, LogOut, Menu, X,
  ShieldCheck, Car, UserRound, Activity, Wallet, Siren,
} from 'lucide-react';
import { useAuth, useSocketEvent } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { AutoMark } from './Illustrations';
import VoiceAssistant from './VoiceAssistant';
import { ago } from '../lib/format';

const NAV = {
  passenger: [
    { to: '/passenger', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/passenger/book', label: 'Book a Ride', icon: CarFront },
    { to: '/passenger/track', label: 'Live Tracking', icon: MapPinned },
    { to: '/passenger/history', label: 'Ride History', icon: History },
    { section: 'Smart Mobility' },
    { to: '/analytics/pooling', label: 'Ride Pooling', icon: Users },
  ],
  driver: [
    { to: '/driver', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/driver/history', label: 'Earnings & History', icon: Wallet },
    { section: 'Intelligence' },
    { to: '/analytics/zones', label: 'Zone Intelligence', icon: Grid3x3 },
    { to: '/analytics/forecast', label: 'Demand Forecast', icon: BrainCircuit },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/rides', label: 'Active Rides', icon: Activity },
    { to: '/admin/drivers', label: 'Drivers', icon: Car },
    { to: '/admin/passengers', label: 'Passengers', icon: UserRound },
    { to: '/admin/safety', label: 'Safety Centre', icon: Siren },
    { section: 'Intelligence' },
    { to: '/analytics/forecast', label: 'Demand Forecast', icon: BrainCircuit },
    { to: '/analytics/zones', label: 'Zone Intelligence', icon: Grid3x3 },
    { to: '/analytics/pooling', label: 'Ride Pooling', icon: Users },
    { to: '/analytics/allocation', label: 'Driver Allocation', icon: Scale },
  ],
};

export function Logo({ small }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="RYDORA home">
      <AutoMark className={small ? 'h-8 w-8' : 'h-9 w-9'} />
      <span className={`font-logo font-extrabold uppercase tracking-[0.12em] text-white ${small ? 'text-base' : 'text-lg'}`}>Rydora</span>
    </Link>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const toast = useToast();
  const load = () => api.get('/notifications').then(({ data }) => { setItems(data.notifications); setUnread(data.unread); }).catch(() => {});
  useEffect(() => { load(); }, []);
  useSocketEvent('notification', (n) => { toast(n.title, n.message, n.type); setItems((x) => [n, ...x].slice(0, 40)); setUnread((u) => u + 1); });
  const readAll = async () => { await api.post('/notifications/read-all'); setUnread(0); setItems((x) => x.map((n) => ({ ...n, read: true }))); };
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[.03] hover:bg-white/[.07]" aria-label="Notifications">
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="card absolute right-0 z-[1200] mt-2 w-[min(360px,calc(100vw-2rem))] animate-fadeup">
          <div className="flex items-center justify-between border-b border-white/[.06] px-4 py-3">
            <p className="font-semibold text-white">Notifications</p>
            <button onClick={readAll} className="text-xs font-semibold text-brand-300 hover:text-brand-200">Mark all read</button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No notifications yet</p>}
            {items.map((n, i) => (
              <div key={n._id || i} className={`border-b border-white/[.04] px-4 py-3 ${n.read ? '' : 'bg-brand-500/[.06]'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white">{n.title}</p>
                  <span className="shrink-0 text-[10px] text-slate-500">{ago(n.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">{n.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = NAV[user?.role] || [];
  const [mobile, setMobile] = useState(false);
  const navigate = useNavigate();
  const doLogout = () => { logout(); navigate('/'); };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5"><Logo /><button className="lg:hidden" onClick={() => setMobile(false)}><X className="h-5 w-5" /></button></div>
      <div className="mx-4 mb-4 rounded-xl border border-white/[.06] bg-white/[.02] p-3">
        <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
        <p className="flex items-center gap-1 text-xs capitalize text-brand-300"><ShieldCheck className="h-3 w-3" />{user?.role} account</p>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {nav.map((n, i) => n.section ? (
          <p key={i} className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{n.section}</p>
        ) : (
          <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMobile(false)}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-white/[.06] text-white shadow-[inset_3px_0_0_#f5c400]' : 'text-slate-400 hover:bg-white/[.04] hover:text-white'}`}>
            <n.icon className="h-[18px] w-[18px]" />{n.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3">
        <button onClick={doLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-rose-500/10 hover:text-rose-300"><LogOut className="h-[18px] w-[18px]" />Log out</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-white/[.06] bg-ink-950/80 backdrop-blur lg:block">{sidebar}</aside>
      {mobile && (
        <div className="fixed inset-0 z-[1300] lg:hidden">
          <div className="absolute inset-0 bg-ink-950/70" onClick={() => setMobile(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-white/[.06] bg-ink-950">{sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-[1000] flex h-16 items-center justify-between gap-3 border-b border-white/[.06] bg-ink-900/80 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 lg:hidden" onClick={() => setMobile(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
            <div className="lg:hidden"><Logo small /></div>
            <span className="hidden items-center gap-2 text-xs text-slate-400 lg:flex"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" /></span>Live simulation · Bengaluru</span>
          </div>
          <div className="flex items-center gap-2">
            <VoiceAssistant />
            <NotificationBell />
            <div className="hidden h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[.03] px-3 sm:flex">
              <div className="grid h-6 w-6 place-items-center rounded-full bg-auto-400 text-[11px] font-bold text-ink-950">{user?.name?.[0]}</div>
              <span className="text-sm font-medium">{user?.name?.split(' ')[0]}</span>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
