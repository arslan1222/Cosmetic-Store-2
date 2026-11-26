import Navbar from "./Navbar";
import Footer from "./Footer";
import AnnouncementBar from "./AnnouncementBar";
import CartDrawer from "./CartDrawer";
import BackToTop from "./BackToTop";
import { useAuth } from "../context/AuthContext";

export default function Layout({ children }) {
  const { user } = useAuth();
  // Admin/vendor dashboards are internal tools, not the shopfront -- the
  // marketing chrome (announcement bar, cart drawer, footer) doesn't belong there.
  const isStaff = user?.role === "admin" || user?.role === "vendor";

  return (
    <div className="min-h-screen flex flex-col">
      {!isStaff && <AnnouncementBar />}
      <Navbar />
      <main className="flex-1 page-enter">{children}</main>
      {!isStaff && <Footer />}
      {!isStaff && <CartDrawer />}
      {!isStaff && <BackToTop />}
    </div>
  );
}
