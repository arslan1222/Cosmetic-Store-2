import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Loader2 } from "lucide-react";
import { formatPKR } from "../utils/format";
import { resolveImage } from "../utils/image";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Rating } from "./ui";

// Soft tile colours so the catalog still looks curated before real photography is uploaded.
const TILES = ["bg-petal", "bg-sage", "bg-[#F3E3D6]", "bg-[#E9E4EE]"];

export default function ProductCard({ product, className = "" }) {
  const image = resolveImage(product.image_url);
  const hasDiscount = product.discount_percent > 0;
  const soldOut = product.stock_quantity === 0;
  const lowStock = product.stock_quantity > 0 && product.stock_quantity <= 5;
  const href = `/product/${product.id}`;

  const { addToCart, openCart } = useCart();
  const { user } = useAuth();
  const toast = useToast();
  const [adding, setAdding] = useState(false);

  const quickAdd = async () => {
    if (!user) {
      toast.info("Please log in to add items to your cart.");
      return;
    }
    setAdding(true);
    try {
      await addToCart(product.id, 1);
      openCart();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className={`group ${className}`}>
      <div className={`relative aspect-[4/5] rounded-2xl overflow-hidden ${TILES[product.id % TILES.length]} mb-3.5`}>
        <Link to={href} className="absolute inset-0" aria-label={product.name}>
          {image ? (
            <img
              src={image}
              alt={product.name}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            />
          ) : (
            <span className="w-full h-full flex items-center justify-center font-display text-6xl text-ink/15">
              {product.name?.[0]}
            </span>
          )}
        </Link>

        <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5 pointer-events-none">
          {hasDiscount && (
            <span className="bg-berry-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
              Save {product.discount_percent}%
            </span>
          )}
          {lowStock && (
            <span className="bg-white/90 text-ink text-xs font-medium px-2.5 py-1 rounded-full backdrop-blur">
              Only {product.stock_quantity} left
            </span>
          )}
        </div>

        {soldOut ? (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center pointer-events-none">
            <span className="bg-ink text-white text-xs font-semibold px-3.5 py-1.5 rounded-full">Sold out</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={quickAdd}
            disabled={adding}
            aria-label={`Quick add ${product.name} to cart`}
            className="absolute bottom-3 right-3 lg:right-3 lg:left-3 h-10 lg:h-11 w-10 lg:w-auto rounded-full bg-white text-ink shadow-soft flex items-center justify-center gap-2 text-sm font-semibold
                       hover:bg-ink hover:text-white transition-all duration-300
                       lg:opacity-0 lg:translate-y-2 lg:group-hover:opacity-100 lg:group-hover:translate-y-0 lg:focus-visible:opacity-100 lg:focus-visible:translate-y-0 disabled:opacity-70"
          >
            {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            <span className="hidden lg:inline">{adding ? "Adding..." : "Quick add"}</span>
          </button>
        )}
      </div>

      <Link to={href} className="block">
        <p className="text-xs text-ink/55 mb-0.5 truncate">{product.brand || product.store_name}</p>
        <h3 className="font-sans font-medium text-[15px] leading-snug line-clamp-2 group-hover:text-berry-600 transition-colors">
          {product.name}
        </h3>
        <div className="flex items-baseline gap-2 mt-1.5">
          <span className="font-semibold">{formatPKR(product.final_price)}</span>
          {hasDiscount && <span className="text-ink/40 text-sm line-through">{formatPKR(product.price)}</span>}
        </div>
        {product.review_count > 0 && (
          <div className="mt-1">
            <Rating value={product.avg_rating} count={product.review_count} size={12} />
          </div>
        )}
      </Link>
    </div>
  );
}
