import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { ToastProvider } from "./context/ToastContext";
import Layout from "./components/Layout";
import { RequireAuth, CustomerOnly } from "./components/RequireAuth";

import Home from "./pages/Home";
import Shop from "./pages/Shop";
import ProductDetail from "./pages/ProductDetail";
import Stores from "./pages/Stores";
import StoreDetail from "./pages/StoreDetail";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import OrderConfirmation from "./pages/OrderConfirmation";
import Login from "./pages/Login";
import Register from "./pages/Register";
import OrderHistory from "./pages/OrderHistory";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";

import VendorDashboard from "./pages/vendor/VendorDashboard";
import AdminDashboard from "./pages/admin/AdminDashboard";

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <CartProvider>
          <Layout>
            <Routes>
              {/* Storefront: open to guests and customers. Admins/vendors
                  who navigate here are redirected to their own dashboard. */}
              <Route path="/" element={<CustomerOnly><Home /></CustomerOnly>} />
              <Route path="/shop" element={<CustomerOnly><Shop /></CustomerOnly>} />
              <Route path="/product/:id" element={<CustomerOnly><ProductDetail /></CustomerOnly>} />
              <Route path="/stores" element={<CustomerOnly><Stores /></CustomerOnly>} />
              <Route path="/store/:id" element={<CustomerOnly><StoreDetail /></CustomerOnly>} />
              <Route path="/cart" element={<CustomerOnly><Cart /></CustomerOnly>} />

              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* Checkout & order flow: customers only. Admins/vendors don't
                  place orders on the platform they run. */}
              <Route
                path="/checkout"
                element={
                  <RequireAuth roles={["customer"]}>
                    <Checkout />
                  </RequireAuth>
                }
              />
              <Route
                path="/order-confirmation/:id"
                element={
                  <RequireAuth roles={["customer"]}>
                    <OrderConfirmation />
                  </RequireAuth>
                }
              />
              <Route
                path="/account/orders"
                element={
                  <RequireAuth roles={["customer"]}>
                    <OrderHistory />
                  </RequireAuth>
                }
              />

              {/* Account settings: fine for any logged-in role */}
              <Route
                path="/account/profile"
                element={
                  <RequireAuth roles={["customer", "vendor", "admin"]}>
                    <Profile />
                  </RequireAuth>
                }
              />

              <Route
                path="/vendor"
                element={
                  <RequireAuth roles={["vendor"]}>
                    <VendorDashboard />
                  </RequireAuth>
                }
              />

              <Route
                path="/admin"
                element={
                  <RequireAuth roles={["admin"]}>
                    <AdminDashboard />
                  </RequireAuth>
                }
              />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </CartProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
