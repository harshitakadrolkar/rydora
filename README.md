# RYDORA — Intelligent Ride Matching and Dynamic Driver Allocation System

RYDORA is a full-stack ride-hailing platform. It matches passengers to drivers with an explainable,
multi-factor scoring engine instead of "nearest driver wins". It also forecasts demand with machine
learning, prices zones dynamically, pools passengers, measures driver fairness, and reassigns rides
automatically when something goes wrong.

> **All drivers, passengers, rides and demand history in this project are SIMULATED.**
> They are generated on first start and labelled as simulated throughout the UI. No paid APIs are used.

---

## 1. Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, Tailwind CSS, React Router, Recharts, Leaflet + OpenStreetMap (CARTO dark tiles), lucide icons |
| Realtime | Socket.IO (fleet positions, ride status, driver offers, notifications, admin event stream) |
| Backend | Node.js + Express, JWT authentication (bcrypt passwords) |
| Database | MongoDB with Mongoose (automatic local-datastore fallback, see §4) |
| ML | Python + scikit-learn `GradientBoostingRegressor`, numpy, pandas |

---

## 2. Quick start

**Requirements:** Node.js 18+ (tested on 22), npm. Optional: Python 3.9+ and MongoDB.

```bash
cd rydora
npm run install:all          # installs root, server and client dependencies
npm run install:ml           # optional: pip install numpy pandas scikit-learn
cp server/.env.example server/.env   # already present; edit if needed
npm run dev                  # starts API (http://localhost:5000) + web (http://localhost:5173)
```

Open **http://localhost:5173**.

### Demo accounts (one-click "Use demo account" on every login page)

| Role | Email | Password |
|---|---|---|
| Passenger | passenger@rydora.com | password123 |
| Driver | driver@rydora.com | password123 |
| Admin | admin@rydora.com | admin123 |

You can also register new passengers and drivers from the UI.

### Other commands

```bash
npm run build     # production build of the React app (client/dist)
npm start         # API only; if client/dist exists it is served on http://localhost:5000 too (single port)
npm test          # unit tests: geo, matching engine, pooling, pricing, fairness simulation
npm run train     # re-train the demand model (writes ml/output/forecast.json)
npm run seed      # reset + re-seed the database (stop the server first)
```

Windows note: if `python` is not on PATH, set `PYTHON_BIN=py` (or the full path) in `server/.env`.

---

## 3. Pages

| # | Page | Route |
|---|---|---|
| 1 | Landing page | `/` |
| 2 | Passenger login | `/login/passenger` |
| 3 | Driver login | `/login/driver` |
| 4 | Passenger registration | `/register/passenger` |
| 5 | Driver registration | `/register/driver` |
| 6 | Passenger dashboard | `/passenger` |
| 7 | Driver dashboard | `/driver` (+ `/driver/history` earnings) |
| 8 | Admin dashboard | `/admin` (+ `/admin/rides`, `/admin/drivers`, `/admin/passengers`) |
| 9 | Book a ride | `/passenger/book` |
| 10 | Live ride tracking | `/passenger/track/:id` |
| 11 | Ride history | `/passenger/history` |
| 12 | Demand forecasting | `/analytics/forecast` |
| 13 | Zone intelligence | `/analytics/zones` |
| 14 | Ride pooling | `/analytics/pooling` |
| 15 | Driver allocation analytics | `/analytics/allocation` |
| — | Admin login | `/login/admin` |

---

## 4. Database and fallbacks (the demo always runs)

`server/src/config/db.js` connects in this order:

1. **MongoDB** at `MONGO_URI` (local `mongod` or MongoDB Atlas) through Mongoose.
2. If `USE_MEMORY_DB=true` and you have installed `mongodb-memory-server` yourself, it uses an embedded MongoDB.
3. Otherwise it uses a **built-in local datastore** (`server/src/config/localStore.js`). This is a
   Mongoose-compatible adapter that reuses the same Mongoose schemas for defaults and validation, and
   saves to `server/data/rydora-db.json`. No setup is needed, so the demo works on any laptop.

The admin dashboard shows the active mode (`DB: mongodb` or `DB: local-fallback`).

Other fallbacks:
- **Maps:** CARTO dark tiles, switching automatically to standard OpenStreetMap tiles if CARTO fails.
  Markers, routes and zones still render even with no tiles.
- **ML:** the trained output `ml/output/forecast.json` is committed, so Python is only needed to *retrain*.
  If the file is missing, the server falls back to an hourly demand profile.
