import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Store, ArrowUpRight } from "lucide-react";
import { catalogApi } from "../api/endpoints";
import { PageSpinner, EmptyState, Breadcrumbs } from "../components/ui";

const TILES = ["bg-petal", "bg-sage", "bg-[#F3E3D6]", "bg-[#E9E4EE]"];

export default function Stores() {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    catalogApi
      .stores()
      .then((res) => setStores(res.data.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSpinner />;

  return (
    <div>
      <div className="bg-petal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Boutiques" }]} />
          <h1 className="text-4xl font-semibold mt-3 mb-2">Boutiques</h1>
          <p className="text-ink/65">Independent cosmetic vendors selling on CosmoStore.</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        {stores.length === 0 ? (
          <EmptyState icon={Store} title="No boutiques yet" description="Check back soon." />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {stores.map((s, i) => (
              <Link
                key={s.id}
                to={`/store/${s.id}`}
                className={`group rounded-3xl p-7 min-h-[220px] flex flex-col justify-between ${TILES[i % TILES.length]} hover:shadow-lift transition-shadow`}
              >
                <div className="flex items-start justify-between">
                  <span className="w-12 h-12 rounded-full bg-ink text-white font-display text-xl flex items-center justify-center">
                    {s.store_name?.[0]}
                  </span>
                  <ArrowUpRight size={20} className="text-ink/40 group-hover:text-ink transition-colors" />
                </div>
                <div>
                  <h3 className="font-display text-2xl font-semibold mb-1">{s.store_name}</h3>
                  <p className="text-sm text-ink/65 line-clamp-2 mb-3">{s.description}</p>
                  <p className="text-xs font-medium text-ink/50">{s.product_count} products</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
