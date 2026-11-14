import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Car, UserRound, ShieldCheck, Star } from 'lucide-react';
import { Logo } from '../components/Layout';
import { CityRideIllustration } from '../components/Illustrations';
import { useAuth } from '../context/AuthContext';
import { homeFor } from '../App';

// The features as a real sequence: what happens after a rider taps "Book".
const PIPELINE = [
  { title: 'Forecast the rush', text: 'A Gradient Boosting model predicts rides per zone for every hour, so we know Whitefield fills up at 9 am and Koramangala at 10 pm.', where: 'Demand Forecast' },
  { title: 'Move drivers before it happens', text: 'Idle drivers are pre-positioned into zones that are about to run short. Surge only kicks in when supply really runs out.', where: 'Zone Intelligence' },
  { title: 'Pick the right driver, not just the nearest', text: 'Distance, traffic-aware ETA, trips today, acceptance history and idle time are weighed, and the reason is written out for the rider.', where: 'Book a Ride' },
  { title: 'Share the ride when it makes sense', text: 'Riders going the same way are grouped, the pickup and drop order is optimised, and each person sees what they save.', where: 'Ride Pooling' },
  { title: 'Recover when plans change', text: 'A rejection, a 15-second silence, a cancellation or a stalled car sends the ride straight to the next best driver.', where: 'Live Tracking' },
  { title: 'Check it was fair', text: 'Every allocation is compared with nearest-driver matching on waiting time, utilisation and how evenly trips are spread.', where: 'Driver Allocation' },
];

const STOPS = ['Requested', 'Accepted', 'Arriving', 'On trip', 'Completed'];