- **Routing/geocoding:** no paid APIs. Road distance = Haversine × 1.3, and ETA uses a time-of-day
  traffic model. Locations come from 30 named Bengaluru landmarks, or you can click anywhere on the map.

---

## 5. Core algorithms

### 5.1 Matching engine (`server/src/services/matching.js`)

For every eligible driver (online, free, no pending offer, not stalled, right vehicle category,
within 9 km, widened to 20 km if nobody is in range):

| Factor | Normalised feature (0..1) | Weight |
|---|---|---|
| Distance | `1 − roadKm / radius` (Haversine × 1.3) | 0.25 |
| Pickup ETA | `1 − eta / 30 min` (traffic-aware speed by hour) | 0.20 |
| Workload | `1 − tripsToday / maxTripsToday` | 0.15 |
| Acceptance history | `(accepted + prior·10) / (offered + 10)` (Bayesian) | 0.20 |
| Idle time | `min(1, idleMinutes / 60)` | 0.15 |
| Rating | `(rating − 3.5) / 1.5` | 0.05 |

`score = 100 · Σ weight × feature`. Drivers are ranked by score. The top driver receives the offer.
Every decision stores the full ranking, a per-factor breakdown, the nearest-driver baseline, and a
plain-language explanation (for example, "the nearest driver X was not chosen due to lower acceptance
(61%) and higher workload (9 trips today)"). This is shown on the booking, tracking, driver-offer and
analytics screens. If no driver in the requested category is nearby, the passenger gets a free upgrade.

### 5.2 Ride lifecycle and automatic reassignment (`server/src/services/dispatcher.js`)

`REQUESTED → ACCEPTED → ARRIVING → ONGOING → COMPLETED` (+ `CANCELLED`).

| Event | Detection | Action |
|---|---|---|
| Driver rejects | Reject button / simulated behaviour | Exclude driver, record reason, notify passenger, offer to the next best driver |
| Response timeout | Offer timer (`OFFER_TIMEOUT_SEC`, default 15 s) | Same as rejection (`RESPONSE_TIMEOUT`) |
| Driver cancels | Driver cancels an ACCEPTED/ARRIVING ride | Ride returns to REQUESTED and is re-matched (`DRIVER_CANCELLED`) |
| Delayed arrival | Monitor every 3 s: no progress for 15 s, not started within 60 s, or 2.5× over ETA | Re-matched automatically (`DELAYED_ARRIVAL`) |
| Passenger cancels | Cancel button (₹30 fee after 3 simulated minutes) | Driver released, pool co-riders updated |
| No drivers | Empty ranking | Retries every 5 s, cancels after 10 attempts |

Demo triggers: the booking page has a **scenario** selector ("first driver rejects" / "first driver
times out"), and the tracking page has **Simulate driver delay**.

### 5.3 Predictive demand forecasting (`ml/train_demand_model.py`)

- Simulates 60 days × 24 hours × 10 zones of hourly demand: zone-type hour profiles (business, tech,
  nightlife, residential, transit), weekend effects, Friday nights, rain, events, trend, and Poisson noise.
- Features: zone, zone type, hour (plus sin/cos), day of week, weekend, rain, temperature, event, 24-hour lag,
  168-hour lag, 24-hour rolling mean.
- `GradientBoostingRegressor(n_estimators=300, max_depth=4, learning_rate=0.05)`, trained on 53 days and
  tested on the last 7 days.
- Current result: **MAE 2.69, R² 0.82, 23% better than the "same hour last week" baseline.**
- Outputs: predicted-vs-actual series, next-24-hour forecast per zone, and feature importance.
  Admins can retrain from the UI.
- **Predicted vs actual heatmap:** zone × hour heatmap for any held-out test day, with Actual, Predicted
  and Error (predicted − actual) modes on the same colour scale.
- **Proactive dispatch:** for any target hour, idle drivers are distributed across zones in proportion
  to the forecast demand (largest-remainder allocation, nearest drivers moved first). The admin clicks
  **Pre-position drivers now** on the Demand Forecast page and the cars drive to the hotspots before
  the demand arrives (`GET /api/analytics/preposition`, `POST /api/admin/preposition/apply`).

### 5.4 Zone intelligence (`server/src/services/zones.js`)

For each zone: `driversNeeded = forecastNow·scale/4 + openRequests + 0.25·requestsLast15min`, and
`pressure = driversNeeded / availableDrivers`. Then `surge = min(cap, 1 + (pressure − 1)·sensitivity)`.
Zones are classified as shortage / tight / balanced / surplus.
**Predictive:** the same calculation runs on the ML forecast for the next hour (next-hour pressure,
predicted surge, demand trend), and zones get a **"shortage expected"** label before the shortage
happens. The greedy repositioning plan fills `max(current gap, predicted gap)` for each zone, moving idle
drivers from surplus zones to the nearest zones that are short now or predicted to be short. Each
move is tagged **now** or **predicted**. Admins can apply the plan with one click,
and the simulated drivers drive there. Drivers get a personal "go to zone X" suggestion with a
Navigate button.

### 5.5 Ride pooling (`server/src/services/pooling.js`)

- Compatibility: pickups within 3 km, travel direction within 45°, detour ≤ 1.45× the solo distance,
  at most 12 extra minutes, at most 3 riders, and the group must save at least 8% of distance.
- Sequence optimisation: exhaustive search over all stop orders that respect "pickup before drop"
  (at most 6 stops, so at most 720 permutations), minimising total distance.
- Live dispatcher: a new pool request is inserted into an existing pooled trip if the optimal
  re-sequenced route adds less distance than a separate car. All riders' fares drop to the pooled rate
  (30% off), and they are notified.
- Analytics page: batch grouping of simulated or live requests, with per-passenger solo vs pooled
  distance, time, fare and savings, plus km and CO₂ saved.

### 5.6 Driver fairness (`server/src/services/allocationSim.js`)

A seeded Monte-Carlo simulation runs the same 12-hour day (same requests, same driver behaviour) under
**nearest-driver** and **RYDORA weighted** allocation. It compares average and P90 wait, rejections,
reassignments, utilisation, trip and earnings Gini, and Jain's fairness index. With the default seed,
RYDORA gives about 5% lower average wait and about 28% lower trip Gini (fairer), with slightly more
rejections. Results vary by seed and are reported honestly. Live analytics show the share of decisions
that differ from nearest-driver, average factor contributions, reassignment reasons, and a driver
fairness board.

---

## 6. Project structure

```
rydora/
├── shared/zones.json              # 10 Bengaluru zones (shared by Node + Python)
├── ml/
│   ├── train_demand_model.py      # data simulation + GradientBoosting training + forecast export
│   ├── requirements.txt
│   └── output/forecast.json       # trained model output consumed by the API
├── server/
│   ├── .env.example
│   ├── src/
│   │   ├── index.js               # Express + Socket.IO bootstrap
│   │   ├── socket.js              # authenticated rooms: user, driver, ride, admins, fleet
│   │   ├── seed.js
│   │   ├── config/                # env, db (Mongo + fallback), localStore adapter
│   │   ├── models/                # User, Driver, Ride, Notification (Mongoose schemas)
│   │   ├── middleware/auth.js     # JWT + role guard
│   │   ├── routes/                # auth, rides, drivers, admin, analytics, notifications
│   │   ├── services/
│   │   │   ├── matching.js        # weighted scoring + explanations
│   │   │   ├── dispatcher.js      # lifecycle, offers, timeouts, reassignment, live pooling
│   │   │   ├── pooling.js         # compatibility + sequence optimisation + grouping
│   │   │   ├── zones.js           # supply/demand, surge, repositioning
│   │   │   ├── forecast.js        # loads ML output, triggers Python retraining
│   │   │   ├── allocationSim.js   # nearest vs intelligent fairness experiment
│   │   │   ├── simulator.js       # vehicle movement + simulated passenger demand
│   │   │   ├── pricing.js, notify.js, state.js
│   │   ├── data/                  # seed data generator, landmarks
│   │   └── utils/                 # geo (haversine, zones, ETA), validation
│   └── test/engine.test.js
└── client/
    └── src/
        ├── App.jsx                # routes + role guards
        ├── context/               # auth + socket, toasts
        ├── components/            # Layout/sidebar, MapKit (Leaflet), RideBits, UI kit
        └── pages/                 # auth, passenger, driver, admin, analytics
```

---

## 7. Main API endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register/passenger` · `/api/auth/register/driver` · `/api/auth/login` | JWT auth |
| POST | `/api/rides/estimate` | Distance, ETA, fares, surge, ranked drivers + explanation |
| POST | `/api/rides` | Book (solo/pool, category, demo scenario) |
| GET | `/api/rides/:id`, `/api/rides/active`, `/api/rides/mine` | Tracking & history |
| POST | `/api/rides/:id/cancel` · `/simulate-delay` · `/rate` | Passenger actions |
| GET/POST | `/api/drivers/me`, `/me/status`, `/offers/:id/respond`, `/rides/:id/{start,pickup,complete,cancel}`, `/me/reposition`, `/me/test-ride`, `/me/earnings` | Driver console |
| GET/POST | `/api/admin/overview`, `/drivers`, `/passengers`, `/rides/active`, `/rides/:id/reassign`, `/settings`, `/simulate/rides`, `/reposition/apply` | Operations |
| GET/POST | `/api/analytics/forecast`, `/forecast/retrain`, `/zones`, `/allocation/compare`, `/allocation/live`, `/pooling/analyze`, `/pooling/stats` | Intelligence modules |

Socket events: `fleet:update`, `zones:update`, `ride:update`, `ride:location`, `ride:offer`,
`ride:offer:cancelled`, `ride:removed`, `driver:state`, `notification`, `admin:event`.

---

## 8. Configuration (`server/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 5000 | API port |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/rydora` | MongoDB connection (falls back automatically) |
| `JWT_SECRET` | — | Change for any shared deployment |
| `SIM_SPEED` | 15 | Simulated-time multiplier for vehicle movement |
| `SIM_RIDE_INTERVAL_MS` | 12000 | Simulated passenger request frequency (0 = off) |
| `OFFER_TIMEOUT_SEC` | 15 | Driver response timeout before automatic reassignment |
| `PYTHON_BIN` | `python3` | Python used for retraining |

Surge cap, surge sensitivity, offer timeout, simulation speed and simulated demand can also be changed
live from the admin dashboard.

---

## 9. Known limitations (by design for a demo)

- Live ride state (in-flight rides, offers) is held in memory for real-time performance and persisted to
  the database on every change. Rides in progress when the server restarts are closed as
  "Server restarted".
- Routes are straight-line with a road-distance factor (no paid routing API).
- The daily trip counters on drivers do not reset at midnight.

---

## 10. New features: eco rides, women safety, voice assistant

### 11.1 EV eco rides and green bonus
- **Book a Ride → Ride preferences → "EV only (eco ride)"** offers the request only to electric vehicles
  (9 simulated EVs, outlined green on maps). It shows how many EVs are nearby and the CO₂ the trip avoids.
- Completing an EV ride records **CO₂ avoided** (distance × 0.12 kg/km, the tailpipe emissions of an average
  petrol car) and earns a **green bonus: 10% off the next ride, up to ₹50**, plus 10 green credits.
- When booking, the rider can tick **"Use green bonus"**. The bonus is refunded if the ride is cancelled.
- If no EV is free nearby, the best regular vehicle is assigned and the rider is told no bonus applies.
- Passenger dashboard: **Green rides** card. Admin dashboard: EV rides and CO₂ avoided today.

### 11.2 Women safety
- **"Woman driver"** preference: only women drivers (7 simulated) are offered the ride. The system waits for
  one rather than assigning anyone else, and pooling is disabled for these rides.
- **Safety monitoring** is automatically on for woman-driver rides and late-night rides (9 pm to 6 am, or the
  "Late-night ride" demo scenario), and can be switched on for any ride.
- While monitoring, RYDORA raises an alert when the vehicle:
  - leaves the direct route by more than 0.6 km, or moves 0.5 km further from the destination than before
    (**route deviation**)
  - stops unexpectedly mid-trip (**unexpected stop**)
- The alert offers **I'm safe**, **Share trip with family** and **SOS: I feel unsafe**.
- **Trusted contacts** (up to 3) are managed on the passenger dashboard. Sharing creates a public live-tracking
  page (`/share/<token>`, no login) plus WhatsApp links for each contact. SMS is simulated.
- **SOS** (recommended escalation, all automatic):
  1. alerts the RYDORA safety team with the live location (**Admin → Safety Centre**)
  2. sends the live trip link to every trusted contact
  3. suspends the driver from new requests until an admin reviews and reinstates them
  4. shows the helplines **112** (emergency), **1091** (women police) and **181** (women helpline)
- Admin **Safety Centre**: monitored rides, live map, case log, "Notify police (112)", "Mark resolved",
  and reinstating suspended drivers.
- Demo: book a woman-driver or late-night ride, wait until the trip starts, then click
  **"Simulate wrong turn (demo)"** on the tracking page. An alert appears within about 15 seconds.

**Further safety ideas (not built, for the presentation):** in-ride audio recording with consent, driver
selfie verification before each shift, a PIN shown to the rider and entered by the driver at pickup, safe
drop-off point suggestions, and integration with state police apps (e.g. KSP / Suraksha).

### 11.3 Voice assistant
- The **microphone button in the top bar** uses the browser's built-in Web Speech API (Chrome or Edge),
  so there's no API key or cost. Replies are spoken aloud. A **typed command box** works in any browser
  or a noisy hall.
- Passenger: "Book an EV ride from Forum Mall to MG Road", "Book a ride with a woman driver to Indiranagar
  Metro", "confirm", "Where is my driver?", "Share my trip", "SOS", "Cancel my ride", "Show my green bonus".
- Driver: "Go online", "Request a test ride", "Accept the ride", "Start pickup", "Start trip",
  "Complete ride", "What are today's earnings?"
- Admin: "Open safety centre", "Generate 5 rides", "Pre-position drivers", "Apply repositioning plan".
- Say "help" to hear the options. Allow microphone access when Chrome asks.

---

## 11. Round-3 features: auto-rebook, passengers, child seat, traffic rerouting, stronger SOS

### 12.1 Automatic rebooking
If a ride is cancelled by the **system** (no driver found, or the driver can't reach you in time) and not by the
rider or the operations team, RYDORA **books a new ride automatically**. It keeps the same pickup, destination,
passengers, child-seat / woman-driver / EV preferences and green bonus, and uses **priority matching** (any
suitable car, free upgrade). The rider is notified and the tracking page jumps to the new ride. It retries at most
2 times. "Auto-rebook" is a checkbox on the booking page (on by default).
Demo: tracking page → **Simulate cancellation**.

### 12.2 Number of passengers
A 1–6 passenger selector. Only cars with enough seats are offered (5–6 passengers → XL). Pooling is limited to
1–2 riders, and a pooled car never exceeds its seats.

### 12.3 Baby / toddler: child car seat
The "Baby / toddler" option offers the ride only to cars with a **child car seat** (10 simulated cars, and drivers
can declare one at registration). Pooling is disabled for these rides. If none is free, RYDORA keeps searching
rather than sending a car without a seat.

### 12.4 Heavy traffic: automatic rerouting
- Vehicles drive on a simulated **road network** (a junction every ~1 km across Bengaluru).
- Routes are found with **A\* (A-star) fastest-path search**, using travel times that account for live traffic.
- **Traffic incidents** (heavy traffic, waterlogging, accident, road work) slow cars down inside their area.
  They appear randomly at real hotspots (Silk Board, Hebbal, KR Puram, Marathahalli…), and admins can report
  them in **Admin → Traffic control**.
- Whenever traffic changes, every car whose remaining route crosses a jam is checked. If a different road is at
  least 8% (and 1 min) faster, the car is **rerouted** at once.
- The rider sees "Rerouted to avoid heavy traffic near Silk Board: old route X km / Y min → new route … saves Z
  min", the **old route as a red dashed line** and the **new route in blue**.
- If no faster road exists, the rider is told the new ETA instead.
- Safety monitoring compares the car against the **planned road route**, so a legitimate reroute is never mistaken
  for a wrong turn.
- Demo: tracking page → **Simulate heavy traffic** (needs at least 2 km of road left).

### 12.5 Stronger SOS ("extremely safe")
| Protection | What it does |
|---|---|
| **Ride PIN** | A 4-digit PIN is shown only to the rider, never sent to the driver's app. The trip can't start until the driver enters it, so nobody gets into the wrong car. 3 wrong attempts alert the rider and the safety team. |
| **Automatic escalation** | A route-deviation or unexpected-stop alert that isn't answered within **60 s** becomes an SOS automatically, in case the rider can't reach the phone. |
| **Hold-to-SOS** | Press and hold for 1.5 s (mouse, touch or keyboard), which prevents accidental SOS. Voice "SOS" also works. |
| **Silent SOS** | No pop-ups or sounds after SOS, so nobody nearby can see that help was called. |
| **Driver is not told** | The driver gets no SOS notification. They're suspended from new rides in the background. |
| **Location trail** | The vehicle's path is recorded during monitored rides and SOS, and shown in the Safety Centre and on the family page. |
| **Safe share links** | Unguessable link that the rider can **stop sharing** at any time and that **expires 2 h after the trip**. It shows only first name, driver, plate and location. |
| **Escalation** | Safety team alert with live location, live link to trusted contacts, driver suspension, and helplines 112 / 1091 / 181. |
