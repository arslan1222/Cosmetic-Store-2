import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X, Minus, Plus, ShoppingBag, ArrowRight, Heart } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useWishlist } from "../context/WishlistContext";
import { formatPKR } from "../utils/format";
import { resolveImage } from "../utils/image";
import { Button, Rating } from "./ui";

/** Product quick view: look at a product and add it to the cart without leaving the page. */
export default function QuickView({ product, onClose }) {
  const { addToCart, openCart } = useCart();
  const { user } = useAuth();
  const toast = useToast();
  const wishlist = useWishlist();
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);

  const gallery = product.images?.length ? product.images.map((i) => i.image_url) : [product.image_url].filter(Boolean);
  const [active, setActive] = useState(gallery[0] || null);
  const soldOut = product.stock_quantity === 0;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const add = async () => {
    if (!user) {
      toast.info("Please log in to add items to your cart.");
      return;
    }
    setAdding(true);
    try {
      await addToCart(product.id, qty);
      onClose();
      openCart();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAdding(false);
    }
  };

  const img = resolveImage(active);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Quick view: ${product.name}`}>
      <div className="absolute inset-0 bg-ink/55 animate-fade-in" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-lift w-full max-w-4xl max-h-[92vh] overflow-y-auto grid md:grid-cols-2 animate-fade-in">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close quick view"
          className="absolute right-4 top-4 z-10 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center hover:bg-petal"
        >
          <X size={18} />
        </button>

        <div className="bg-petal md:rounded-l-3xl">
          <div className="aspect-[4/5] overflow-hidden md:rounded-tl-3xl">
            {img ? (
              <img src={img} alt={product.name} className="w-full h-full object-cover" />
            ) : (
              <span className="w-full h-full flex items-center justify-center font-display text-7xl text-ink/15">{product.name[0]}</span>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="flex gap-2 p-3 overflow-x-auto">
              {gallery.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setActive(g)}
                  className={`w-14 h-16 rounded-lg overflow-hidden border-2 shrink-0 ${active === g ? "border-ink" : "border-transparent opacity-70"}`}
                  aria-label="Show image"
                >
                  <img src={resolveImage(g)} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 sm:p-8 flex flex-col">
          <p className="text-sm text-ink/55 mb-1">{product.brand || product.store_name}</p>
          <h2 className="text-2xl font-semibold leading-tight mb-2 pr-8">{product.name}</h2>
          {product.review_count > 0 && <Rating value={product.avg_rating} count={product.review_count} size={14} />}

          <div className="flex items-baseline gap-3 my-4">
            <span className="text-2xl font-semibold">{formatPKR(product.final_price)}</span>
            {product.discount_percent > 0 && (
              <>
                <span className="text-ink/40 line-through">{formatPKR(product.price)}</span>
                <span className="text-xs font-semibold bg-berry-500 text-white px-2 py-0.5 rounded-full">Save {product.discount_percent}%</span>
              </>
            )}
          </div>

          <p className="text-sm text-ink/70 leading-relaxed line-clamp-5 mb-6">{product.description || "No description provided."}</p>

          {soldOut ? (
            <p className="text-red-600 font-semibold">Currently sold out</p>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center border border-ink/25 rounded-full">
                  <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" className="p-3 hover:text-berry-600"><Minus size={14} /></button>
                  <span className="w-8 text-center font-semibold">{qty}</span>
                  <button type="button" onClick={() => setQty((q) => Math.min(product.stock_quantity, q + 1))} aria-label="Increase quantity" className="p-3 hover:text-berry-600"><Plus size={14} /></button>
                </div>
                <Button type="button" variant="dark" onClick={add} disabled={adding} className="flex-1">
                  <ShoppingBag size={16} /> {adding ? "Adding..." : "Add to cart"}
                </Button>
                {wishlist && (
                  <button
                    type="button"
                    onClick={() => wishlist.toggle(product.id)}
                    aria-label={wishlist.has(product.id) ? "Remove from wishlist" : "Save to wishlist"}
                    className="w-11 h-11 rounded-full border border-ink/20 flex items-center justify-center hover:border-ink"
                  >
                    <Heart size={18} className={wishlist.has(product.id) ? "fill-berry-500 text-berry-500" : ""} />
                  </button>
                )}
              </div>
            </>
          )}

          <Link to={`/product/${product.id}`} onClick={onClose} className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-berry-600 hover:underline pt-4">
            View full details <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
