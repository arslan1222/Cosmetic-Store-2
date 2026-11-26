import { useEffect, useRef, useState } from "react";
import { Bell, ShieldAlert, CheckCircle2, Package, Info } from "lucide-react";
import { authApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { formatDateTime } from "../utils/format";

function iconFor(title = "") {
  const t = title.toLowerCase();
  if (t.includes("review") || t.includes("fraud") || t.includes("security")) {
    return <ShieldAlert size={16} className="text-amber-600" />;
  }
  if (t.includes("confirmed") || t.includes("welcome") || t.includes("approved")) {
    return <CheckCircle2 size={16} className="text-emerald-600" />;
  }
  if (t.includes("order") || t.includes("shipped") || t.includes("delivered")) {
    return <Package size={16} className="text-berry-500" />;
  }
  return <Info size={16} className="text-ink/40" />;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authApi.notifications();
      setNotes(res.data.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    load();
    // Light polling so flagged/confirmed order updates show up without a manual refresh.
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!user) return null;

  const unreadCount = notes.filter((n) => !n.is_read).length;

  const handleOpen = async () => {
    setOpen((o) => !o);
    if (!open) await load();
  };

  const markRead = async (id) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    try {
      await authApi.markNotificationRead(id);
    } catch {
      // non-critical; ignore
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        className="relative text-ink/80 hover:text-berry-500 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={22} />
        {unreadCount > 0 && (
          <span className="absolute -top-2 -right-2 bg-berry-500 text-white text-[10px] font-semibold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[26rem] overflow-y-auto bg-white border border-ink/10 rounded-xl shadow-soft py-2 text-sm z-50">
          <div className="px-4 py-2 border-b border-ink/5 flex items-center justify-between">
            <p className="font-medium text-ink">Notifications</p>
            {unreadCount > 0 && <span className="text-xs text-berry-600">{unreadCount} new</span>}
          </div>

          {loading && notes.length === 0 ? (
            <p className="px-4 py-6 text-center text-ink/40 text-xs">Loading...</p>
          ) : notes.length === 0 ? (
            <p className="px-4 py-6 text-center text-ink/40 text-xs">No notifications yet.</p>
          ) : (
            notes.map((n) => (
              <button
                key={n.id}
                onClick={() => markRead(n.id)}
                className={`w-full text-left flex items-start gap-2.5 px-4 py-3 hover:bg-blush/40 transition-colors border-b border-ink/5 last:border-0 ${
                  n.is_read ? "opacity-60" : ""
                }`}
              >
                <span className="mt-0.5 shrink-0">{iconFor(n.title)}</span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-ink text-[13px] truncate">{n.title}</span>
                    {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-berry-500 shrink-0" />}
                  </span>
                  <span className="block text-ink/60 text-xs mt-0.5 leading-snug">{n.message}</span>
                  <span className="block text-ink/35 text-[11px] mt-1">{formatDateTime(n.created_at)}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
