import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from './api';
import { useSocketEvent } from '../context/AuthContext';

/** Live fleet positions pushed every 2 seconds by the simulation engine. */
export function useFleet() {
  const [fleet, setFleet] = useState([]);
  useSocketEvent('fleet:update', setFleet);
  return fleet;
}

/** GET helper with loading/error state and reload(). Optional polling interval. */
export function useApi(url, { interval = 0, deps = [] } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (!url) { setLoading(false); return; }
    try { const { data: d } = await api.get(url); if (alive.current) { setData(d); setError(null); } }
    catch (e) { if (alive.current) setError(e?.response?.data?.error || e.message); }
    finally { if (alive.current) setLoading(false); }
  }, [url]);
  useEffect(() => {
    alive.current = true; load();
    const t = interval ? setInterval(load, interval) : null;
    return () => { alive.current = false; if (t) clearInterval(t); };
  }, [load, interval, ...deps]);
  return { data, error, loading, reload: load, setData };
}

/** Live traffic incidents (heavy traffic / waterlogging) from the routing engine. */
export function useTraffic() {
  const [incidents, setIncidents] = useState([]);
  useEffect(() => { api.get('/rides/meta/traffic').then(({ data }) => setIncidents(data.incidents)).catch(() => {}); }, []);
  useSocketEvent('traffic:update', setIncidents);
  return incidents;
}
