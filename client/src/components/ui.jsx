import { Loader2, FlaskConical, X } from 'lucide-react';

export function PageHeader({ title, subtitle, actions, icon: Icon }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-center gap-3">
        {Icon && <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-500/15 text-brand-300"><Icon className="h-5 w-5" /></div>}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  purple: 'from-brand-500/20 text-brand-300', aqua: 'from-aqua-500/20 text-aqua-400', green: 'from-emerald-500/20 text-emerald-400',
  amber: 'from-amber-500/20 text-amber-400', rose: 'from-rose-500/20 text-rose-400', slate: 'from-slate-500/20 text-slate-300',
};
export function StatCard({ label, value, hint, icon: Icon, tone = 'purple' }) {
  return (
    <div className="card card-pad relative overflow-hidden animate-fadeup">
      <div className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${TONES[tone]} to-transparent blur-xl`} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-2 font-display text-2xl font-bold text-white">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        {Icon && <div className={`grid h-10 w-10 place-items-center rounded-xl bg-white/[.04] ${TONES[tone].split(' ')[1]}`}><Icon className="h-5 w-5" /></div>}
      </div>
    </div>
  );
}

const STATUS = {
  REQUESTED: 'bg-amber-500/15 text-amber-300', ACCEPTED: 'bg-sky-500/15 text-sky-300', ARRIVING: 'bg-aqua-500/15 text-aqua-400',
  ONGOING: 'bg-brand-500/20 text-brand-300', COMPLETED: 'bg-emerald-500/15 text-emerald-300', CANCELLED: 'bg-rose-500/15 text-rose-300',
  available: 'bg-emerald-500/15 text-emerald-300', busy: 'bg-brand-500/20 text-brand-300', offline: 'bg-slate-500/15 text-slate-400', offered: 'bg-amber-500/15 text-amber-300',
  shortage: 'bg-rose-500/15 text-rose-300', tight: 'bg-amber-500/15 text-amber-300', balanced: 'bg-sky-500/15 text-sky-300', surplus: 'bg-emerald-500/15 text-emerald-300',
};
export function Badge({ status, children }) {
  return <span className={`chip ${STATUS[status] || 'bg-white/10 text-slate-300'}`}>{children || status}</span>;
}

export function SimBadge({ text = 'Simulated data' }) {
  return <span className="chip border border-amber-400/20 bg-amber-400/10 text-amber-300"><FlaskConical className="h-3 w-3" />{text}</span>;
}

export function Spinner({ className = '' }) {
  return <Loader2 className={`h-5 w-5 animate-spin text-brand-400 ${className}`} />;
}

export function Loading({ text = 'Loading...' }) {
  return <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-400"><Spinner />{text}</div>;
}

export function Empty({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {Icon && <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white/[.04] text-slate-500"><Icon className="h-6 w-6" /></div>}
      <p className="font-semibold text-white">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-400">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1500] grid place-items-center bg-ink-950/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto animate-fadeup`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/[.06] px-5 py-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          {onClose && <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>}
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Bar({ value, max = 100, color = 'bg-brand-500' }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/[.06]">
      <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} />
    </div>
  );
}

export function Section({ title, subtitle, right, children, className = '' }) {
  return (
    <div className={`card card-pad ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-base font-semibold">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-ink-900/60 p-1">
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${value === t.value ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'}`}>{t.label}</button>
      ))}
    </div>
  );
}

export const chartTooltip = {
  contentStyle: { background: '#131a3a', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, fontSize: 12, color: '#e2e8f0' },
  labelStyle: { color: '#a78bfa', fontWeight: 600 },
  itemStyle: { color: '#e2e8f0' },
  cursor: { fill: 'rgba(139,92,246,.08)' },
};
export const axisProps = { stroke: '#475569', tick: { fill: '#94a3b8', fontSize: 11 }, tickLine: false, axisLine: { stroke: '#1c2550' } };
