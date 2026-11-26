import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { ordersApi } from "../../api/endpoints";
import { formatPKR, formatDate } from "../../utils/format";
import { PageSpinner, EmptyState, StatusBadge } from "../../components/ui";

export default function VendorOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ordersApi
      .vendorOrders()
      .then((res) => setOrders(res.data.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSpinner />;

  return (
    <div>
      <h2 className="font-display text-xl mb-6">Orders ({orders.length})</h2>
      {orders.length === 0 ? (
        <EmptyState icon={Package} title="No orders yet" description="Orders for your products will appear here." />
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <div key={o.id} className="bg-white border border-ink/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-medium">{o.order_number}</p>
                  <p className="text-xs text-ink/50">{formatDate(o.created_at)} · {o.customer_name}</p>
                </div>
                <StatusBadge status={o.status} />
              </div>
              <div className="space-y-1.5 text-sm text-ink/70 border-t border-ink/5 pt-3">
                {o.items.map((item) => (
                  <div key={item.id} className="flex justify-between">
                    <span>{item.product_name} × {item.quantity}</span>
                    <span>{formatPKR(item.line_total)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
