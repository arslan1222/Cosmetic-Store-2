import { Link } from "react-router-dom";
import { Loader2, Star, ChevronRight, Truck } from "lucide-react";
import { STATUS_STYLES, statusLabel, formatPKR } from "../utils/format";
import { FREE_SHIPPING_THRESHOLD } from "../utils/image";

export function Spinner({ size = 20, className = "" }) {
  return <Loader2 size={size} className={`animate-spin text-berry-500 ${className}`} />;
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center py-32">
      <Spinner size={28} />
    </div>
  );
}

export function StatusBadge({ status }) {
  return (
    <span
      className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium capitalize ${
        STATUS_STYLES[status] || "bg-gray-100 text-gray-700"
      }`}
    >
      {statusLabel(status)}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center text-center py-20 px-4">
      {Icon && (
        <div className="w-16 h-16 rounded-full bg-petal flex items-center justify-center mb-5">
          <Icon size={26} className="text-berry-500" />
        </div>
      )}
      <h3 className="font-display text-xl text-ink mb-1">{title}</h3>
      {description && <p className="text-ink/60 text-sm max-w-sm mb-6">{description}</p>}
      {action}
    </div>
  );
}

export function Button({ as: Comp = "button", variant = "primary", className = "", children, ...props }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-berry-500 text-white hover:bg-berry-600",
    dark: "bg-ink text-white hover:bg-berry-500",
    secondary: "bg-ink text-cream hover:bg-ink/85",
    light: "bg-white text-ink hover:bg-petal",
    outline: "border border-ink/25 text-ink hover:border-ink hover:bg-ink hover:text-white",
    ghost: "text-ink/70 hover:text-berry-600",
    danger: "bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <Comp className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </Comp>
  );
}

const fieldBase =
  "w-full bg-white border rounded-xl px-4 py-3 text-sm outline-none transition-colors placeholder:text-ink/35";

export function Input({ label, error, className = "", ...props }) {
  return (
    <label className="block">
      {label && <span className="block text-sm font-medium text-ink/80 mb-1.5">{label}</span>}
      <input
        className={`${fieldBase} ${error ? "border-red-400" : "border-ink/15 focus:border-berry-400"} ${className}`}
        {...props}
      />
      {error && <span className="block text-xs text-red-600 mt-1">{error}</span>}
    </label>
  );
}

export function Select({ label, className = "", children, ...props }) {
  return (
    <label className="block">
      {label && <span className="block text-sm font-medium text-ink/80 mb-1.5">{label}</span>}
      <select className={`${fieldBase} border-ink/15 focus:border-berry-400 ${className}`} {...props}>
        {children}
      </select>
    </label>
  );
}

export function TextArea({ label, className = "", ...props }) {
  return (
    <label className="block">
      {label && <span className="block text-sm font-medium text-ink/80 mb-1.5">{label}</span>}
      <textarea className={`${fieldBase} border-ink/15 focus:border-berry-400 ${className}`} {...props} />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Storefront building blocks
// ---------------------------------------------------------------------------

export function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-ink/55">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <span key={`${item.label}-${i}`} className="flex items-center gap-1">
            {item.to && !last ? (
              <Link to={item.to} className="hover:text-berry-600 transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className={last ? "text-ink" : ""} aria-current={last ? "page" : undefined}>
                {item.label}
              </span>
            )}
            {!last && <ChevronRight size={13} className="text-ink/30" />}
          </span>
        );
      })}
    </nav>
  );
}

export function Rating({ value = 0, count, size = 13, showCount = true }) {
  const rounded = Math.round(Number(value) || 0);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex" aria-label={`${value} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            size={size}
            className={n <= rounded ? "fill-gold-500 text-gold-500" : "text-ink/20"}
          />
        ))}
      </span>
      {showCount && count > 0 && <span className="text-xs text-ink/55">({count})</span>}
    </span>
  );
}

// Progress toward free shipping. Used in the cart page and the slide-out cart.
export function FreeShippingBar({ subtotal, className = "" }) {
  if (!subtotal) return null;
  const remaining = Math.max(FREE_SHIPPING_THRESHOLD - subtotal, 0);
  const pct = Math.min((subtotal / FREE_SHIPPING_THRESHOLD) * 100, 100);
  return (
    <div className={className}>
      <p className="flex items-center gap-2 text-sm mb-2">
        <Truck size={16} className="text-berry-500" />
        {remaining === 0 ? (
          <span className="font-medium">You've unlocked free shipping.</span>
        ) : (
          <span>
            Add <b>{formatPKR(remaining)}</b> more for free shipping
          </span>
        )}
      </p>
      <div className="h-1.5 rounded-full bg-ink/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-berry-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
