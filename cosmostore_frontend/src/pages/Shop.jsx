import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import { catalogApi } from "../api/endpoints";
import ProductCard from "../components/ProductCard";
import Pagination from "../components/Pagination";
import { PageSpinner, EmptyState, Breadcrumbs } from "../components/ui";

const PER_PAGE = 12;

export default function Shop() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const q = searchParams.get("q") || "";
  const categoryId = searchParams.get("category_id") || "";
  const categoryName = searchParams.get("category") || "";
  const sort = searchParams.get("sort") || "newest";
  const page = Math.max(parseInt(searchParams.get("page"), 10) || 1, 1);

  useEffect(() => {
    catalogApi.categories().then((res) => setCategories(res.data.data));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = { per_page: PER_PAGE, sort, page };
    if (q) params.q = q;
    if (categoryId) params.category_id = categoryId;

    let effectiveCategoryId = categoryId;
    if (!categoryId && categoryName && categories.length) {
      const match = categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
      if (match) effectiveCategoryId = match.id;
    }
    if (effectiveCategoryId) params.category_id = effectiveCategoryId;

    catalogApi
      .products(params)
      .then((res) => {
        const data = res.data.data;
        // Page no longer exists (e.g. products were removed): go to the last one
        if (data.pages > 0 && page > data.pages) {
          const next = new URLSearchParams(searchParams);
          next.set("page", data.pages);
          setSearchParams(next, { replace: true });
          return;
        }
        setProducts(data.items);
        setTotal(data.total);
        setTotalPages(data.pages || 1);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, categoryId, categoryName, sort, page, categories]);

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "category_id") next.delete("category");
    next.delete("page");
    setSearchParams(next);
  };

  const goToPage = (newPage) => {
    const next = new URLSearchParams(searchParams);
    if (newPage > 1) next.set("page", newPage);
    else next.delete("page");
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const activeCategory =
    categories.find((c) => String(c.id) === String(categoryId))?.name || categoryName;
  const title = q ? `Results for "${q}"` : activeCategory || "All products";
  const hasFilters = q || categoryId || categoryName;

  const chip = (active) =>
    `shrink-0 px-5 py-2.5 rounded-full text-sm font-medium border transition-colors ${
      active ? "bg-ink text-white border-ink" : "border-ink/20 text-ink/75 hover:border-ink hover:text-ink"
    }`;

  return (
    <div>
      <div className="bg-petal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Shop", to: "/shop" }, ...(activeCategory ? [{ label: activeCategory }] : [])]} />
          <h1 className="text-4xl font-semibold mt-3">{title}</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Category chips + sort */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-ink/10">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 lg:mx-0 lg:px-0">
            <button onClick={() => updateParam("category_id", "")} className={chip(!categoryId && !categoryName)}>
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => updateParam("category_id", c.id)}
                className={chip(String(c.id) === String(categoryId) || c.name === activeCategory)}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <p className="text-sm text-ink/55 hidden sm:block">
              {total === 0
                ? "0 products"
                : `${(page - 1) * PER_PAGE + 1}–${Math.min(page * PER_PAGE, total)} of ${total}`}
            </p>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-ink/55">Sort</span>
              <select
                value={sort}
                onChange={(e) => updateParam("sort", e.target.value)}
                className="bg-white border border-ink/20 rounded-full px-4 py-2.5 text-sm font-medium outline-none focus:border-berry-400"
              >
                <option value="newest">Newest</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
              </select>
            </label>
          </div>
        </div>

        {hasFilters && (
          <div className="flex flex-wrap items-center gap-2 pt-5">
            {q && (
              <span className="inline-flex items-center gap-1.5 bg-petal text-sm px-3 py-1.5 rounded-full">
                Search: {q}
                <button onClick={() => updateParam("q", "")} aria-label="Clear search"><X size={13} /></button>
              </span>
            )}
            {activeCategory && (
              <span className="inline-flex items-center gap-1.5 bg-petal text-sm px-3 py-1.5 rounded-full">
                {activeCategory}
                <button onClick={() => updateParam("category_id", "")} aria-label="Clear category"><X size={13} /></button>
              </span>
            )}
            <button onClick={() => setSearchParams({})} className="text-sm text-ink/55 hover:text-berry-600 underline underline-offset-4 ml-1">
              Clear all
            </button>
          </div>
        )}

        <div className="pt-8">
          {loading ? (
            <PageSpinner />
          ) : products.length === 0 ? (
            <EmptyState title="No products found" description="Try a different search term or category." />
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 sm:gap-x-6 gap-y-10">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
              <Pagination page={page} pages={totalPages} onPageChange={goToPage} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
