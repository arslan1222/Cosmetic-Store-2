import { API_BASE } from "../api/client";

// Product images are stored either as absolute URLs or as paths served by the Flask backend.
export function resolveImage(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return API_BASE.replace(/\/api$/, "") + url;
}

// Free shipping threshold shared by the cart page, cart drawer and announcement bar.
export const FREE_SHIPPING_THRESHOLD = 5000;
export const SHIPPING_FEE = 150;
