import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { X, Minus, Plus, Trash2, ShoppingBag, ArrowRight } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { formatPKR } from "../utils/format";
import { resolveImage } from "../utils/image";
import { Button, FreeShippingBar } from "./ui";

export default function CartDrawer() {
  const { isOpen, closeCart, items, subtotal, itemCount, updateQuantity, removeItem } = useCart();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === "Escape" && closeCart();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen, closeCart]);

  if (!isOpen) return null;

  const go = (path) => {
    closeCart();
    navigate(path);
  };
  const fail = (e) => toast.error(e.message);

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Shopping cart">
      <div className="absolute inset-0 bg-ink/50 animate-fade-in" onClick={closeCart} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-white flex flex-col animate-drawer-right shadow-lift">
        <header className="flex items-center justify-between px-6 h-16 border-b border-ink/10 shrink-0">
          <h2 className="font-display text-lg">
            Your cart {itemCount > 0 && <span className="text-ink/45 font-sans text-sm">({itemCount})</span>}
          </h2>
          <button type="button" onClick={closeCart} aria-label="Close cart" className="p-1 text-ink/60 hover:text-ink">
            <X size={22} />
          </button>
        </header>

        {!user ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <ShoppingBag size={32} className="text-berry-500 mb-4" />
            <p className="font-display text-lg mb-1">Log in to see your cart</p>
            <p className="text-sm text-ink/60 mb-6">Your cart is saved to your account.</p>
            <Button variant="dark" onClick={() => go("/login")}>Log in</Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <ShoppingBag size={32} className="text-berry-500 mb-4" />
            <p className="font-display text-lg mb-1">Your cart is empty</p>
            <p className="text-sm text-ink/60 mb-6">Find something you'll love in the catalog.</p>
            <Button variant="dark" onClick={() => go("/shop")}>Start shopping</Button>
          </div>
        ) : (
          <>
            <div className="px-6 py-4 border-b border-ink/10 shrink-0">
              <FreeShippingBar subtotal={subtotal} />
            </div>

            <ul className="flex-1 overflow-y-auto px-6 divide-y divide-ink/10">
              {items.map((item) => {
                const image = resolveImage(item.product.image_url);
                return (
                  <li key={item.id} className="flex gap-4 py-5">
                    <Link
                      to={`/product/${item.product.id}`}
                      onClick={closeCart}
                      className="w-20 h-24 rounded-xl overflow-hidden bg-petal shrink-0"
                    >
                      {image ? (
                        <img src={image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center font-display text-2xl text-ink/20">
                          {item.product.name[0]}
                        </span>
                      )}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-3">
                        <Link
                          to={`/product/${item.product.id}`}
                          onClick={closeCart}
                          className="text-sm font-medium leading-snug line-clamp-2 hover:text-berry-600"
                        >
                          {item.product.name}
                        </Link>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id).catch(fail)}
                          aria-label={`Remove ${item.product.name}`}
                          className="text-ink/35 hover:text-red-600 shrink-0"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <p className="text-xs text-ink/50 mt-0.5">{item.product.store_name}</p>
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center border border-ink/15 rounded-full">
                          <button
                            type="button"
                            aria-label="Decrease quantity"
                            onClick={() =>
                              item.quantity > 1
                                ? updateQuantity(item.id, item.quantity - 1).catch(fail)
                                : removeItem(item.id).catch(fail)
                            }
                            className="p-2 hover:text-berry-600"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="w-6 text-center text-sm">{item.quantity}</span>
                          <button
                            type="button"
                            aria-label="Increase quantity"
                            onClick={() => updateQuantity(item.id, item.quantity + 1).catch(fail)}
                            className="p-2 hover:text-berry-600"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                        <span className="font-semibold text-sm">{formatPKR(item.subtotal)}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <footer className="px-6 py-5 border-t border-ink/10 shrink-0 bg-cream/60">
              <div className="flex justify-between font-semibold mb-1">
                <span>Subtotal</span>
                <span>{formatPKR(subtotal)}</span>
              </div>
              <p className="text-xs text-ink/50 mb-4">Shipping and payment method are chosen at checkout.</p>
              <Button variant="dark" className="w-full" onClick={() => go("/checkout")}>
                Checkout <ArrowRight size={16} />
              </Button>
              <button
                type="button"
                onClick={() => go("/cart")}
                className="block w-full text-center text-sm text-ink/60 hover:text-berry-600 mt-3 underline underline-offset-4"
              >
                View full cart
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
