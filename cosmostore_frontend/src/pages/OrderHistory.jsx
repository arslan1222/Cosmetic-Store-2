import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Package } from "lucide-react";
import { ordersApi } from "../api/endpoints";
import { formatPKR, formatDate } from "../utils/format";
import { PageSpinner, EmptyState, StatusBadge, Button } from "../components/ui";
import AccountLayout from "../components/AccountLayout";

export default function OrderHistory() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ordersApi
      .myOrders()
      .then((res) => setOrders(res.data.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AccountLayout>
      {loading ? (
        <PageSpinner />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No orders yet"
          description="When you place an order, it'll show up here."
          action={<Button as={Link} to="/shop">Browse products</Button>}
        />
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <Link
              key={o.id}
              to={`/order-confirmation/${o.id}`}
              className="flex items-center justify-between bg-white border border-ink/10 rounded-2xl p-5 hover:border-berry-300 transition-colors"
            >
              <div>
                <p className="font-medium">{o.order_number}</p>
                <p className="text-xs text-ink/50">{formatDate(o.created_at)}</p>
              </div>
              <div className="flex items-center gap-6">
                <span className="font-medium">{formatPKR(o.grand_total)}</span>
                <StatusBadge status={o.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </AccountLayout>
  );
}
