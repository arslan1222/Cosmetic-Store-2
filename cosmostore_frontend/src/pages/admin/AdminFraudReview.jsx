import { useEffect, useState } from "react";
import { ShieldAlert, Check, X, Eye, EyeOff } from "lucide-react";
import { adminApi } from "../../api/endpoints";
import { useToast } from "../../context/ToastContext";
import { formatPKR, formatDateTime } from "../../utils/format";
import { EmptyState, PageSpinner, Button } from "../../components/ui";
import { RiskBadge, RiskMeter, RiskFactors, FlagSource } from "../../components/RiskIndicators";

function Fact({ label, value, warn }) {
  return (
    <div>
      <span className="text-ink/40 block text-xs">{label}</span>
      <span className={`text-sm ${warn ? "text-red-700 font-semibold" : "text-ink/80"}`}>{value}</span>
    </div>
  );
}

export default function AdminFraudReview({ onChanged }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);
  const toast = useToast();

  const load = () => adminApi.flaggedOrders().then((res) => setOrders(res.data.data));

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const decide = async (orderId, decision) => {
    setActingId(orderId);
    try {
      await adminApi.fraudDecision(orderId, decision);
      toast.success(decision === "approved" ? "Order approved and confirmed." : "Order rejected and stock restored.");
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActingId(null);
    }
  };

  const toggleWatchlist = async (customer) => {
    try {
      await adminApi.setWatchlist(customer.id, !customer.is_watchlisted);
      toast.success(customer.is_watchlisted ? "Removed from watchlist." : "Added to watchlist. Their future orders will be held.");
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <PageSpinner />;

  return (
    <div>
      <h2 className="font-display text-xl mb-2">Fraud review center</h2>
      <p className="text-ink/55 text-sm mb-6">
        Orders held before confirmation, either by the fraud model or by a rule check. Vendors can't see or ship
        these until you approve them.
      </p>

      {orders.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="Nothing to review"
          description="No orders are currently flagged for review."
        />
      ) : (
        <div className="space-y-5">
          {orders.map((o) => {
            const fc = o.fraud_check;
            const c = o.customer;
            const modelRan = !String(fc.model_version).startsWith("rules-only") && fc.model_version !== "untrained";
            return (
              <div key={o.id} className="bg-white border border-amber-200 rounded-2xl p-6">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                  <div>
                    <p className="font-semibold">{o.order_number}</p>
                    <p className="text-xs text-ink/50">
                      {o.customer_name} · {formatDateTime(o.created_at)}
                    </p>
                  </div>
                  <span className="font-semibold text-lg">{formatPKR(o.grand_total)}</span>
                </div>

                {/* Why it was flagged */}
                <div className="bg-amber-50 rounded-xl p-4 mb-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <ShieldAlert size={16} className="text-amber-600" />
                      <p className="text-sm font-medium text-amber-800">Why this order was held</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <FlagSource source={fc.flag_source} />
                      <RiskBadge level={fc.risk_level} probability={fc.fraud_probability} />
                    </div>
                  </div>

                  <RiskFactors factors={fc.risk_factors} />

                  <div className="mt-4">
                    {modelRan ? (
                      <RiskMeter probability={fc.fraud_probability} level={fc.risk_level} />
                    ) : (
                      <p className="text-xs text-ink/50">
                        The ML model wasn't used for this order
                        {fc.model_version === "untrained" ? " (model not trained)." : " (cash on delivery); rules only."}
                      </p>
                    )}
                  </div>
                </div>

                {/* Who is the customer */}
                {c && (
                  <div className="rounded-xl border border-ink/10 p-4 mb-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <p className="text-sm font-medium">Customer</p>
                      <button
                        type="button"
                        onClick={() => toggleWatchlist(c)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-ink/70 hover:text-berry-600"
                      >
                        {c.is_watchlisted ? <EyeOff size={14} /> : <Eye size={14} />}
                        {c.is_watchlisted ? "Remove from watchlist" : "Add to watchlist"}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <Fact label="Account age" value={`${c.account_age_days} day${c.account_age_days === 1 ? "" : "s"}`} warn={c.account_age_days < 3} />
                      <Fact label="Orders placed" value={c.total_orders} />
                      <Fact label="Previously flagged" value={c.total_flagged_orders} warn={c.total_flagged_orders >= 2} />
                      <Fact label="Watchlist" value={c.is_watchlisted ? "On watchlist" : "No"} warn={c.is_watchlisted} />
                    </div>
                    <p className="text-xs text-ink/50 mt-3">
                      {c.email}
                      {c.phone ? ` · ${c.phone}` : ""} · {o.payment_method} · ships to {o.shipping_city}
                    </p>
                  </div>
                )}

                <div className="space-y-1.5 text-sm text-ink/70 mb-5">
                  {o.items.map((item) => (
                    <div key={item.id} className="flex justify-between">
                      <span>
                        {item.product_name} × {item.quantity}
                      </span>
                      <span>{formatPKR(item.line_total)}</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={() => decide(o.id, "approved")}
                    disabled={actingId === o.id}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Check size={15} /> Approve order
                  </Button>
                  <Button variant="danger" onClick={() => decide(o.id, "rejected")} disabled={actingId === o.id}>
                    <X size={15} /> Reject order
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
