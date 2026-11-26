import { useEffect, useState } from "react";
import { Mail, Phone, Check, X } from "lucide-react";
import { adminApi } from "../../api/endpoints";
import { useToast } from "../../context/ToastContext";
import { formatDate } from "../../utils/format";
import { StatusBadge, PageSpinner, Button, EmptyState, TextArea } from "../../components/ui";

const TABS = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "suspended", label: "Suspended" },
  { id: "all", label: "All" },
];

export default function AdminStores({ onChanged }) {
  const [stores, setStores] = useState([]);
  const [tab, setTab] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);
  // which store has the reason box open, and for which action
  const [reasonFor, setReasonFor] = useState(null); // { id, status }
  const [reason, setReason] = useState("");
  const toast = useToast();

  // Load everything once and filter locally so the tab counts stay accurate.
  const load = () => adminApi.stores().then((res) => setStores(res.data.data));

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const counts = stores.reduce((acc, s) => ({ ...acc, [s.status]: (acc[s.status] || 0) + 1 }), {});
  const visible = tab === "all" ? stores : stores.filter((s) => s.status === tab);

  const setStatus = async (id, status, why) => {
    setActingId(id);
    try {
      await adminApi.setStoreStatus(id, status, why);
      toast.success(
        status === "approved" ? "Store approved. The vendor has been notified." : `Store ${status}. The vendor has been notified.`
      );
      setReasonFor(null);
      setReason("");
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActingId(null);
    }
  };

  const openReason = (id, status) => {
    setReasonFor({ id, status });
    setReason("");
  };

  if (loading) return <PageSpinner />;

  return (
    <div>
      <h2 className="font-display text-xl mb-1">Vendor applications and stores</h2>
      <p className="text-ink/55 text-sm mb-6">
        New vendors can't list products or appear in the shop until you approve their store.
      </p>

      <div className="flex gap-2 overflow-x-auto mb-6 pb-1">
        {TABS.map((t) => {
          const n = t.id === "all" ? stores.length : counts[t.id] || 0;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                tab === t.id ? "bg-ink text-white border-ink" : "border-ink/20 text-ink/70 hover:border-ink"
              }`}
            >
              {t.label}
              <span className={`ml-2 text-xs ${tab === t.id ? "text-white/70" : "text-ink/40"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={tab === "pending" ? "No applications waiting" : "No stores here"}
          description={tab === "pending" ? "New vendor applications will appear here." : undefined}
        />
      ) : (
        <div className="space-y-4">
          {visible.map((s) => {
            const askingReason = reasonFor?.id === s.id;
            return (
              <div key={s.id} className="bg-white border border-ink/10 rounded-2xl p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="font-semibold text-lg">{s.store_name}</p>
                      <StatusBadge status={s.status} />
                    </div>
                    <p className="text-sm text-ink/60 mt-0.5">
                      {s.owner_name} · applied {formatDate(s.created_at)}
                    </p>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink/60 mt-2">
                      {s.owner_email && (
                        <span className="inline-flex items-center gap-1.5">
                          <Mail size={13} /> {s.owner_email}
                        </span>
                      )}
                      {s.owner_phone && (
                        <span className="inline-flex items-center gap-1.5">
                          <Phone size={13} /> {s.owner_phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-ink/50">
                    {s.product_count} products · {s.commission_rate}% commission
                  </p>
                </div>

                {s.description && <p className="text-sm text-ink/75 mt-4 leading-relaxed">{s.description}</p>}

                {s.rejection_reason && s.status !== "approved" && (
                  <p className="text-sm mt-4 rounded-xl bg-red-50 text-red-800 px-4 py-3">
                    <b className="font-medium">Reason given:</b> {s.rejection_reason}
                  </p>
                )}

                {askingReason ? (
                  <div className="mt-4 space-y-3">
                    <TextArea
                      label={
                        reasonFor.status === "rejected"
                          ? "Why is this application being rejected? The vendor will see this."
                          : "Why is this store being suspended? (optional, the vendor will see this)"
                      }
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-3">
                      <Button
                        variant="danger"
                        disabled={actingId === s.id || (reasonFor.status === "rejected" && !reason.trim())}
                        onClick={() => setStatus(s.id, reasonFor.status, reason.trim())}
                        className="!px-4 !py-2 text-sm"
                      >
                        {reasonFor.status === "rejected" ? "Reject application" : "Suspend store"}
                      </Button>
                      <Button variant="ghost" onClick={() => setReasonFor(null)} className="!px-4 !py-2 text-sm">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3 mt-4">
                    {s.status !== "approved" && (
                      <Button
                        onClick={() => setStatus(s.id, "approved")}
                        disabled={actingId === s.id}
                        className="!px-4 !py-2 text-sm bg-emerald-600 hover:bg-emerald-700"
                      >
                        <Check size={15} /> Approve
                      </Button>
                    )}
                    {(s.status === "pending") && (
                      <Button
                        variant="outline"
                        onClick={() => openReason(s.id, "rejected")}
                        className="!px-4 !py-2 text-sm"
                      >
                        <X size={15} /> Reject
                      </Button>
                    )}
                    {s.status === "approved" && (
                      <Button
                        variant="outline"
                        onClick={() => openReason(s.id, "suspended")}
                        className="!px-4 !py-2 text-sm"
                      >
                        Suspend
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
