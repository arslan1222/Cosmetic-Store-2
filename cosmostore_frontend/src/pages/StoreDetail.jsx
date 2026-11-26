import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { catalogApi } from "../api/endpoints";
import ProductCard from "../components/ProductCard";
import { PageSpinner, EmptyState, Breadcrumbs } from "../components/ui";

export default function StoreDetail() {
  const { id } = useParams();
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    catalogApi
      .store(id)
      .then((res) => setStore(res.data.data))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <PageSpinner />;
  if (!store) return null;

  return (
    <div>
      <div className="bg-petal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <Breadcrumbs
            items={[{ label: "Home", to: "/" }, { label: "Boutiques", to: "/stores" }, { label: store.store_name }]}
          />
          <div className="flex items-center gap-5 mt-5">
            <span className="w-16 h-16 rounded-full bg-ink text-white font-display text-2xl flex items-center justify-center shrink-0">
              {store.store_name?.[0]}
            </span>
            <div>
              <h1 className="text-4xl font-semibold mb-1">{store.store_name}</h1>
              <p className="text-ink/65 max-w-xl">{store.description}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <p className="text-ink/50 text-sm mb-6">{store.products.length} products</p>
        {store.products.length === 0 ? (
          <EmptyState title="No products listed yet" />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 sm:gap-x-6 gap-y-10">
            {store.products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
