import { Link, useNavigate } from "react-router-dom";
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { formatPKR } from "../utils/format";
import { Button, EmptyState, PageSpinner, Breadcrumbs, FreeShippingBar } from "../components/ui";
import { resolveImage, FREE_SHIPPING_THRESHOLD, SHIPPING_FEE } from "../utils/image";

export default function Cart() {
  const { items, subtotal, loading, updateQuantity, removeItem } = useCart();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const shippingFee = subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : SHIPPING_FEE;
  const discountTotal = items.reduce(
    (sum, item) => sum + (Number(item.product.price) - Number(item.product.final_price)) * item.quantity,
    0
  );
  const taxTotal = 0;
  const total = subtotal + shippingFee + taxTotal;

  if (!user) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <EmptyState
          icon={ShoppingBag}
          title="Log in to see your cart"
          description="Your cart is saved to your account."
          action={<Button as={Link} to="/login" variant="dark">Log in</Button>}
        />
      </div>
    );
  }

  if (loading) return <PageSpinner />;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Cart" }]} />
      <h1 className="text-4xl font-semibold mt-3 mb-8">Your cart</h1>

      {items.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          description="Explore the catalog to find something you'll love."
          action={<Button as={Link} to="/shop" variant="dark">Start shopping</Button>}
        />
      ) : (
        <div className="grid lg:grid-cols-[1fr_360px] gap-10">
          <div className="space-y-4">
            <div className="bg-petal rounded-2xl p-5">
              <FreeShippingBar subtotal={subtotal} />
            </div>
            {items.map((item) => {
              const image = resolveImage(item.product.image_url);
              return (
                <div key={item.id} className="flex gap-4 bg-white border border-ink/10 rounded-2xl p-4">
                  <Link
                    to={`/product/${item.product.id}`}
                    className="w-24 h-28 rounded-xl overflow-hidden bg-petal shrink-0"
                  >
                    {image ? (
                      <img src={image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-display text-ink/20 text-2xl">
                        {item.product.name[0]}
                      </div>
                    )}
                  </Link>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-3">
                      <Link to={`/product/${item.product.id}`} className="font-medium hover:text-berry-600 truncate">
                        {item.product.name}
                      </Link>
                      <button
                        onClick={() => removeItem(item.id).catch((e) => toast.error(e.message))}
                        className="text-ink/30 hover:text-red-600 shrink-0"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <p className="text-xs text-ink/50 mb-3">{item.product.store_name}</p>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center border border-ink/15 rounded-full">
                        <button
                          onClick={() =>
                            item.quantity > 1
                              ? updateQuantity(item.id, item.quantity - 1).catch((e) => toast.error(e.message))
                              : removeItem(item.id).catch((e) => toast.error(e.message))
                          }
                          className="p-2 hover:text-berry-600"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="w-6 text-center text-sm">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1).catch((e) => toast.error(e.message))}
                          className="p-2 hover:text-berry-600"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      <span className="font-medium">{formatPKR(item.subtotal)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div className="bg-white border border-ink/10 rounded-3xl p-6 h-fit sticky top-28">
            <h2 className="font-display text-xl mb-5">Order summary</h2>
            <div className="space-y-2.5 text-sm mb-5">
              <div className="flex justify-between text-ink/70">
                <span>Subtotal</span>
                <span>{formatPKR(subtotal + discountTotal)}</span>
              </div>
              {discountTotal > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount</span>
                  <span>-{formatPKR(discountTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-ink/70">
                <span>Tax</span>
                <span>Rs 0</span>
              </div>
              <div className="flex justify-between text-ink/70">
                <span>Shipping</span>
                <span>{shippingFee === 0 ? "Free" : formatPKR(shippingFee)}</span>
              </div>
            </div>
            <div className="flex justify-between font-semibold text-lg border-t border-ink/10 pt-4 mb-6">
              <span>Total</span>
              <span>{formatPKR(total)}</span>
            </div>
            <Button variant="dark" onClick={() => navigate("/checkout")} className="w-full">
              Checkout <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
