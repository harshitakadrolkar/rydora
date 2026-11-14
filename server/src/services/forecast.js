import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { ROOT_DIR, config } from '../config/env.js';
import { ZONES } from '../utils/geo.js';

const FILE = path.join(ROOT_DIR, 'ml', 'output', 'forecast.json');
const SCRIPT = path.join(ROOT_DIR, 'ml', 'train_demand_model.py');
let cache = null;

/** Fallback if the Python model output is missing: hour profiles x zone base demand. */
function fallbackForecast() {
  const profile = [.3,.2,.1,.1,.2,.4,.8,1.4,1.9,1.6,1.1,1,1,1,.9,1,1.3,1.8,2,1.6,1.2,.9,.6,.4];
  const f = {}; const heat = {};
  for (const z of ZONES) { f[z.id] = profile.map((p) => +(p * z.baseDemand).toFixed(2)); heat[z.id] = f[z.id]; }
  return {
    simulated: true, model: 'Fallback hourly profile (Python model output not found)', fallback: true,
    metrics: {}, featureImportance: [], testSeries: [], forecastNext24h: f, historyHeatmap: heat,
    positioning: [], zones: ZONES,
  };
}

export function loadForecast() {
  try { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { console.warn('[forecast] ml/output/forecast.json missing - using fallback profile'); cache = fallbackForecast(); }
  return cache;
}
export const getForecast = () => cache || loadForecast();

export function forecastFor(zoneId, hour = new Date().getHours()) {
  const f = getForecast().forecastNext24h[zoneId];
  return f ? f[((hour % 24) + 24) % 24] : 0;
}

export function retrain() {
  return new Promise((resolve) => {
    const started = Date.now();
    let out = ''; let err = '';
    let proc;
    try { proc = spawn(config.pythonBin, [SCRIPT], { cwd: ROOT_DIR }); }
    catch (e) { return resolve({ ok: false, error: e.message }); }
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('error', (e) => resolve({ ok: false, error: `Python not available (${e.message}). Using last trained model output.` }));
    proc.on('close', (code) => {
      if (code !== 0) return resolve({ ok: false, error: err.slice(-600) || `exit code ${code}` });
      loadForecast();
      resolve({ ok: true, seconds: (Date.now() - started) / 1000, output: out.trim() });
    });
  });
}
