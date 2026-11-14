import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

const ToastCtx = createContext(null);
const ICONS = { success: CheckCircle2, warning: AlertTriangle, danger: XCircle, error: XCircle, info: Info };
const COLORS = { success: 'text-emerald-400', warning: 'text-amber-400', danger: 'text-rose-400', error: 'text-rose-400', info: 'text-aqua-400' };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const remove = (id) => setToasts((t) => t.filter((x) => x.id !== id));
  const toast = useCallback((title, message = '', type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, title, message, type }]);
    setTimeout(() => remove(id), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[2000] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          return (
            <div key={t.id} className="pointer-events-auto card flex animate-fadeup gap-3 p-3.5">
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${COLORS[t.type]}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">{t.title}</p>
                {t.message && <p className="mt-0.5 text-xs text-slate-400">{t.message}</p>}
              </div>
              <button onClick={() => remove(t.id)} className="text-slate-500 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
