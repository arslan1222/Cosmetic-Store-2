import { useEffect, useState } from "react";
import { adminApi } from "../../api/endpoints";
import { formatPKR } from "../../utils/format";
import { PageSpinner, EmptyState } from "../../components/ui";

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi
      .products()
      .then((res) => setProducts(res.data.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSpinner />;

  return (
    <div>
      <h2 className="font-display text-xl mb-6">All products ({products.length})</h2>
      {products.length === 0 ? (
        <EmptyState title="No products yet" />
      ) : (
        <div className="bg-white border border-ink/10 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-blush/40 text-ink/60 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Store</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Stock</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-ink/5">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-ink/60">{p.store_name}</td>
                  <td className="px-4 py-3 text-ink/60">{p.category_name}</td>
                  <td className="px-4 py-3">{formatPKR(p.final_price)}</td>
                  <td className="px-4 py-3">{p.stock_quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
