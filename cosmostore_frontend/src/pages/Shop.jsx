import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { X, SlidersHorizontal } from "lucide-react";
import { catalogApi } from "../api/endpoints";
import ProductCard from "../components/ProductCard";
import Pagination from "../components/Pagination";
import { PageSpinner, EmptyState, Breadcrumbs } from "../components/ui";

const PER_PAGE = 12;

/** Category / brand / price filters. Used in the desktop sidebar and the mobile drawer. */
function FiltersPanel({ categories, brands, state, onChange, onClear }) {
  const [min, setMin] = useState(state.minPrice);
  const [max, setMax] = useState(state.maxPrice);
  useEffect(() => {
    setMin(state.minPrice);
    setMax(state.maxPrice);
  }, [state.minPrice, state.maxPrice]);

  const radio = (active) =>
    `flex items-center justify-between w-full text-left text-sm py-1.5 ${active ? "font-semibold text-ink" : "text-ink/70 hover:text-ink"}`;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-sans font-semibold text-sm mb-2">Category</h3>
        <button type="button" onClick={() => onChange({ category_id: "" })} className={radio(!state.categoryId && !state.categoryName)}>
          All products
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange({ category_id: c.id })}
            className={radio(String(c.id) === String(state.categoryId) || c.name === state.categoryName)}
          >
            {c.name}
          </button>
        ))}
      </div>

      {brands.length > 0 && (
        <div>
          <h3 className="font-sans font-semibold text-sm mb-2">Brand</h3>
          <button type="button" onClick={() => onChange({ brand: "" })} className={radio(!state.brand)}>
            All brands
          </button>
          {brands.map((b) => (
            <button key={b.name} type="button" onClick={() => onChange({ brand: b.name })} className={radio(state.brand === b.name)}>
              <span>{b.name}</span>
              <span className="text-xs text-ink/40">{b.count}</span>
            </button>
          ))}
        </div>
      )}

      <div>
        <h3 className="font-sans font-semibold text-sm mb-2">Price (PKR)</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onChange({ min_price: min, max_price: max });
          }}
          className="flex items-center gap-2"
        >
          <input
            type="number"
            min="0"
            inputMode="numeric"
            placeholder="Min"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            aria-label="Minimum price"
            className="w-full bg-white border border-ink/20 rounded-xl px-3 py-2 text-sm outline-none focus:border-berry-400"
          />
          <span className="text-ink/30">-</span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            placeholder="Max"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            aria-label="Maximum price"
            className="w-full bg-white border border-ink/20 rounded-xl px-3 py-2 text-sm outline-none focus:border-berry-400"
          />
          <button type="submit" className="shrink-0 rounded-xl bg-ink text-white text-sm font-medium px-4 py-2 hover:bg-berry-500 transition-colors">
            Go
          </button>
        </form>
      </div>

      <button type="button" onClick={onClear} className="text-sm text-ink/55 hover:text-berry-600 underline underline-offset-4">
        Clear all filters
      </button>
    </div>
  );
}

