import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('rydora_user')); } catch { return null; } });
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('rydora_token');
    if (user && token) { const s = connectSocket(token); setSocket(s); return () => disconnectSocket(); }
    setSocket(null);
    return undefined;
  }, [user?._id]);

  const saveSession = useCallback((token, u) => {
    localStorage.setItem('rydora_token', token);
    localStorage.setItem('rydora_user', JSON.stringify(u));
    setUser(u);
  }, []);

  const login = useCallback(async (email, password, role) => {
    const { data } = await api.post('/auth/login', { email, password, role });
    saveSession(data.token, data.user);
    return data.user;
  }, [saveSession]);

  const register = useCallback(async (role, body) => {
    const { data } = await api.post(`/auth/register/${role}`, body);
    saveSession(data.token, data.user);
    return data.user;
  }, [saveSession]);

  const refreshUser = useCallback(async () => {
    const { data } = await api.get('/auth/me');
    localStorage.setItem('rydora_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  // Refresh the stored profile once (and drop it if the account no longer exists).
  useEffect(() => {
    if (!localStorage.getItem('rydora_token')) return;
    refreshUser().catch((e) => { if (e?.response?.status === 404) { localStorage.clear(); setUser(null); } });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('rydora_token');
    localStorage.removeItem('rydora_user');
    disconnectSocket();
    setUser(null);
  }, []);

  return <AuthCtx.Provider value={{ user, socket, login, register, logout, refreshUser }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

/** Subscribe to a socket event for the lifetime of the component. */
export function useSocketEvent(event, handler, deps = []) {
  const { socket } = useAuth();
  useEffect(() => {
    if (!socket) return undefined;
    socket.on(event, handler);
    return () => socket.off(event, handler);
  }, [socket, event, ...deps]);
}
