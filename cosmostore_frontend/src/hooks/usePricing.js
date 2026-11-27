import { useEffect, useState } from "react";
import { paymentsApi } from "../api/endpoints";
import { FREE_SHIPPING_THRESHOLD, SHIPPING_FEE } from "../utils/image";

// Defaults match the server's defaults, so first paint is right even before the request returns.
const DEFAULTS = { taxRate: 0, freeShippingThreshold: FREE_SHIPPING_THRESHOLD, shippingFee: SHIPPING_FEE };

let cached = null;
let inflight = null;

function load() {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = paymentsApi
      .pricing()
      .then((res) => {
        const d = res.data.data;
        cached = {
          taxRate: d.tax_rate,
          freeShippingThreshold: d.free_shipping_threshold,
          shippingFee: d.shipping_fee,
        };
        return cached;
      })
      .catch(() => DEFAULTS)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** The server's tax + shipping rules (single source of truth). */
export default function usePricing() {
  const [pricing, setPricing] = useState(cached || DEFAULTS);
  useEffect(() => {
    let alive = true;
    load().then((p) => alive && setPricing(p));
    return () => {
      alive = false;
    };
  }, []);

  /** Totals for a given subtotal, computed with the same rules as the backend. */
  const totals = (subtotal) => {
    const shipping = subtotal === 0 || subtotal >= pricing.freeShippingThreshold ? 0 : pricing.shippingFee;
    const tax = Math.round(subtotal * pricing.taxRate * 100) / 100;
    return { shipping, tax, total: subtotal + shipping + tax };
  };

  return { ...pricing, totals };
}
