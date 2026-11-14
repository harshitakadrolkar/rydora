import { useState } from 'react';
import { Link, useNavigate, useParams, Navigate } from 'react-router-dom';
import { ArrowRight, UserPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { errMsg } from '../../lib/api';
import { Spinner } from '../../components/ui';
import { AuthShell } from './Login';
import { homeFor } from '../../App';

const ZONES = [['Z1', 'MG Road (CBD)'], ['Z2', 'Koramangala'], ['Z3', 'Indiranagar'], ['Z4', 'Whitefield'], ['Z5', 'Electronic City'], ['Z6', 'HSR Layout'], ['Z7', 'Jayanagar'], ['Z8', 'Hebbal'], ['Z9', 'Yeshwanthpur'], ['Z10', 'Marathahalli']];

function Field({ label, error, children }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="mt-1 text-xs text-rose-400">{error}</p>}</div>;
}

export default function Register() {
  const { role } = useParams();
  const { register, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', confirm: '', vehicleModel: '', plate: '', category: 'sedan', licenseNo: '', zoneId: 'Z1', gender: role === 'driver' ? '' : 'unspecified', fuel: 'petrol' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  if (!['passenger', 'driver'].includes(role)) return <Navigate to="/register/passenger" replace />;
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const validate = () => {
    const e = {};
    if (f.name.trim().length < 2) e.name = 'Enter your full name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'Enter a valid email';
    if (!/^[+]?[0-9\s-]{8,15}$/.test(f.phone)) e.phone = 'Enter a valid phone number';
    if (f.password.length < 6) e.password = 'At least 6 characters';
    if (f.password !== f.confirm) e.confirm = 'Passwords do not match';
    if (role === 'driver') {
      if (f.vehicleModel.trim().length < 2) e.vehicleModel = 'Enter your vehicle model';
      if (!/^[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{1,3}[ -]?\d{3,4}$/i.test(f.plate.trim())) e.plate = 'Format: KA 01 AB 1234';
      if (f.licenseNo.trim().length < 6) e.licenseNo = 'Enter a valid licence number';
      if (!f.gender) e.gender = 'Select your gender';
    }
    setErrors(e);
    return !Object.keys(e).length;
  };
  const submit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const { confirm, ...body } = f;
      const u = await register(role, body);
      toast('Account created', `Welcome to RYDORA, ${u.name}!`, 'success');
      navigate(homeFor(u.role));
    } catch (e) { toast('Registration failed', errMsg(e), 'danger'); setErrors({ form: errMsg(e) }); }
    finally { setLoading(false); }
  };

  return (
    <AuthShell side={<div><UserPlus className="mb-5 h-10 w-10 text-auto-400" /><h2 className="max-w-md text-4xl font-extrabold leading-tight [text-wrap:balance]">{role === 'driver' ? 'Drive with a platform that distributes rides fairly.' : 'Rides matched by intelligence, not just distance.'}</h2></div>}>
      <div className="mb-6 flex gap-1 rounded-xl border border-white/10 bg-ink-900/60 p-1">
        {['passenger', 'driver'].map((r) => <Link key={r} to={`/register/${r}`} className={`flex-1 rounded-lg py-2 text-center text-xs font-semibold capitalize ${r === role ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'}`}>{r}</Link>)}
      </div>
      <h1 className="text-3xl font-bold capitalize">{role} registration</h1>
      <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><Field label="Full name" error={errors.name}><input className="input" value={f.name} onChange={set('name')} placeholder="Your name" /></Field></div>
        <Field label="Email" error={errors.email}><input className="input" type="email" value={f.email} onChange={set('email')} placeholder="you@example.com" /></Field>
        <Field label="Phone" error={errors.phone}><input className="input" value={f.phone} onChange={set('phone')} placeholder="98765 43210" /></Field>
        <Field label="Password" error={errors.password}><input className="input" type="password" value={f.password} onChange={set('password')} /></Field>
        <Field label="Confirm password" error={errors.confirm}><input className="input" type="password" value={f.confirm} onChange={set('confirm')} /></Field>
        <div className="sm:col-span-2"><Field label={role === 'driver' ? 'Gender (for the woman-driver option)' : 'Gender (optional)'} error={errors.gender}>
          <select className="input" value={f.gender} onChange={set('gender')}>
            {role === 'driver' ? <option value="">Select</option> : <option value="unspecified">Prefer not to say</option>}
            <option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
          </select></Field></div>
        {role === 'driver' && <>
          <Field label="Vehicle model" error={errors.vehicleModel}><input className="input" value={f.vehicleModel} onChange={set('vehicleModel')} placeholder="Maruti Dzire" /></Field>
          <Field label="Number plate" error={errors.plate}><input className="input uppercase" value={f.plate} onChange={set('plate')} placeholder="KA 01 AB 1234" /></Field>
          <Field label="Category"><select className="input" value={f.category} onChange={set('category')}><option value="mini">Mini (hatchback)</option><option value="sedan">Sedan</option><option value="suv">XL (SUV)</option></select></Field>
          <Field label="Fuel type"><select className="input" value={f.fuel} onChange={set('fuel')}><option value="petrol">Petrol / Diesel</option><option value="cng">CNG</option><option value="ev">Electric (EV)</option></select></Field>
          <label className="flex items-center gap-2 self-end rounded-xl border border-white/10 px-3 py-2.5 text-sm text-slate-200"><input id="child-seat" type="checkbox" checked={!!f.childSeat} onChange={(e) => setF({ ...f, childSeat: e.target.checked })} className="h-4 w-4" />My car has a child car seat</label>
          <Field label="Driving licence no." error={errors.licenseNo}><input className="input" value={f.licenseNo} onChange={set('licenseNo')} placeholder="KA0120230001234" /></Field>
          <div className="sm:col-span-2"><Field label="Starting zone"><select className="input" value={f.zoneId} onChange={set('zoneId')}>{ZONES.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></Field></div>
        </>}
        {errors.form && <p className="rounded-lg bg-rose-500/10 p-2.5 text-xs text-rose-300 sm:col-span-2">{errors.form}</p>}
        <button className="btn-primary sm:col-span-2" disabled={loading}>{loading ? <Spinner className="!text-white" /> : <>Create account <ArrowRight className="h-4 w-4" /></>}</button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-400">Already registered? <Link to={`/login/${role}`} className="font-semibold text-brand-300">Log in</Link></p>
    </AuthShell>
  );
}
