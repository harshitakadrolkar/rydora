import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('rydora_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use((r) => r, (err) => {
  if (err.response?.status === 401 && !err.config.url.includes('/auth/')) {
    localStorage.removeItem('rydora_token');
    localStorage.removeItem('rydora_user');
    if (!location.pathname.startsWith('/login')) location.href = '/';
  }
  return Promise.reject(err);
});

export const errMsg = (e) => e?.response?.data?.error || e?.message || 'Something went wrong';