const ROLES = [
  { role: 'passenger', icon: UserRound, title: 'Ride', text: 'Book, track and pool rides', email: 'passenger@rydora.com', pass: 'password123' },
  { role: 'driver', icon: Car, title: 'Drive', text: 'Accept requests, earn, reposition', email: 'driver@rydora.com', pass: 'password123' },
  { role: 'admin', icon: ShieldCheck, title: 'Operate', text: 'Run the city and the engines', email: 'admin@rydora.com', pass: 'admin123' },
];

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-ink-950">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <a href="#how" className="hidden px-3 text-sm text-slate-300 hover:text-white md:block">How it works</a>
          <a href="#start" className="hidden px-3 text-sm text-slate-300 hover:text-white md:block">Demo accounts</a>
          {user ? <button onClick={() => navigate(homeFor(user.role))} className="btn-auto">Open dashboard <ArrowRight className="h-4 w-4" /></button>
            : <><Link to="/login/passenger" className="btn-ghost">Log in</Link><Link to="/register/passenger" className="btn-auto hidden sm:inline-flex">Get started</Link></>}
        </nav>
      </header>

      {/* HERO */}
      <section className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 pb-10 pt-6 lg:grid-cols-[1fr_1.1fr] lg:pt-10">
        <div className="animate-fadeup">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-auto-400">
            <span className="h-2 w-2 rounded-full bg-auto-400" />Bengaluru · live city simulation
          </p>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight [text-wrap:balance] sm:text-[3.4rem]">
            Matched by <span className="marker">intelligence</span>.<br /> Driven by <span className="text-auto-400">fairness</span>.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-400">
            RYDORA decides which driver gets each ride by weighing distance, traffic, workload, reliability and idle time, and it explains every decision.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/login/passenger" className="btn-auto px-5 py-3 text-base">Book a ride <ArrowRight className="h-4 w-4" /></Link>
            <Link to="/login/driver" className="btn-ghost px-5 py-3 text-base">Drive with RYDORA</Link>
            <Link to="/login/admin" className="px-2 text-sm font-semibold text-slate-400 underline-offset-4 hover:text-white hover:underline">Operations console</Link>
          </div>
        </div>

        <div className="relative animate-fadeup [animation-delay:.1s]">
          <CityRideIllustration className="w-full" fade />
          <div className="absolute left-[3%] top-[30%] hidden w-[min(280px,52%)] sm:block rounded-2xl border border-white/10 bg-ink-900/95 p-3.5 shadow-card">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Matched · RYD-8K2QX</p>
              <span className="chip bg-emerald-500/15 text-emerald-300">Accepted</span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-auto-400 font-bold text-ink-950">R</div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Ravi Kumar <span className="text-xs font-normal text-amber-300"><Star className="mb-0.5 inline h-3 w-3 fill-amber-300" />4.8</span></p>
                <p className="text-xs text-slate-400">1.2 km away · 4 min · score 86.4</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-slate-400">Chosen over the nearest driver (0.9 km), who has 9 trips today and a 61% acceptance rate.</p>
          </div>
        </div>
      </section>

      {/* FACT STRIP */}
      <section className="border-y border-white/[.06] bg-ink-900/60">
        <dl className="mx-auto grid max-w-7xl grid-cols-2 gap-y-5 px-5 py-6 md:grid-cols-4">
          {[['10', 'city zones from MG Road to Electronic City'], ['23', 'simulated drivers with their own acceptance habits'], ['0.82', 'R² of the hourly demand model'], ['₹0', 'spent on paid maps or APIs']].map(([v, l]) => (
            <div key={l} className="pr-4">
              <dt className="font-display text-3xl font-bold tabular-nums text-white">{v}</dt>
              <dd className="mt-1 text-sm text-slate-400">{l}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* PIPELINE */}
      <section id="how" className="mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="lg:sticky lg:top-10 lg:self-start">
          <h2 className="text-3xl font-bold [text-wrap:balance] sm:text-4xl">What happens after a rider taps <span className="text-auto-400">Book</span></h2>
          <p className="mt-4 max-w-md text-slate-400">Six engines run one after another on every request. Each one has its own screen in the demo, named next to each step.</p>
        </div>
        <ol className="space-y-px overflow-hidden rounded-2xl border border-white/[.06]">
          {PIPELINE.map((p, i) => (
            <li key={p.title} className="grid grid-cols-[3rem_1fr] gap-4 bg-ink-900/70 p-5 sm:grid-cols-[3.5rem_1fr_auto]">
              <span className="font-display text-2xl font-bold tabular-nums text-auto-400">{String(i + 1).padStart(2, '0')}</span>
              <div className="min-w-0">
                <h3 className="font-semibold">{p.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">{p.text}</p>
              </div>
              <span className="col-start-2 self-start text-xs font-medium text-brand-300 sm:col-start-auto">{p.where} →</span>
            </li>
          ))}
        </ol>
      </section>

      {/* LIFECYCLE AS A ROAD */}
      <section className="mx-auto max-w-7xl px-5 pb-20">
        <h2 className="text-2xl font-bold">One ride, five stops</h2>
        <div className="relative mt-8">
          <div className="absolute left-0 right-0 top-[15px] border-t-2 border-dashed border-white/15" />
          <ol className="relative grid grid-cols-5 gap-2">
            {STOPS.map((s, i) => (
              <li key={s} className="flex flex-col items-center text-center">
                <span className={`grid h-8 w-8 place-items-center rounded-full border-4 border-ink-950 text-xs font-bold ${i === STOPS.length - 1 ? 'bg-emerald-400 text-ink-950' : 'bg-auto-400 text-ink-950'}`}>{i + 1}</span>
                <span className="mt-2 text-xs font-semibold text-white sm:text-sm">{s}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-slate-400">If the driver rejects, stays silent for 15 seconds, cancels or stops moving, the ride goes back to <b className="text-auto-400">Requested</b> and the next best driver gets it. The rider is told at every step.</p>
      </section>

      {/* DEMO ACCOUNTS */}
      <section id="start" className="border-t border-white/[.06] bg-ink-900/60">
        <div className="mx-auto max-w-7xl px-5 py-16">
          <h2 className="text-2xl font-bold">Try it as anyone</h2>
          <p className="mt-2 text-sm text-slate-400">Each login page has a one-click demo button. Open the three roles in separate windows to watch them interact.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {ROLES.map((r) => (
              <Link key={r.role} to={`/login/${r.role}`} className="group flex items-start gap-4 rounded-2xl border border-white/[.08] p-5 transition hover:border-auto-400/60">
                <r.icon className="mt-1 h-6 w-6 shrink-0 text-auto-400" />
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold text-white">{r.title}</p>
                  <p className="text-sm text-slate-400">{r.text}</p>
                  <p className="mt-3 truncate font-mono text-xs text-slate-500">{r.email} · {r.pass}</p>
                </div>
                <ArrowRight className="ml-auto mt-1 h-4 w-4 shrink-0 text-slate-500 transition group-hover:translate-x-1 group-hover:text-auto-400" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-8 text-center text-xs text-slate-500">
        RYDORA · Intelligent Ride Matching and Dynamic Driver Allocation System · All drivers, passengers and demand in this demo are simulated.
      </footer>
    </div>
  );
}
