import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { CheckCircle2, ShieldAlert, ShieldCheck, Package, Wallet, History, Activity } from "lucide-react";
import { ordersApi } from "../api/endpoints";
import { formatPKR } from "../utils/format";
import { PageSpinner, Button } from "../components/ui";

const CHECK_FACTORS = [
  { icon: Wallet, label: "Payment amount", desc: "Compared against typical order sizes" },
  { icon: History, label: "Account history", desc: "How established this account is" },
  { icon: Activity, label: "Transaction pattern", desc: "Recent order frequency and behavior" },
];

export default function OrderConfirmation() {
  const { id } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState(location.state?.order || null);
  const [loading, setLoading] = useState(!location.state?.order);

  useEffect(() => {
    if (order) return;
    ordersApi
      .get(id)
      .then((res) => setOrder(res.data.data))
      .finally(() => setLoading(false));
  }, [id, order]);

  if (loading) return <PageSpinner />;
  if (!order) return null;

  const held = order.status === "held_for_review";
  const wasScreened = order.payment_method !== "cod";

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
      <div
        className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${
          held ? "bg-amber-100" : "bg-emerald-100"
        }`}
      >
        {held ? (
          <ShieldAlert size={30} className="text-amber-600" />
        ) : (
          <CheckCircle2 size={30} className="text-emerald-600" />
        )}
      </div>

      <h1 className="text-3xl mb-3">
        {held ? "Your order is being reviewed" : "Order confirmed!"}
      </h1>
      <p className="text-ink/60 mb-6 max-w-md mx-auto leading-relaxed">
        {held
          ? "For your security, this order was automatically flagged by our fraud detection system for a quick manual review. You'll get a notification as soon as it's cleared - usually within a few hours."
          : "Thanks for shopping with CosmoStore. We've sent a confirmation to your email and your order is now being prepared."}
      </p>

      {wasScreened && (
        <div
          className={`inline-flex items-center gap-2 text-xs font-medium rounded-full px-4 py-2 mb-8 ${
            held ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          <ShieldCheck size={14} />
          {held ? "Held pending manual verification" : "Screened by CosmoStore Fraud Protection"}
        </div>
      )}

      <div className="bg-white border border-ink/10 rounded-2xl p-6 text-left mb-6">
        <div className="flex justify-between items-center mb-4 pb-4 border-b border-ink/10">
          <div>
            <p className="text-xs text-ink/50">Order number</p>
            <p className="font-medium">{order.order_number}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-ink/50">Total</p>
            <p className="font-semibold">{formatPKR(order.grand_total)}</p>
          </div>
        </div>
        <div className="space-y-2.5 text-sm">
          {order.items?.map((item) => (
            <div key={item.id} className="flex justify-between text-ink/70">
              <span>{item.product_name} × {item.quantity}</span>
              <span>{formatPKR(item.line_total)}</span>
            </div>
          ))}
        </div>
      </div>

      {wasScreened && (
        <div className="bg-white border border-ink/10 rounded-2xl p-6 text-left mb-8">
          <p className="text-sm font-medium mb-4">What our fraud detection system checked</p>
          <div className="grid sm:grid-cols-3 gap-4">
            {CHECK_FACTORS.map((f) => (
              <div key={f.label} className="flex flex-col items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-blush flex items-center justify-center">
                  <f.icon size={15} className="text-berry-500" />
                </div>
                <div>
                  <p className="text-xs font-medium text-ink">{f.label}</p>
                  <p className="text-[11px] text-ink/50 leading-snug">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <Button as={Link} to="/account/orders" variant="secondary">
          <Package size={16} /> View my orders
        </Button>
        <Button as={Link} to="/shop" variant="outline">
          Continue shopping
        </Button>
      </div>
    </div>
  );
}

