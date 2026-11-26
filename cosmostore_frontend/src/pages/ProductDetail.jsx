import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Minus, Plus, ShoppingBag, Store, ChevronDown, ShieldCheck, Truck, Wallet } from "lucide-react";
import { catalogApi } from "../api/endpoints";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { formatPKR, formatDate } from "../utils/format";
import { resolveImage, FREE_SHIPPING_THRESHOLD, SHIPPING_FEE } from "../utils/image";
import { PageSpinner, Button, TextArea, Breadcrumbs, Rating } from "../components/ui";
import ProductCard from "../components/ProductCard";

const RECENT_KEY = "cs_recently_viewed";

function readRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
  } catch {
    return [];
  }
}

function Accordion({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-ink/10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between py-4 font-semibold text-left"
      >
        {title}
        <ChevronDown size={18} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="pb-5 text-sm text-ink/70 leading-relaxed">{children}</div>}
    </div>
  );
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [activeImage, setActiveImage] = useState(null);
  const [zoom, setZoom] = useState(null);
  const [related, setRelated] = useState([]);
  const [recent, setRecent] = useState([]);

  const { addToCart, openCart } = useCart();
  const { user } = useAuth();
  const toast = useToast();

  const load = () =>
    catalogApi.product(id).then((res) => {
      setProduct(res.data.data);
      const gallery = res.data.data.images;
      setActiveImage(gallery?.length ? gallery[0].image_url : res.data.data.image_url);
    });

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    setQty(1);
    window.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Recently viewed (kept in this browser only) + related products
  useEffect(() => {
    if (!product) return;
    const list = readRecent().filter((p) => p.id !== product.id);
    setRecent(list.slice(0, 4));
    const entry = {
      id: product.id,
      name: product.name,
      brand: product.brand,
      store_name: product.store_name,
      image_url: product.image_url,
      price: product.price,
      final_price: product.final_price,
      discount_percent: product.discount_percent,
      stock_quantity: product.stock_quantity,
      avg_rating: product.avg_rating,
      review_count: product.review_count,
    };
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify([entry, ...list].slice(0, 8)));
    } catch {
      /* storage unavailable: skip */
    }

    catalogApi
      .products({ per_page: 5, sort: "newest", ...(product.category_id ? { category_id: product.category_id } : {}) })
      .then((res) => setRelated(res.data.data.items.filter((p) => p.id !== product.id).slice(0, 4)))
      .catch(() => {});
  }, [product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <PageSpinner />;
  if (!product) return null;

  const gallery = product.images?.length
    ? product.images
    : product.image_url
    ? [{ id: "cover", image_url: product.image_url }]
    : [];
  const image = resolveImage(activeImage);
  const inStock = product.stock_quantity > 0;
  const lowStock = inStock && product.stock_quantity <= 5;

  const addItem = async () => {
    if (!user) {
      toast.info("Please log in to add items to your cart.");
      return false;
    }
    setAdding(true);
    try {
      await addToCart(product.id, qty);
      return true;
    } catch (err) {
      toast.error(err.message);
      return false;
    } finally {
      setAdding(false);
    }
  };

  const handleAdd = async () => {
    if (await addItem()) openCart();
  };
  const handleBuyNow = async () => {
    if (await addItem()) navigate("/checkout");
  };

  const handleReview = async (e) => {
    e.preventDefault();
    setSubmittingReview(true);
    try {
      await catalogApi.addReview(product.id, { rating: reviewRating, comment: reviewComment });
      toast.success("Thanks for your review!");
      setReviewComment("");
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmittingReview(false);
    }
  };

  const onZoomMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };

  return (
    <div className="pb-24 lg:pb-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        <Breadcrumbs
          items={[
            { label: "Home", to: "/" },
            { label: "Shop", to: "/shop" },
            ...(product.category_name ? [{ label: product.category_name, to: `/shop?category_id=${product.category_id}` }] : []),
            { label: product.name },
          ]}
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-16">
        {/* Gallery */}
        <div className="flex flex-col-reverse sm:flex-row gap-4">
          {gallery.length > 1 && (
            <div className="flex sm:flex-col gap-3 overflow-x-auto sm:overflow-visible scrollbar-hide">
              {gallery.map((img) => (
                <button
                  key={img.id}
                  onClick={() => setActiveImage(img.image_url)}
                  aria-label="Show image"
                  className={`w-16 h-20 shrink-0 rounded-xl overflow-hidden border-2 transition-colors ${
                    activeImage === img.image_url ? "border-ink" : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                >
                  <img src={resolveImage(img.image_url)} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <div
            className="relative flex-1 aspect-[4/5] rounded-3xl overflow-hidden bg-petal cursor-zoom-in"
            onMouseMove={onZoomMove}
            onMouseLeave={() => setZoom(null)}
          >
            {image ? (
              <img
                src={image}
                alt={product.name}
                className="w-full h-full object-cover transition-transform duration-200"
                style={zoom ? { transform: "scale(1.8)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
              />
            ) : (
              <span className="w-full h-full flex items-center justify-center font-display text-8xl text-ink/15">
                {product.name[0]}
              </span>
            )}
            {product.discount_percent > 0 && (
              <span className="absolute top-4 left-4 bg-berry-500 text-white text-sm font-semibold px-3 py-1.5 rounded-full">
                Save {product.discount_percent}%
              </span>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="lg:py-2">
          <Link
            to={`/store/${product.store_id}`}
            className="inline-flex items-center gap-1.5 text-sm text-ink/60 hover:text-berry-600 mb-3"
          >
            <Store size={14} /> {product.store_name}
          </Link>
          <h1 className="text-3xl sm:text-4xl font-semibold leading-tight mb-2">{product.name}</h1>
          {product.brand && <p className="text-ink/55 mb-3">{product.brand}</p>}

          {product.review_count > 0 && (
            <a href="#reviews" className="inline-flex items-center gap-2 mb-5">
              <Rating value={product.avg_rating} size={16} showCount={false} />
              <span className="text-sm text-ink/60 underline underline-offset-4">
                {product.avg_rating} · {product.review_count} reviews
              </span>
            </a>
          )}

          <div className="flex items-baseline gap-3 mb-6">
            <span className="text-3xl font-semibold">{formatPKR(product.final_price)}</span>
            {product.discount_percent > 0 && (
              <span className="text-ink/40 line-through text-lg">{formatPKR(product.price)}</span>
            )}
          </div>

          <p className="text-ink/70 leading-relaxed mb-7 line-clamp-4">{product.description}</p>

          {inStock ? (
            <>
              <div className="flex items-center gap-4 mb-5">
                <div className="flex items-center border border-ink/25 rounded-full">
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    aria-label="Decrease quantity"
                    className="p-3.5 hover:text-berry-600"
                  >
                    <Minus size={15} />
                  </button>
                  <span className="w-9 text-center font-semibold">{qty}</span>
                  <button
                    onClick={() => setQty((q) => Math.min(product.stock_quantity, q + 1))}
                    aria-label="Increase quantity"
                    className="p-3.5 hover:text-berry-600"
                  >
                    <Plus size={15} />
                  </button>
                </div>
                <span className={`text-sm ${lowStock ? "text-berry-600 font-semibold" : "text-ink/50"}`}>
                  {lowStock ? `Only ${product.stock_quantity} left in stock` : `${product.stock_quantity} in stock`}
                </span>
              </div>

              <div className="hidden lg:grid grid-cols-2 gap-3 mb-8">
                <Button variant="outline" onClick={handleAdd} disabled={adding}>
                  <ShoppingBag size={16} /> {adding ? "Adding..." : "Add to cart"}
                </Button>
                <Button variant="dark" onClick={handleBuyNow} disabled={adding}>
                  Buy it now
                </Button>
              </div>
            </>
          ) : (
            <p className="text-red-600 font-semibold mb-8">Currently sold out</p>
          )}

          <div className="grid sm:grid-cols-3 gap-3 mb-8 text-sm">
            {[
              { icon: ShieldCheck, text: "Fraud-screened checkout" },
              { icon: Truck, text: `Free shipping over ${formatPKR(FREE_SHIPPING_THRESHOLD)}` },
              { icon: Wallet, text: "Easypaisa, JazzCash, COD" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2.5 rounded-xl bg-petal px-4 py-3">
                <Icon size={17} className="text-berry-500 shrink-0" />
                <span className="font-medium leading-tight">{text}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-ink/10">
            <Accordion title="Description" defaultOpen>
              <p className="whitespace-pre-line">{product.description || "No description provided."}</p>
            </Accordion>
            <Accordion title="Shipping and payment">
              <p>
                Shipping is free on orders over {formatPKR(FREE_SHIPPING_THRESHOLD)}; below that it is a flat{" "}
                {formatPKR(SHIPPING_FEE)}. You can pay with Easypaisa, JazzCash, card or cash on delivery.
              </p>
            </Accordion>
            <Accordion title="Sold by">
              <p>
                This product is sold by{" "}
                <Link to={`/store/${product.store_id}`} className="underline underline-offset-4 hover:text-berry-600">
                  {product.store_name}
                </Link>
                , an independent boutique on CosmoStore.
              </p>
            </Accordion>
          </div>
        </div>
      </div>

      {/* Reviews */}
      <section id="reviews" className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 scroll-mt-28">
        <h2 className="text-2xl font-semibold mb-6">Customer reviews</h2>
        <div className="grid lg:grid-cols-[1fr_1.4fr] gap-10">
          <div>
            {product.review_count > 0 && (
              <div className="flex items-center gap-4 mb-6">
                <span className="font-display text-5xl font-semibold">{product.avg_rating}</span>
                <div>
                  <Rating value={product.avg_rating} size={18} showCount={false} />
                  <p className="text-sm text-ink/55 mt-1">{product.review_count} reviews</p>
                </div>
              </div>
            )}
            {user ? (
              <form onSubmit={handleReview} className="bg-white border border-ink/10 rounded-2xl p-5">
                <p className="font-semibold mb-2">Write a review</p>
                <div className="flex gap-1 mb-3">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button type="button" key={n} onClick={() => setReviewRating(n)} aria-label={`${n} stars`}>
                      <Rating value={n <= reviewRating ? 1 : 0} size={22} showCount={false} />
                    </button>
                  ))}
                </div>
                <TextArea
                  placeholder="Share your experience with this product..."
                  rows={3}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  className="mb-3"
                />
                <Button type="submit" variant="dark" disabled={submittingReview}>
                  {submittingReview ? "Posting..." : "Post review"}
                </Button>
              </form>
            ) : (
              <p className="text-sm text-ink/60">
                <Link to="/login" className="underline underline-offset-4 font-medium">Log in</Link> to write a review.
              </p>
            )}
          </div>

          <div>
            {product.reviews?.length ? (
              <div className="space-y-6">
                {product.reviews.map((r) => (
                  <div key={r.id} className="border-b border-ink/10 pb-6">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="font-semibold text-sm">{r.user_name}</p>
                      <span className="text-xs text-ink/45">{formatDate(r.created_at)}</span>
                    </div>
                    <Rating value={r.rating} size={14} showCount={false} />
                    {r.comment && <p className="text-sm text-ink/70 mt-2 leading-relaxed">{r.comment}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-ink/55 text-sm">No reviews yet. Be the first to share your thoughts.</p>
            )}
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-20">
          <h2 className="text-2xl font-semibold mb-8">You may also like</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 sm:gap-x-6 gap-y-10">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-20">
          <h2 className="text-2xl font-semibold mb-8">Recently viewed</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 sm:gap-x-6 gap-y-10">
            {recent.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* Sticky add-to-cart bar on mobile */}
      {inStock && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-ink/10 px-4 py-3 flex items-center gap-3">
          <div className="min-w-0">
            <p className="text-xs text-ink/55 truncate">{product.name}</p>
            <p className="font-semibold">{formatPKR(product.final_price * qty)}</p>
          </div>
          <Button variant="dark" onClick={handleAdd} disabled={adding} className="ml-auto shrink-0">
            <ShoppingBag size={16} /> {adding ? "Adding..." : "Add to cart"}
          </Button>
        </div>
      )}
    </div>
  );
}
