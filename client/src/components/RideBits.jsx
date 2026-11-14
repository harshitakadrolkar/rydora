import { Check, Brain, Trophy, MapPin, Navigation } from 'lucide-react';
import { Bar, Badge } from './ui';
import { pct, km, mins, time } from '../lib/format';

const STEPS = ['REQUESTED', 'ACCEPTED', 'ARRIVING', 'ONGOING', 'COMPLETED'];
const LABELS = { REQUESTED: 'Requested', ACCEPTED: 'Accepted', ARRIVING: 'Arriving', ONGOING: 'On trip', COMPLETED: 'Completed' };

export function RideStepper({ status }) {
  const idx = STEPS.indexOf(status);
  const cancelled = status === 'CANCELLED';
  return (
    <div className="flex items-center">
      {STEPS.map((s, i) => {
        const done = !cancelled && i < idx; const active = !cancelled && i === idx;
        return (
          <div key={s} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div className={`relative grid h-8 w-8 place-items-center rounded-full border-2 text-xs font-bold transition ${done ? 'border-emerald-400 bg-emerald-400 text-ink-950' : active ? 'border-brand-400 bg-brand-500 text-white' : 'border-white/10 bg-ink-900 text-slate-500'}`}>
                {active && status !== 'COMPLETED' && <span className="absolute inset-0 animate-pulsering rounded-full border-2 border-brand-400" />}
                {done || (active && status === 'COMPLETED') ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`text-[10px] font-semibold uppercase tracking-wide sm:text-[11px] ${active ? 'text-white' : 'text-slate-500'}`}>{LABELS[s]}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`mx-1 mb-5 h-0.5 flex-1 rounded ${done ? 'bg-emerald-400' : 'bg-white/10'}`} />}
          </div>
        );
      })}
    </div>
  );
}

const FACTOR = { distance: 'Distance', eta: 'Pickup ETA', workload: 'Low workload', acceptance: 'Acceptance', idle: 'Idle time', rating: 'Rating' };
const WEIGHT_MAX = { distance: 25, eta: 20, workload: 15, acceptance: 20, idle: 15, rating: 5 };

export function ScoreBreakdown({ c }) {
  if (!c?.contributions) return null;
  return (
    <div className="space-y-2">
      {Object.entries(c.contributions).map(([k, v]) => (
        <div key={k}>
          <div className="mb-1 flex justify-between text-xs"><span className="text-slate-400">{FACTOR[k]}</span><span className="font-semibold text-white">{v} <span className="text-slate-500">/ {WEIGHT_MAX[k]}</span></span></div>
          <Bar value={v} max={WEIGHT_MAX[k]} color={k === 'acceptance' ? 'bg-aqua-400' : k === 'idle' || k === 'workload' ? 'bg-emerald-400' : 'bg-brand-500'} />
        </div>
      ))}
    </div>
  );
}

/** "Why this driver?" panel - explainable matching. */
export function MatchPanel({ match }) {
  if (!match) return null;
  const { chosen, ranked = [], nearest } = match;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-brand-500/20 bg-brand-500/[.07] p-4">
        <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-brand-200"><Brain className="h-4 w-4" />Why this driver?</p>
        <p className="text-sm leading-relaxed text-slate-300">{match.explanation}</p>
        {match.upgraded && <p className="mt-2 text-xs text-emerald-300">No driver in your category was nearby - you received a free upgrade.</p>}
      </div>
      {chosen?.contributions && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"><Trophy className="h-3.5 w-3.5 text-amber-400" />Score breakdown · {chosen.score}/100</p>
            <ScoreBreakdown c={chosen} />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Ranked candidates ({match.candidates || ranked.length})</p>
            <div className="space-y-1.5">
              {ranked.slice(0, 5).map((r, i) => (
                <div key={r.driverId} className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${r.driverId === chosen.driverId ? 'bg-brand-500/15' : 'bg-white/[.03]'}`}>
                  <span className="flex items-center gap-2"><span className="w-4 font-bold text-slate-500">#{i + 1}</span><span className="font-medium text-white">{r.name}</span>{nearest?.driverId === r.driverId && <Badge status="balanced">nearest</Badge>}</span>
                  <span className="text-slate-400">{km(r.distanceKm)} · {pct(r.acceptanceRate)} · <b className="text-white">{r.score}</b></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Timeline({ items = [] }) {
  return (
    <ol className="relative space-y-3 border-l border-white/10 pl-5">
      {[...items].reverse().map((t, i) => (
        <li key={i} className="relative">
          <span className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-ink-850 ${t.status === 'CANCELLED' ? 'bg-rose-400' : t.note?.includes('reassign') ? 'bg-amber-400' : t.status === 'COMPLETED' ? 'bg-emerald-400' : 'bg-brand-400'}`} />
          <div className="flex flex-wrap items-center gap-2"><Badge status={t.status} /><span className="text-[11px] text-slate-500">{time(t.at)}</span></div>
          <p className="mt-1 text-xs text-slate-300">{t.note}</p>
        </li>
      ))}
    </ol>
  );
}

export function RouteSummary({ ride }) {
  return (
    <div className="space-y-2.5">
      <div className="flex gap-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /><div><p className="text-xs text-slate-500">Pickup · {ride.pickup.zoneName}</p><p className="text-sm text-white">{ride.pickup.address}</p></div></div>
      <div className="flex gap-3"><Navigation className="mt-0.5 h-4 w-4 shrink-0 text-pink-400" /><div><p className="text-xs text-slate-500">Destination · {ride.drop.zoneName}</p><p className="text-sm text-white">{ride.drop.address}</p></div></div>
      <p className="text-xs text-slate-500">{km(ride.distanceKm)} · approx {mins(ride.durationMin)} · {ride.type === 'pool' ? 'Pool' : ride.category}</p>
    </div>
  );
}
