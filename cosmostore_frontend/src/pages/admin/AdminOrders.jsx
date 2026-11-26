import { useEffect, useState } from "react";
import { adminApi } from "../../api/endpoints";
import { useToast } from "../../context/ToastContext";
import { formatPKR, formatDate } from "../../utils/format";
import { PageSpinner, StatusBadge, Select, EmptyState } from "../../components/ui";
import { RiskBadge } from "../../components/RiskIndicators";

const STATUSES = ["pending", "held_for_review", "confirmed", "shipped", "delivered", "cancelled", "rejected"];

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = () =>
    adminApi
      .orders(filter || undefined)
      .then((res) => setOrders(res.data.data));

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [filter]);

  const updateStatus = async (id, status) => {
    try {
      await adminApi.updateOrderStatus(id, status);
      toast.success("Order status updated.");
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-xl">Orders</h2>
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-48">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
          ))}
        </Select>
      </div>

      {loading ? (
        <PageSpinner />
      ) : orders.length === 0 ? (
        <EmptyState title="No orders found" />
      ) : (
        <div className="bg-white border border-ink/10 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-blush/40 text-ink/60 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Fraud check</th>
                <th className="px-4 py-3 font-medium">Update</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-ink/5">
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{o.order_number}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{o.customer_name}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-ink/60">{formatDate(o.created_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatPKR(o.grand_total)}</td>
                  <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {o.fraud_check ? (
                      <span className="inline-flex items-center gap-2">
                        <RiskBadge level={o.fraud_check.risk_level} probability={o.fraud_check.fraud_probability} />
                        {o.fraud_check.is_flagged && (
                          <span className="text-xs font-medium text-amber-700">Flagged</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-ink/40">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {o.status === "held_for_review" ? (
                      <span className="text-xs text-amber-700">Decide in Fraud review center</span>
                    ) : ["cancelled", "rejected"].includes(o.status) ? (
                      <span className="text-xs text-ink/40">Closed</span>
                    ) : (
                    <select
                      value={o.status}
                      onChange={(e) => updateStatus(o.id, e.target.value)}
                      className="border border-ink/15 rounded-lg text-xs px-2 py-1.5"
                    >
                      {STATUSES.filter((s) => s !== "held_for_review" || o.status === s).map((s) => (
                        <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
                      ))}
                    </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
