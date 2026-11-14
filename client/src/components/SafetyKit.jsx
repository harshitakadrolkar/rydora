import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, ShieldAlert, Share2, Phone, Siren, UserPlus, Trash2, Leaf, Copy, MessageCircle, Check, EyeOff, Link2Off } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Modal, Spinner } from './ui';

export const HELPLINES = [
  { name: 'Emergency (Police / Ambulance)', number: '112' },
  { name: 'Women Helpline (Police)', number: '1091' },
  { name: 'Women Helpline (National)', number: '181' },
];

/** Manage up to 3 trusted contacts who receive the live trip link. */
export function TrustedContacts({ compact = false }) {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const [list, setList] = useState(user?.emergencyContacts || []);
  const [form, setForm] = useState({ name: '', phone: '', relation: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setList(user?.emergencyContacts || []), [user?.emergencyContacts]);

  const save = async (next) => {
    setBusy(true);
    try { await api.put('/auth/me/contacts', { contacts: next }); await refreshUser(); setErr(''); toast('Trusted contacts saved', '', 'success'); return true; }
    catch (e) { setErr(errMsg(e)); return false; } finally { setBusy(false); }
  };
  const add = async (e) => {
    e.preventDefault();
    if (form.name.trim().length < 2) return setErr('Enter the contact name');
    if (!/^[+]?[0-9\s-]{8,15}$/.test(form.phone)) return setErr('Enter a valid phone number');
    if (await save([...list, form])) setForm({ name: '', phone: '', relation: '' });
  };
  return (
    <div>
      {list.length === 0 && <p className="mb-3 text-sm text-slate-400">Add family or friends. They get your live trip link when you share a ride or press SOS.</p>}
      <div className="space-y-2">
        {list.map((c, i) => (
          <div key={i} className="flex items-center justify-between rounded-xl bg-white/[.03] px-3 py-2">
            <div className="min-w-0"><p className="truncate text-sm font-medium text-white">{c.name} {c.relation && <span className="text-xs text-slate-500">· {c.relation}</span>}</p><p className="text-xs text-slate-400">{c.phone}</p></div>
            <button disabled={busy} onClick={() => save(list.filter((_, k) => k !== i))} className="text-slate-500 hover:text-rose-300" aria-label={`Remove ${c.name}`}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      {list.length < 3 && (
        <form onSubmit={add} className={`mt-3 grid gap-2 ${compact ? '' : 'sm:grid-cols-[1fr_1fr_0.8fr_auto]'}`}>
          <input id="tc-name" className="input !py-2" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input id="tc-phone" className="input !py-2" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input id="tc-rel" className="input !py-2" placeholder="Relation" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} />
          <button className="btn-ghost btn-sm" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}Add</button>
        </form>
      )}
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
    </div>
  );
}

function ShareResult({ share, onClose }) {
  const [copied, setCopied] = useState(false);
  if (!share) return null;
  const copy = async () => { try { await navigator.clipboard.writeText(share.message); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ } };
  return (
    <Modal open onClose={onClose} title="Live trip shared">
      <p className="text-sm text-slate-300">Anyone with this link can follow your ride live, with no login needed:</p>
      <a href={share.url} target="_blank" rel="noreferrer" className="mt-2 block break-all rounded-lg bg-white/[.04] p-2 font-mono text-xs text-aqua-400">{share.url}</a>
      <div className="mt-4 space-y-2">
        {share.sentTo.length === 0 && <p className="text-xs text-amber-300">You have no trusted contacts yet. Add them on your dashboard, or send the link yourself:</p>}
        {share.sentTo.map((c) => (
          <div key={c.phone} className="flex items-center justify-between rounded-xl bg-white/[.03] px-3 py-2">
            <div><p className="text-sm text-white">{c.name}</p><p className="text-xs text-slate-500">{c.phone} · SMS sent (simulated)</p></div>
            <a href={c.whatsapp} target="_blank" rel="noreferrer" className="btn-success btn-sm"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</a>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={copy} className="btn-ghost btn-sm">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy message'}</button>
        <a href={share.whatsappAll} target="_blank" rel="noreferrer" className="btn-ghost btn-sm"><MessageCircle className="h-3.5 w-3.5" />Send via WhatsApp</a>
      </div>
    </Modal>
  );
}

/** Press and hold for 1.5 s to send SOS (prevents accidental triggers, works by mouse, touch or keyboard). */
export function HoldSOS({ onFire, disabled, big = false, label = 'Hold for SOS' }) {
  const [p, setP] = useState(0);
  const timer = useRef(null);
  const start = () => {
    if (disabled || timer.current) return;
    const t0 = Date.now();
    timer.current = setInterval(() => {
      const v = Math.min(1, (Date.now() - t0) / 1500);
      setP(v);
      if (v >= 1) { stop(); onFire(); }
    }, 40);
  };
  const stop = () => { clearInterval(timer.current); timer.current = null; setP(0); };
  return (
    <button type="button" data-sos disabled={disabled} onPointerDown={start} onPointerUp={stop} onPointerLeave={stop}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); start(); } }} onKeyUp={stop}
      onClick={(e) => { if (e.detail === 0 && !timer.current) onFire(); }}
      className={`btn relative select-none overflow-hidden bg-rose-600 text-white hover:bg-rose-500 ${big ? '' : 'btn-sm'}`} aria-label="Press and hold for SOS">
      <span className="absolute inset-y-0 left-0 bg-rose-900/60" style={{ width: `${p * 100}%` }} />
      <span className="relative flex items-center gap-2"><Siren className="h-4 w-4" />{p > 0 ? 'Keep holding…' : label}</span>
    </button>
  );
}

function Countdown({ from }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  return <b>{Math.max(0, 60 - Math.floor((now - new Date(from).getTime()) / 1000))}s</b>;
}

/** Safety panel on the live-tracking page. */
export function SafetyPanel({ ride }) {
  const toast = useToast();
  const [share, setShare] = useState(null);
  const [sosOpen, setSosOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [silent, setSilent] = useState(() => { try { return localStorage.getItem('rydora_silent_sos') === '1'; } catch { return false; } });
  const toggleSilent = () => { const v = !silent; setSilent(v); try { localStorage.setItem('rydora_silent_sos', v ? '1' : '0'); } catch { /* ignore */ } };
  const s = ride.safety || {};
  const active = !['COMPLETED', 'CANCELLED'].includes(ride.status);
  const openAlert = (s.alerts || []).find((a) => a.status === 'OPEN');

  const call = async (key, fn) => { setBusy(key); try { return await fn(); } catch (e) { toast('Action failed', errMsg(e), 'danger'); return null; } finally { setBusy(''); } };
  const doShare = () => call('share', async () => { const { data } = await api.post(`/rides/${ride._id}/share`); setShare(data); });
  const doSos = () => call('sos', async () => {
    const { data } = await api.post(`/rides/${ride._id}/sos`, { reason: openAlert ? `Unsafe after: ${openAlert.message}` : `Rider pressed SOS${silent ? ' (silent)' : ''}` });
    setShare(null);
    if (silent) toast('Sent', '', 'info'); else { setSosOpen(true); toast('SOS sent', 'Safety team alerted and your contacts have your live location', 'danger'); }
    return data;
  });
  const stopShare = () => call('stop', async () => { await api.post(`/rides/${ride._id}/share/stop`); toast('Sharing stopped', 'The old link no longer works', 'info'); });
  const ack = (response) => call('ack', async () => { await api.post(`/rides/${ride._id}/safety/ack`, { response }); toast(response === 'safe' ? 'Glad you are safe' : 'We are escalating this', '', response === 'safe' ? 'success' : 'warning'); });
  const toggle = () => call('mon', () => api.post(`/rides/${ride._id}/safety/monitor`, { on: !s.monitoring }));
  const detour = () => call('detour', async () => { const { data } = await api.post(`/rides/${ride._id}/simulate-detour`); toast('Wrong turn simulated', data.message, 'warning'); });

  return (
    <>
      {openAlert && active && !s.sos && (
        <div className="mb-6 animate-fadeup rounded-2xl border-2 border-rose-500/60 bg-rose-500/10 p-5">
          <p className="flex items-center gap-2 text-lg font-bold text-rose-200"><ShieldAlert className="h-5 w-5" />{openAlert.type === 'ROUTE_DEVIATION' ? 'Your driver has left the expected route' : 'Your vehicle has stopped unexpectedly'}</p>
          <p className="mt-1 text-sm text-rose-100/80">{openAlert.message} Are you okay?</p>
          <p className="mt-1 text-xs text-rose-200">If you don&apos;t respond, we alert the RYDORA safety team automatically in <Countdown from={openAlert.at} />.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => ack('safe')} disabled={!!busy} className="btn-success"><Check className="h-4 w-4" />I&apos;m safe</button>
            <button onClick={doShare} disabled={!!busy} className="btn-ghost">{busy === 'share' ? <Spinner className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}Share trip with family</button>
            <HoldSOS big onFire={doSos} disabled={!!busy} label="Hold: SOS, I feel unsafe" />
          </div>
        </div>
      )}
      {s.sos && active && silent && <p className="mb-4 text-xs text-slate-500">Help is on the way.</p>}
      {s.sos && active && !silent && (
        <div className="mb-6 rounded-2xl border-2 border-rose-500 bg-rose-600/20 p-5">
          <p className="flex items-center gap-2 text-lg font-bold text-white"><Siren className="h-5 w-5 animate-pulse text-rose-300" />SOS active{s.sos.status === 'RESOLVED' ? ' (resolved by safety team)' : ''}</p>
          <p className="mt-1 text-sm text-rose-100">The RYDORA safety team can see your live location. Your trusted contacts have been sent the live trip link, and the driver is suspended from new rides pending review.</p>
          <div className="mt-3 flex flex-wrap gap-2">{HELPLINES.map((h) => <a key={h.number} href={`tel:${h.number}`} className="btn bg-white text-ink-950 hover:bg-slate-200"><Phone className="h-4 w-4" />{h.number} · {h.name}</a>)}</div>
        </div>
      )}

      <div className="card card-pad">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold"><ShieldCheck className={`h-5 w-5 ${s.monitoring ? 'text-emerald-400' : 'text-slate-500'}`} />Safety</h3>
          {active && <button onClick={toggle} disabled={!!busy} className={`chip ${s.monitoring ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-slate-400'}`}>Monitoring {s.monitoring ? 'ON' : 'OFF'}</button>}
        </div>
        <p className="text-xs text-slate-400">
          {s.monitoring ? `We watch for route deviations and unexpected stops${s.night ? ' because this is a late-night ride' : ''}${ride.prefs?.women ? ' on your woman-driver ride' : ''}.` : 'Turn monitoring on to get alerts if the driver leaves the route.'}
        </p>
        {ride.prefs?.women && <p className="mt-2 text-xs text-pink-300">Woman driver requested{ride.driverName ? ` · ${ride.driverName}` : ''}</p>}
        {s.sharing && <p className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-400"><span>Live trip shared{(s.sharedWith || []).length ? ` with ${s.sharedWith.join(', ')}` : ''}</span><button onClick={stopShare} className="flex items-center gap-1 text-slate-300 hover:text-white"><Link2Off className="h-3.5 w-3.5" />Stop sharing</button></p>}
        {s.sos?.status === 'ACTIVE' && <p className="mt-2 text-xs text-rose-300">SOS active · location trail recorded ({(s.trail || []).length} points)</p>}
        {active && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button data-share onClick={doShare} disabled={!!busy} className="btn-ghost btn-sm">{busy === 'share' ? <Spinner className="h-4 w-4" /> : <Share2 className="h-3.5 w-3.5" />}Share trip</button>
            <HoldSOS onFire={doSos} disabled={!!busy || !!s.sos} />
            {ride.status === 'ONGOING' && <button onClick={detour} disabled={!!busy} className="btn-ghost btn-sm col-span-2 text-amber-300">Simulate wrong turn (demo)</button>}
          </div>
        )}
        <button onClick={toggleSilent} className="mt-3 flex items-center gap-2 text-xs text-slate-400 hover:text-white"><EyeOff className="h-3.5 w-3.5" />Silent SOS: {silent ? 'ON (no pop-ups or sounds after SOS)' : 'OFF'}</button>
        <p className="mt-2 text-[11px] text-slate-500">Hold SOS for 1.5 s. Unanswered alerts escalate automatically after 60 s. The driver is never told an SOS was sent. Emergency: 112 · Women helpline: 1091 / 181</p>
      </div>
      <ShareResult share={share} onClose={() => setShare(null)} />
      <Modal open={sosOpen} onClose={() => setSosOpen(false)} title="SOS activated">
        <ul className="space-y-2 text-sm text-slate-300">
          <li>✓ RYDORA safety team alerted with your live location</li>
          <li>✓ Live trip link sent to your trusted contacts</li>
          <li>✓ Driver suspended from new ride requests pending review</li>
        </ul>
        <p className="mt-4 text-sm font-semibold text-white">If you are in immediate danger, call now:</p>
        <div className="mt-2 grid gap-2">{HELPLINES.map((h) => <a key={h.number} href={`tel:${h.number}`} className="btn bg-rose-600 text-white hover:bg-rose-500"><Phone className="h-4 w-4" />{h.number} · {h.name}</a>)}</div>
        <p className="mt-3 text-xs text-slate-500">Phone links open your phone app where available. SMS and calls are simulated in this demo.</p>
      </Modal>
    </>
  );
}

/** Eco summary card for the passenger dashboard. */
export function EcoCard() {
  const { user } = useAuth();
  const e = user?.eco || {};
  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between">
        <div>
          <p className="flex items-center gap-2 text-base font-semibold text-white"><Leaf className="h-5 w-5 text-emerald-400" />Green rides</p>
          <p className="mt-1 text-xs text-slate-400">Choose an EV when booking. Every EV trip earns 10% off your next ride.</p>
        </div>
        {e.coupons > 0 && <span className="chip bg-emerald-500/15 text-emerald-300">{e.coupons} bonus ready</span>}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-white/[.03] p-3"><p className="font-display text-xl font-bold text-white">{e.ecoRides || 0}</p><p className="text-[10px] text-slate-500">EV rides</p></div>
        <div className="rounded-xl bg-white/[.03] p-3"><p className="font-display text-xl font-bold text-emerald-300">{(e.co2SavedKg || 0).toFixed(1)} kg</p><p className="text-[10px] text-slate-500">CO₂ avoided</p></div>
        <div className="rounded-xl bg-white/[.03] p-3"><p className="font-display text-xl font-bold text-white">{e.credits || 0}</p><p className="text-[10px] text-slate-500">Green credits</p></div>
      </div>
    </div>
  );
}
