// RYDORA voice assistant: browser Web Speech API (no API key), with a typed fallback.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mic, MicOff, X, Send, Volume2, VolumeX } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

const SUGGEST = {
  passenger: ['Book an EV ride from Forum Mall to MG Road', 'Book a ride with a woman driver to Indiranagar Metro', 'Where is my driver?', 'Share my trip', 'SOS', 'Show my green bonus', 'Open ride history'],
  driver: ['Go online', 'Request a test ride', 'Accept the ride', 'Start pickup', 'Start trip', 'Complete ride', "What are today's earnings?"],
  admin: ['Open safety centre', 'Generate 5 rides', 'Pre-position drivers', 'Apply repositioning plan', 'Open demand forecast', 'Open driver allocation'],
};

const NAV = [
  [/dashboard|home/, { passenger: '/passenger', driver: '/driver', admin: '/admin' }],
  [/histor|past rides|my rides/, { passenger: '/passenger/history', driver: '/driver/history' }],
  [/earning/, { driver: '/driver/history' }],
  [/pool/, { passenger: '/analytics/pooling', admin: '/analytics/pooling' }],
  [/zone/, { driver: '/analytics/zones', admin: '/analytics/zones' }],
  [/forecast|demand/, { driver: '/analytics/forecast', admin: '/analytics/forecast' }],
  [/allocation|fairness/, { admin: '/analytics/allocation' }],
  [/safety|sos cases/, { admin: '/admin/safety' }],
  [/active rides|ride monitor/, { admin: '/admin/rides' }],
  [/drivers/, { admin: '/admin/drivers' }],
  [/passengers/, { admin: '/admin/passengers' }],
  [/book/, { passenger: '/passenger/book' }],
  [/track/, { passenger: '/passenger/track' }],
];

