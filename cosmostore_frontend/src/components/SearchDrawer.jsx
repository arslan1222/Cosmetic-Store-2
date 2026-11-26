import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, X, ArrowRight } from "lucide-react";
import { catalogApi } from "../api/endpoints";
import { formatPKR } from "../utils/format";
import { resolveImage } from "../utils/image";

export default function SearchDrawer({ open, onClose, categories }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Debounced live suggestions
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      catalogApi
        .products({ q, per_page: 5 })
        .then((res) => setResults(res.data.data.items || []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    const q = query.trim();
    onClose();
    navigate(q ? `/shop?q=${encodeURIComponent(q)}` : "/shop");
  };

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Search products">
      <div className="absolute inset-0 bg-ink/50 animate-fade-in" onClick={onClose} />
      <div className="relative bg-white animate-drop-in shadow-lift">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <form onSubmit={submit} className="relative">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/40" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for serums, lipsticks, brands..."
              className="w-full bg-cream rounded-full pl-12 pr-12 py-3.5 outline-none focus:ring-2 focus:ring-berry-400/40"
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close search"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-ink/50 hover:text-ink"
            >
              <X size={20} />
            </button>
          </form>

          {query.trim().length < 2 ? (
            categories.length > 0 && (
              <div className="mt-6">
                <p className="text-sm text-ink/55 mb-3">Popular categories</p>
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => (
                    <Link
                      key={c.id}
                      to={`/shop?category_id=${c.id}`}
                      onClick={onClose}
                      className="px-4 py-2 rounded-full border border-ink/15 text-sm hover:bg-ink hover:text-white hover:border-ink transition-colors"
                    >
                      {c.name}
                    </Link>
                  ))}
                </div>
              </div>
            )
          ) : (
            <div className="mt-5">
              {searching && results.length === 0 ? (
                <p className="text-sm text-ink/50 py-6 text-center">Searching...</p>
              ) : results.length === 0 ? (
                <p className="text-sm text-ink/60 py-6 text-center">
                  No products match "{query.trim()}". Try a different word or browse a category.
                </p>
              ) : (
                <>
                  <ul className="divide-y divide-ink/10">
                    {results.map((p) => {
                      const img = resolveImage(p.image_url);
                      return (
                        <li key={p.id}>
                          <Link
                            to={`/product/${p.id}`}
                            onClick={onClose}
                            className="flex items-center gap-4 py-3 hover:bg-cream/70 rounded-xl px-2 -mx-2"
                          >
                            <span className="w-14 h-16 rounded-lg overflow-hidden bg-petal shrink-0">
                              {img && <img src={img} alt="" className="w-full h-full object-cover" />}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-xs text-ink/50">{p.brand || p.store_name}</span>
                              <span className="block text-sm font-medium truncate">{p.name}</span>
                            </span>
                            <span className="text-sm font-semibold">{formatPKR(p.final_price)}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                  <button
                    type="button"
                    onClick={submit}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-berry-600 hover:underline"
                  >
                    See all results <ArrowRight size={14} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