export default function Shop() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const q = searchParams.get("q") || "";
  const categoryId = searchParams.get("category_id") || "";
  const categoryName = searchParams.get("category") || "";
  const brand = searchParams.get("brand") || "";
  const minPrice = searchParams.get("min_price") || "";
  const maxPrice = searchParams.get("max_price") || "";
  const sort = searchParams.get("sort") || "newest";
  const page = Math.max(parseInt(searchParams.get("page"), 10) || 1, 1);

  useEffect(() => {
    catalogApi.categories().then((res) => setCategories(res.data.data));
    catalogApi.brands().then((res) => setBrands(res.data.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = { per_page: PER_PAGE, sort, page };
    if (q) params.q = q;
    if (brand) params.brand = brand;
    if (minPrice) params.min_price = minPrice;
    if (maxPrice) params.max_price = maxPrice;

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
        // Page no longer exists (e.g. filters narrowed the results): go to the last one
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
  }, [q, categoryId, categoryName, brand, minPrice, maxPrice, sort, page, categories]);

  /** Apply one or more filter changes; empty string removes the filter and we go back to page 1. */
  const applyFilters = (changes) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => {
      if (value !== "" && value != null) next.set(key, value);
      else next.delete(key);
    });
    if ("category_id" in changes) next.delete("category");
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

  const activeCategory = categories.find((c) => String(c.id) === String(categoryId))?.name || categoryName;
  const title = q ? `Results for "${q}"` : brand || activeCategory || "All products";
  const hasFilters = q || categoryId || categoryName || brand || minPrice || maxPrice;

  const filterState = { categoryId, categoryName: activeCategory, brand, minPrice, maxPrice };
  const clearAll = () => {
    setSearchParams({});
    setFiltersOpen(false);
  };

  const tag = (label, onRemove, aria) => (
    <span key={aria} className="inline-flex items-center gap-1.5 bg-petal text-sm px-3 py-1.5 rounded-full">
      {label}
      <button onClick={onRemove} aria-label={aria}><X size={13} /></button>
    </span>
  );

  return (
    <div>
      <div className="bg-petal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <Breadcrumbs
            items={[{ label: "Home", to: "/" }, { label: "Shop", to: "/shop" }, ...(activeCategory ? [{ label: activeCategory }] : [])]}
          />
          <h1 className="text-4xl font-semibold mt-3">{title}</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 lg:grid lg:grid-cols-[250px_1fr] lg:gap-12">
        {/* Desktop filter sidebar */}
        <aside className="hidden lg:block" aria-label="Filters">
          <FiltersPanel categories={categories} brands={brands} state={filterState} onChange={applyFilters} onClear={clearAll} />
        </aside>

        <div>
          <div className="flex items-center justify-between gap-4 pb-5 border-b border-ink/10">
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="lg:hidden inline-flex items-center gap-2 border border-ink/20 rounded-full px-4 py-2.5 text-sm font-medium"
            >
              <SlidersHorizontal size={15} /> Filters
            </button>
            <p className="text-sm text-ink/55 hidden sm:block">
              {total === 0 ? "0 products" : `${(page - 1) * PER_PAGE + 1}-${Math.min(page * PER_PAGE, total)} of ${total}`}
            </p>
            <label className="flex items-center gap-2 text-sm ml-auto">
              <span className="text-ink/55">Sort</span>
              <select
                value={sort}
                onChange={(e) => applyFilters({ sort: e.target.value })}
                className="bg-white border border-ink/20 rounded-full px-4 py-2.5 text-sm font-medium outline-none focus:border-berry-400"
              >
                <option value="newest">Newest</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
              </select>
            </label>
          </div>

          {hasFilters && (
            <div className="flex flex-wrap items-center gap-2 pt-5">
              {q && tag(`Search: ${q}`, () => applyFilters({ q: "" }), "Clear search")}
              {activeCategory && tag(activeCategory, () => applyFilters({ category_id: "" }), "Clear category")}
              {brand && tag(brand, () => applyFilters({ brand: "" }), "Clear brand")}
              {(minPrice || maxPrice) &&
                tag(`PKR ${minPrice || 0} - ${maxPrice || "any"}`, () => applyFilters({ min_price: "", max_price: "" }), "Clear price")}
              <button onClick={clearAll} className="text-sm text-ink/55 hover:text-berry-600 underline underline-offset-4 ml-1">
                Clear all
              </button>
            </div>
          )}

          <div className="pt-8">
            {loading ? (
              <PageSpinner />
            ) : products.length === 0 ? (
              <EmptyState title="No products found" description="Try different filters or a different search term." />
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 sm:gap-x-6 gap-y-10">
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

      {/* Mobile filter drawer */}
      {filtersOpen && (
        <div className="lg:hidden fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="absolute inset-0 bg-ink/50 animate-fade-in" onClick={() => setFiltersOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-[88%] max-w-sm bg-white flex flex-col animate-drawer-left">
            <div className="flex items-center justify-between px-5 h-16 border-b border-ink/10 shrink-0">
              <h2 className="font-display text-lg">Filters</h2>
              <button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X size={22} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <FiltersPanel
                categories={categories}
                brands={brands}
                state={filterState}
                onChange={(c) => {
                  applyFilters(c);
                  if (!("min_price" in c)) setFiltersOpen(false);
                }}
                onClear={clearAll}
              />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
