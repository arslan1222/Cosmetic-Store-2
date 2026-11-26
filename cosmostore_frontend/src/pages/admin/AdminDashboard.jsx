import { useCallback, useEffect, useState } from "react";
import { adminApi } from "../../api/endpoints";
import {
  LayoutDashboard, Users, Store, Package, ShoppingCart, ShieldAlert, Activity, ListChecks,
} from "lucide-react";
import AdminOverview from "./AdminOverview";
import AdminUsers from "./AdminUsers";
import AdminStores from "./AdminStores";
import AdminProducts from "./AdminProducts";
import AdminOrders from "./AdminOrders";
import AdminFraudReview from "./AdminFraudReview";
import AdminFraudMetrics from "./AdminFraudMetrics";
import AdminFraudLog from "./AdminFraudLog";

const NAV_GROUPS = [
  {
    label: null,
    items: [{ id: "overview", label: "Overview", icon: LayoutDashboard }],
  },
  {
    label: "Fraud detection",
    items: [
      { id: "fraud", label: "Review center", icon: ShieldAlert },
      { id: "fraudlog", label: "Transaction log", icon: ListChecks },
      { id: "metrics", label: "Model metrics", icon: Activity },
    ],
  },
  {
    label: "Catalog & sales",
    items: [
      { id: "orders", label: "Orders", icon: ShoppingCart },
      { id: "products", label: "Products", icon: Package },
      { id: "stores", label: "Vendors", icon: Store },
      { id: "users", label: "Users", icon: Users },
    ],
  },
];

export default function AdminDashboard() {
  const [tab, setTab] = useState("overview");
  const [counts, setCounts] = useState({ flagged_orders: 0, pending_vendor_applications: 0 });

  // Numbers shown as badges on the sidebar so pending work is hard to miss
  const refreshCounts = useCallback(() => {
    adminApi
      .analyticsSummary()
      .then((res) => setCounts(res.data.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts, tab]);

  const badgeFor = (id) =>
    id === "fraud" ? counts.flagged_orders : id === "stores" ? counts.pending_vendor_applications : 0;

  const renderTab = () => {
    switch (tab) {
      case "overview": return <AdminOverview />;
      case "fraud": return <AdminFraudReview onChanged={refreshCounts} />;
      case "fraudlog": return <AdminFraudLog />;
      case "metrics": return <AdminFraudMetrics />;
      case "orders": return <AdminOrders />;
      case "products": return <AdminProducts />;
      case "stores": return <AdminStores onChanged={refreshCounts} />;
      case "users": return <AdminUsers />;
      default: return null;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid md:grid-cols-[220px_1fr] gap-8">
      <aside>
        <h1 className="text-2xl mb-6">Admin</h1>
        <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className="md:mb-3">
              {group.label && (
                <p className="hidden md:block text-[11px] font-medium uppercase tracking-wide text-ink/35 px-3.5 mt-3 mb-1.5">
                  {group.label}
                </p>
              )}
              {group.items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setTab(n.id)}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    tab === n.id ? "bg-berry-500 text-white" : "text-ink/65 hover:bg-blush/60"
                  }`}
                >
                  <n.icon size={16} /> {n.label}
                  {badgeFor(n.id) > 0 && (
                    <span
                      className={`ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold flex items-center justify-center ${
                        tab === n.id ? "bg-white text-berry-600" : "bg-berry-500 text-white"
                      }`}
                      aria-label={`${badgeFor(n.id)} waiting`}
                    >
                      {badgeFor(n.id)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">{renderTab()}</div>
    </div>
  );
}
