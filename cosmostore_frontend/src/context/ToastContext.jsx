import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message, type = "info") => {
      const id = ++idCounter;
      setToasts((t) => [...t, { id, message, type }]);
      setTimeout(() => remove(id), 4200);
    },
    [remove]
  );

  const toast = {
    success: (msg) => push(msg, "success"),
    error: (msg) => push(msg, "error"),
    info: (msg) => push(msg, "info"),
  };

  const icons = {
    success: <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />,
    error: <XCircle size={18} className="text-red-600 shrink-0" />,
    info: <Info size={18} className="text-berry-500 shrink-0" />,
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-start gap-2 bg-white border border-ink/10 shadow-soft rounded-lg px-4 py-3 text-sm animate-[fadeIn_0.25s_ease-out]"
          >
            {icons[t.type]}
            <p className="flex-1 text-ink/90">{t.message}</p>
            <button onClick={() => remove(t.id)} className="text-ink/40 hover:text-ink/70">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
