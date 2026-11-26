import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { PageSpinner } from "./ui";

export function RequireAuth({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
}

/**
 * Wraps customer-facing storefront/shopping routes (home, shop, product,
 * stores, cart, checkout, order history). Admins and vendors run the
 * platform, they don't shop on it - so if one of them is logged in and
 * lands on one of these routes (e.g. by typing the URL directly), send
 * them back to their own dashboard instead of letting the page render.
 * Guests and customers pass through untouched.
 */
export function CustomerOnly({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <PageSpinner />;
  if (user?.role === "admin") return <Navigate to="/admin" replace />;
  if (user?.role === "vendor") return <Navigate to="/vendor" replace />;

  return children;
}
