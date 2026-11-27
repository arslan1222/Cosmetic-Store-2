import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { wishlistApi } from "../api/endpoints";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";

const WishlistContext = createContext(null);

/** Saved items. Only customers have a wishlist; everyone else gets an inert version. */
export function WishlistProvider({ children }) {
  const { user } = useAuth();
  const toast = useToast();
  const [ids, setIds] = useState(() => new Set());

  const enabled = user?.role === "customer";

  useEffect(() => {
    if (!enabled) {
      setIds(new Set());
      return;
    }
    wishlistApi
      .list()
      .then((res) => setIds(new Set(res.data.data.product_ids)))
      .catch(() => {});
  }, [enabled, user?.id]);

  const has = useCallback((id) => ids.has(id), [ids]);

  const toggle = useCallback(
    async (productId) => {
      if (!enabled) {
        toast.info("Please log in to save items to your wishlist.");
        return;
      }
      const saved = ids.has(productId);
      // optimistic update, rolled back if the server says no
      setIds((prev) => {
        const next = new Set(prev);
        saved ? next.delete(productId) : next.add(productId);
        return next;
      });
      try {
        await (saved ? wishlistApi.remove(productId) : wishlistApi.add(productId));
        toast.success(saved ? "Removed from your wishlist." : "Saved to your wishlist.");
      } catch (err) {
        setIds((prev) => {
          const next = new Set(prev);
          saved ? next.add(productId) : next.delete(productId);
          return next;
        });
        toast.error(err.response?.data?.message || err.message);
      }
    },
    [enabled, ids, toast]
  );

  const value = useMemo(() => ({ has, toggle, count: ids.size, enabled }), [has, toggle, ids, enabled]);
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export const useWishlist = () => useContext(WishlistContext);
