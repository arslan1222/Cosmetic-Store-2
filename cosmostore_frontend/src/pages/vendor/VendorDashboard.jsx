import { useEffect, useState } from "react";
import { catalogApi } from "../../api/endpoints";
import { PageSpinner, StatusBadge } from "../../components/ui";
import VendorStoreSetup from "./VendorStoreSetup";
import VendorProducts from "./VendorProducts";
import VendorOrders from "./VendorOrders";
import VendorApplicationStatus from "./VendorApplicationStatus";

const TABS = [
  { id: "products", label: "Products" },
  { id: "orders", label: "Orders" },
];

export default function VendorDashboard() {
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("products");

  useEffect(() => {
    catalogApi
      .myStore()
      .then((res) => setStore(res.data.data))
      .catch(() => setStore(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSpinner />;

  if (!store) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <VendorStoreSetup onCreated={setStore} />
      </div>
    );
  }

  // Until an admin approves the store the vendor only sees their application
  // status: no product tools, no orders.
  if (store.status !== "approved") {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <VendorApplicationStatus store={store} onChange={setStore} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl">{store.store_name}</h1>
        <StatusBadge status={store.status} />
      </div>
      <p className="text-ink/55 mb-8">{store.description}</p>

      <div className="flex gap-6 border-b border-ink/10 mb-8">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? "border-berry-500 text-berry-600" : "border-transparent text-ink/50 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "products" ? <VendorProducts store={store} /> : <VendorOrders />}
    </div>
  );
}