function findPlace(text, places) {
  const t = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();
  if (!t) return null;
  const words = t.split(/\s+/).filter((w) => w.length > 2 && !['the', 'road', 'near', 'station'].includes(w));
  let best = null; let bestScore = 0;
  for (const p of places) {
    const n = p.name.toLowerCase();
    let score = n.includes(t) ? 10 : 0;
    for (const w of words) if (n.includes(w)) score += w.length > 4 ? 2 : 1;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore > 0 ? { lat: best.lat, lng: best.lng, address: best.name } : null;
}

export default function VoiceAssistant() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [typed, setTyped] = useState('');
  const [muted, setMuted] = useState(false);
  const places = useRef([]);
  const rec = useRef(null);
  const role = user?.role;

  useEffect(() => { api.get('/rides/places').then(({ data }) => { places.current = data.places; }).catch(() => {}); }, []);

  const say = (text) => {
    setReply(text);
    if (muted || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = window.speechSynthesis.getVoices().find((x) => x.lang === 'en-IN') || window.speechSynthesis.getVoices().find((x) => x.lang?.startsWith('en'));
      if (v) u.voice = v;
      u.rate = 1.02;
      window.speechSynthesis.speak(u);
    } catch { /* speech not available */ }
  };
  const fire = (action, delay = 0) => setTimeout(() => window.dispatchEvent(new CustomEvent('rydora:voice', { detail: { action } })), delay);
  const activeRide = async () => (await api.get('/rides/active')).data.ride;

  async function handle(raw) {
    const t = raw.toLowerCase().trim();
    setHeard(raw);
    if (!t) return;
    try {
      if (/^(help|what can (i|you) (say|do)|commands)/.test(t)) return say(`You can say: ${SUGGEST[role].slice(0, 4).join('; ')}.`);
      if (/log ?out|sign out/.test(t)) { say('Logging you out. Goodbye!'); logout(); return navigate('/'); }

      if (role === 'passenger') {
        if (/\b(sos|help me|emergency|unsafe|danger|save me)\b/.test(t)) {
          const r = await activeRide();
          if (!r) return say('You have no active ride. If you are in danger, call 112 now.');
          await api.post(`/rides/${r._id}/sos`, { reason: `Voice SOS: "${raw}"` });
          navigate(`/passenger/track/${r._id}`);
          return say('SOS sent. The RYDORA safety team and your trusted contacts have your live location. Call 112 if you are in immediate danger.');
        }
        if (/\bshare\b/.test(t)) {
          const r = await activeRide();
          if (!r) return say('You have no active ride to share.');
          const { data } = await api.post(`/rides/${r._id}/share`);
          return say(data.sentTo.length ? `Trip shared with ${data.sentTo.map((c) => c.name).join(' and ')}.` : 'Trip link created. Add trusted contacts on your dashboard so I can send it to them.');
        }
        if (/\bcancel\b/.test(t)) {
          const r = await activeRide();
          if (!r) return say('You have no active ride to cancel.');
          navigate(`/passenger/track/${r._id}`); fire('cancel', 900);
          return say('Opening cancellation. Choose a reason to confirm.');
        }
        if (/where|track|status|eta|how long|my driver/.test(t)) {
          const r = await activeRide();
          if (!r) return say('You have no active ride right now. Say book a ride to start one.');
          navigate(`/passenger/track/${r._id}`);
          const msg = {
            REQUESTED: 'I am still finding the best driver for you.',
            ACCEPTED: `${r.driverName} has accepted and will arrive in about ${Math.round(r.etaPickupMin || 5)} minutes.`,
            ARRIVING: r.driverArrived ? `${r.driverName} has arrived at your pickup point.` : `${r.driverName} is on the way, about ${Math.round(r.etaPickupMin || 5)} minutes away.`,
            ONGOING: `You are on your way to ${r.drop.address}.`,
          }[r.status];
          return say(`${msg} Vehicle ${r.vehicle?.model || ''} ${r.vehicle?.plate || ''}.`);
        }
        if (/green|bonus|co2|carbon|eco credit/.test(t)) {
          const { data } = await api.get('/auth/me'); const e = data.user.eco;
          return say(`You have taken ${e.ecoRides} EV rides, avoided ${e.co2SavedKg} kilograms of CO2, and have ${e.coupons} green bonus${e.coupons === 1 ? '' : 'es'} ready to use.`);
        }
        if (/^(confirm|yes|book it|go ahead|request (it|the ride))/.test(t)) {
          if (!location.pathname.startsWith('/passenger/book')) return say('Say book a ride from a place to a place first.');
          fire('confirm'); return say('Requesting your ride now.');
        }
        if (/\b(book|get|need|call)\b.*\b(ride|cab|auto|taxi|car|ev)\b|take me|ride (from|to)/.test(t)) {
          const ev = /\b(ev|electric|eco|green)\b/.test(t);
          const women = /\b(woman|women|female|lady|ladies)\b/.test(t);
          const pool = /\b(pool|share|shared)\b/.test(t);
          const fm = t.match(/from (.+?)(?: to | with |$)/); const tm = t.match(/\bto (.+?)(?: from | with |$)/);
          const pickup = fm ? findPlace(fm[1], places.current) : null;
          const drop = tm ? findPlace(tm[1], places.current) : null;
          navigate('/passenger/book', { state: { voice: { pickup, drop, ev, women, pool, ts: Date.now() } } });
          const kind = `${ev ? 'an EV ' : 'a '}${pool ? 'pool ' : ''}ride${women ? ' with a woman driver' : ''}`;
          if (pickup && drop) return say(`Setting up ${kind} from ${pickup.address} to ${drop.address}. Check the fare, then say confirm to book.`);
          if (drop) return say(`Setting up ${kind} to ${drop.address}. Please choose your pickup point, then say confirm.`);
          return say(`Opening booking for ${kind}. Say something like: from Forum Mall to MG Road.`);
        }
      }

      if (role === 'driver') {
        if (/go online|start (working|shift|duty)|online/.test(t) && !/offline/.test(t)) { await api.post('/drivers/me/status', { online: true }); navigate('/driver'); return say('You are online. Waiting for ride requests.'); }
        if (/offline|stop (working|shift|duty)/.test(t)) { await api.post('/drivers/me/status', { online: false }); return say('You are now offline.'); }
        if (/test ride|demo ride/.test(t)) { await api.post('/drivers/me/test-ride'); navigate('/driver'); return say('A test request is on its way. Say accept the ride.'); }
        const me = (await api.get('/drivers/me')).data;
        if (/\b(accept|take it|yes)\b/.test(t)) {
          if (!me.offer) return say('There is no ride request waiting right now.');
          await api.post(`/drivers/offers/${me.offer.ride._id}/respond`, { accept: true });
          return say(`Accepted. Pick up ${me.offer.ride.passengerName} at ${me.offer.ride.pickup.address}. Say start pickup when you leave.`);
        }
        if (/\b(reject|decline|no)\b/.test(t)) {
          if (!me.offer) return say('There is no ride request waiting right now.');
          await api.post(`/drivers/offers/${me.offer.ride._id}/respond`, { accept: false });
          return say('Rejected. The ride goes to the next best driver.');
        }
        if (/earning/.test(t)) return say(`Today you have completed ${me.driver.stats.todayTrips} trips and earned ${Math.round(me.driver.stats.todayEarnings)} rupees.`);
        const r = me.rides?.[0];
        if (/start pickup|leave|head(ing)? to pickup/.test(t)) {
          const x = me.rides?.find((y) => y.status === 'ACCEPTED');
          if (!x) return say('No accepted ride is waiting to start.');
          await api.post(`/drivers/rides/${x._id}/start`); return say('Heading to the pickup point.');
        }
        if (/start (the )?trip|picked up|on board|passenger (is )?in/.test(t)) {
          const x = me.rides?.find((y) => y.status === 'ARRIVING');
          if (!x) return say('You are not at a pickup point yet.');
          if (!x.demoPin) return say('Ask the rider for their 4-digit PIN and enter it on the screen to start the trip.');
          await api.post(`/drivers/rides/${x._id}/pickup`, { pin: x.demoPin }); return say('PIN verified. Trip started. Drive safely.');
        }
        if (/complete|end (the )?(trip|ride)|drop(ped)?/.test(t)) {
          const x = me.rides?.find((y) => y.status === 'ONGOING');
          if (!x) return say('There is no trip in progress.');
          await api.post(`/drivers/rides/${x._id}/complete`); return say('Ride completed. Well done!');
        }
        if (r && /status|next/.test(t)) return say(`Your current ride for ${r.passengerName} is ${r.status.toLowerCase()}.`);
      }

      if (role === 'admin') {
        const g = t.match(/generate (\w+)? ?(?:simulated )?(?:ride|request)/);
        if (g) { const n = Math.min(10, Number(g[1]) || NUM[g[1]] || 3); await api.post('/admin/simulate/rides', { count: n }); return say(`Generated ${n} simulated ride requests.`); }
        if (/pre-?position|proactive/.test(t)) { const { data } = await api.post('/admin/preposition/apply', {}); return say(`Proactive dispatch started. ${data.applied} idle drivers are moving to forecast hotspots.`); }
        if (/apply (the )?(plan|repositioning)|reposition/.test(t)) { const { data } = await api.post('/admin/reposition/apply'); return say(`Repositioning applied. ${data.applied} drivers are moving to shortage zones.`); }
      }

      for (const [re, routes] of NAV) {
        if (re.test(t) && routes[role]) { navigate(routes[role]); return say(`Opening ${t.replace(/^(open|show|go to)\s+/, '')}.`); }
      }
      return say("Sorry, I didn't catch that. Say help to hear what I can do.");
    } catch (e) {
      return say(`I could not do that: ${errMsg(e)}`);
    }
  }

  const start = () => {
    setOpen(true);
    if (!Recognition) { say('Voice input is not supported in this browser. Please use Chrome or Edge, or type your command below.'); return; }
    try {
      const r = new Recognition();
      r.lang = 'en-IN'; r.interimResults = true; r.maxAlternatives = 1;
      r.onresult = (e) => {
        const res = e.results[e.results.length - 1];
        setHeard(res[0].transcript);
        if (res.isFinal) handle(res[0].transcript);
      };
      r.onerror = (e) => { setListening(false); if (e.error === 'not-allowed') say('Microphone access is blocked. Allow the microphone for this site, or type your command.'); else if (e.error !== 'no-speech' && e.error !== 'aborted') say('I could not hear that. You can also type the command.'); };
      r.onend = () => setListening(false);
      rec.current = r; r.start(); setListening(true); setReply(''); setHeard('');
    } catch { setListening(false); }
  };
  const stop = () => { rec.current?.stop(); setListening(false); };

  if (!role) return null;
  return (
    <>
      <button onClick={listening ? stop : start} aria-label="Voice assistant" title="Voice assistant"
        className={`relative grid h-10 w-10 place-items-center rounded-xl transition ${listening ? 'bg-rose-500 text-white' : 'bg-auto-400 text-ink-950 hover:bg-auto-300'}`}>
        {listening && <span className="absolute inset-0 animate-pulsering rounded-xl border-2 border-rose-400" />}
        {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
      </button>
      {open && (
        <div className="card fixed right-4 top-[4.5rem] z-[1400] w-[min(360px,calc(100vw-2rem))] animate-fadeup !bg-ink-850 p-4 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-display text-sm font-bold text-white">RYDORA voice assistant</p>
            <div className="flex gap-1">
              <button onClick={() => setMuted(!muted)} className="rounded-lg p-1 text-slate-400 hover:text-white" aria-label={muted ? 'Unmute' : 'Mute'}>{muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
              <button onClick={() => { stop(); setOpen(false); }} className="rounded-lg p-1 text-slate-400 hover:text-white" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <p className="min-h-[1.25rem] text-sm text-slate-300">{listening ? (heard || 'Listening… speak now') : heard ? <>You said: <i>“{heard}”</i></> : 'Tap the mic and speak, or type below.'}</p>
          {reply && <p className="mt-2 rounded-xl bg-auto-400/10 p-3 text-sm text-auto-300">{reply}</p>}
          <form onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { handle(typed); setTyped(''); } }} className="mt-3 flex gap-2">
            <input id="voice-text" className="input !py-2" placeholder="Type a command…" value={typed} onChange={(e) => setTyped(e.target.value)} />
            <button className="btn-ghost btn-sm" aria-label="Send"><Send className="h-4 w-4" /></button>
          </form>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {SUGGEST[role].map((s) => <button key={s} onClick={() => handle(s)} className="chip bg-white/[.06] text-slate-300 hover:bg-white/10">{s}</button>)}
          </div>
        </div>
      )}
    </>
  );
}
