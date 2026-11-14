import { useState } from 'react';
import { Link, useNavigate, useParams, Navigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, UserRound, Car, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { errMsg } from '../../lib/api';
import { Logo } from '../../components/Layout';
import { Spinner } from '../../components/ui';
import { CityRideIllustration } from '../../components/Illustrations';
import { homeFor } from '../../App';

const ROLES = {
  passenger: { title: 'Passenger login', icon: UserRound, demo: ['passenger@rydora.com', 'password123'], text: 'Book intelligent rides, pool and save.' },
  driver: { title: 'Driver login', icon: Car, demo: ['driver@rydora.com', 'password123'], text: 'Receive ride requests and earn fairly.' },
  admin: { title: 'Admin login', icon: ShieldCheck, demo: ['admin@rydora.com', 'admin123'], text: 'Monitor the city and run the intelligence engines.' },
};

export function AuthShell({ children, side }) {
  return (
    <div className="grid min-h-screen bg-ink-950 lg:grid-cols-2">
      <div className="relative hidden overflow-hidden border-r border-white/[.06] bg-ink-900 lg:block">
        <div className="relative flex h-full flex-col justify-between p-12">
          <Logo />
          <div>
            {side}
            <CityRideIllustration className="mt-10 w-full max-w-xl" compact fade />
          </div>
          <p className="text-xs text-slate-500">All drivers, passengers and demand in this demo are simulated.</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-5">
        <div className="w-full max-w-md animate-fadeup">
          <div className="mb-8 lg:hidden"><Logo /></div>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  const { role } = useParams();
  const cfg = ROLES[role];
  const { login, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  if (!cfg) return <Navigate to="/login/passenger" replace />;
  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const validate = () => {
    const e = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email address';
    if (form.password.length < 6) e.password = 'Password must be at least 6 characters';
    setErrors(e);
    return !Object.keys(e).length;
  };
  const submit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const u = await login(form.email, form.password, role);
      toast('Welcome back', `Logged in as ${u.name}`, 'success');
      navigate(homeFor(u.role));
    } catch (e) { toast('Login failed', errMsg(e), 'danger'); setErrors({ form: errMsg(e) }); }
    finally { setLoading(false); }
  };
  const Icon = cfg.icon;
  return (
    <AuthShell side={<div><Icon className="mb-5 h-10 w-10 text-auto-400" /><h2 className="max-w-md text-4xl font-extrabold leading-tight [text-wrap:balance]">{cfg.text}</h2></div>}>
      <div className="mb-6 flex gap-1 rounded-xl border border-white/10 bg-ink-900/60 p-1">
        {Object.keys(ROLES).map((r) => <Link key={r} to={`/login/${r}`} className={`flex-1 rounded-lg py-2 text-center text-xs font-semibold capitalize ${r === role ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'}`}>{r}</Link>)}
      </div>
      <h1 className="text-3xl font-bold">{cfg.title}</h1>
      <p className="mt-1 text-sm text-slate-400">Sign in to continue to RYDORA.</p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <div>
          <label className="label">Email</label>
          <div className="relative"><Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><input className="input pl-10" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></div>
          {errors.email && <p className="mt-1 text-xs text-rose-400">{errors.email}</p>}
        </div>
        <div>
          <label className="label">Password</label>
          <div className="relative"><Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><input className="input pl-10" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" /></div>
          {errors.password && <p className="mt-1 text-xs text-rose-400">{errors.password}</p>}
        </div>
        {errors.form && <p className="rounded-lg bg-rose-500/10 p-2.5 text-xs text-rose-300">{errors.form}</p>}
        <button className="btn-primary w-full" disabled={loading}>{loading ? <Spinner className="!text-white" /> : <>Sign in <ArrowRight className="h-4 w-4" /></>}</button>
      </form>
      <button onClick={() => setForm({ email: cfg.demo[0], password: cfg.demo[1] })} className="mt-4 w-full rounded-xl border border-dashed border-brand-400/30 bg-brand-500/5 p-3 text-left text-xs text-slate-300 hover:bg-brand-500/10">
        <span className="font-semibold text-brand-200">Use demo account</span> · {cfg.demo[0]} / {cfg.demo[1]}
      </button>
      {role !== 'admin' && <p className="mt-6 text-center text-sm text-slate-400">New to RYDORA? <Link to={`/register/${role}`} className="font-semibold text-brand-300 hover:text-brand-200">Create a {role} account</Link></p>}
    </AuthShell>
  );
}
