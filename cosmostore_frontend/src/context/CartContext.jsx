import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

import { cartApi } from "../api/endpoints";
import { useAuth } from "./AuthContext";


const CartContext = createContext(null);


export function CartProvider({ children }) {

  const { user } = useAuth();

  const [items, setItems] = useState([]);
  const [subtotal, setSubtotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const openCart = () => setIsOpen(true);
  const closeCart = () => setIsOpen(false);


  // ============================================================
  // REFRESH CART
  // ============================================================

  const refreshCart = useCallback(async () => {

    if (!user) {
      setItems([]);
      setSubtotal(0);
      return;
    }

    setLoading(true);

    try {

      const res = await cartApi.get();

      setItems(res.data.data.items || []);
      setSubtotal(res.data.data.subtotal || 0);

    } catch (err) {

      console.error("Failed to load cart:", err);

      setItems([]);
      setSubtotal(0);

    } finally {

      setLoading(false);

    }

  }, [user]);


  // ============================================================
  // LOAD CART WHEN USER CHANGES
  // ============================================================

  useEffect(() => {

    refreshCart();

  }, [refreshCart]);


  // ============================================================
  // ADD TO CART
  // ============================================================

  const addToCart = async (productId, quantity = 1) => {

    await cartApi.add(productId, quantity);

    await refreshCart();

  };


  // ============================================================
  // UPDATE QUANTITY
  // ============================================================

  const updateQuantity = async (itemId, quantity) => {

    await cartApi.update(itemId, quantity);

    await refreshCart();

  };


  // ============================================================
  // REMOVE ITEM
  // ============================================================

  const removeItem = async (itemId) => {

    await cartApi.remove(itemId);

    await refreshCart();

  };


  // ============================================================
  // CLEAR CART
  // ============================================================

  const clearCart = async () => {

    await cartApi.clear();

    setItems([]);
    setSubtotal(0);

  };


  // ============================================================
  // TOTAL ITEM COUNT
  // ============================================================

  const itemCount = items.reduce(
    (sum, item) => sum + item.quantity,
    0
  );


  return (
    <CartContext.Provider
      value={{
        items,
        subtotal,
        itemCount,
        loading,
        isOpen,
        openCart,
        closeCart,
        refreshCart,
        addToCart,
        updateQuantity,
        removeItem,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}


export function useCart() {

  const ctx = useContext(CartContext);

  if (!ctx) {
    throw new Error(
      "useCart must be used within CartProvider"
    );
  }

  return ctx;
}