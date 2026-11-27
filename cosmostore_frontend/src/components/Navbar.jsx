import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ShoppingBag,
  Search,
  User,
  Menu,
  X,
  LogOut,
  LayoutDashboard,
  Store,
  ChevronDown,
  ArrowRight,
  Heart,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { catalogApi } from "../api/endpoints";
import heroImage from "../assets/hero.png";
import NotificationBell from "./NotificationBell";
import SearchDrawer from "./SearchDrawer";

const NAV_LINKS = [
  { to: "/shop?sort=newest", label: "New arrivals" },
  { to: "/stores", label: "Boutiques" },
];

function Logo({ to }) {
  return (
    <Link to={to} className="font-display text-[26px] font-semibold tracking-tight leading-none shrink-0">
      Cosmo<span className="text-berry-500">Store</span>
    </Link>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const { itemCount, openCart } = useCart();
  const wishlist = useWishlist();
  const navigate = useNavigate();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const accountRef = useRef(null);

  const isStaff = user?.role === "admin" || user?.role === "vendor";

  useEffect(() => {
    if (isStaff) return;
    catalogApi
      .categories()
      .then((res) => setCategories(res.data.data))
      .catch(() => {});
  }, [isStaff]);

  // Close everything when the route changes
  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
    setMegaOpen(false);
  }, [location.pathname, location.search]);

  // Click outside closes the account dropdown
  useEffect(() => {
    if (!accountOpen) return;
    const onDown = (e) => {
      if (accountRef.current && !accountRef.current.contains(e.target)) setAccountOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [accountOpen]);

  // Lock scroll behind the mobile menu
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setAccountOpen(false);
      setMenuOpen(false);
      navigate("/login", { replace: true });
    }
  };

  const dashboardPath =
    user?.role === "admin" ? "/admin" : user?.role === "vendor" ? "/vendor" : "/account/orders";

  const accountMenu = (
    <div ref={accountRef} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setAccountOpen((o) => !o)}
        aria-label="Account"
        aria-expanded={accountOpen}
        className="p-2 text-ink/80 hover:text-berry-500 transition-colors"
      >
        <User size={21} />
      </button>

      {accountOpen && (
        <div className="absolute right-0 mt-2 w-60 bg-white border border-ink/10 rounded-2xl shadow-lift py-2 text-sm animate-drop-in z-50">
          {user ? (
            <>
              <div className="px-4 py-2.5 border-b border-ink/10">
                <p className="font-semibold truncate">{user.full_name}</p>
                <p className="text-ink/50 text-xs capitalize">{user.role}</p>
              </div>
              <Link to={dashboardPath} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-cream">
                {user.role === "vendor" ? <Store size={15} /> : <LayoutDashboard size={15} />}
                {user.role === "customer" ? "My orders" : "Dashboard"}
              </Link>
              {user.role === "customer" && (
                <Link to="/account/wishlist" className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-cream">
                  <Heart size={15} /> Wishlist
                </Link>
              )}
              <Link to="/account/profile" className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-cream">
                <User size={15} /> Profile
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2.5 px-4 py-2.5 w-full text-left hover:bg-cream text-berry-600"
              >
                <LogOut size={15} /> Log out
              </button>
            </>
          ) : (
            <div className="p-3 space-y-2">
              <Link to="/login" className="block text-center rounded-full bg-ink text-white py-2.5 font-semibold hover:bg-berry-500 transition-colors">
                Log in
              </Link>
              <Link to="/register" className="block text-center rounded-full border border-ink/20 py-2.5 font-semibold hover:border-ink transition-colors">
                Create account
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ---------------------------------------------------------------------
  // Staff (admin / vendor): minimal bar, no storefront chrome
  // ---------------------------------------------------------------------
  if (isStaff) {
    return (
      <header className="sticky top-0 z-50 bg-white border-b border-ink/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Logo to={dashboardPath} />
          <div className="hidden md:flex items-center gap-2 text-sm font-medium text-ink/50">
            {user.role === "admin" ? <LayoutDashboard size={15} /> : <Store size={15} />}
            {user.role === "admin" ? "Admin dashboard" : "Vendor dashboard"}
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            {accountMenu}
            <button
              type="button"
              onClick={handleLogout}
              className="sm:hidden p-2 text-berry-600"
              aria-label="Log out"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>
    );
  }

  // ---------------------------------------------------------------------
  // Storefront
  // ---------------------------------------------------------------------
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-ink/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center h-[68px]">
          {/* Left: nav (desktop) / hamburger (mobile) */}
          <div className="flex items-center">
            <button
              type="button"
              className="lg:hidden p-2 -ml-2 text-ink/80"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={24} />
            </button>

            <nav className="hidden lg:flex items-center gap-8 text-[15px] font-medium">
              <div
                className="relative"
                onMouseEnter={() => setMegaOpen(true)}
                onMouseLeave={() => setMegaOpen(false)}
              >
                <NavLink
                  to="/shop"
                  end
                  className="flex items-center gap-1 h-[68px] hover:text-berry-500 transition-colors"
                  onFocus={() => setMegaOpen(true)}
                >
                  Shop <ChevronDown size={14} className={`transition-transform ${megaOpen ? "rotate-180" : ""}`} />
                </NavLink>
              </div>
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.label}
                  to={link.to}
                  className="hover:text-berry-500 transition-colors"
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Center: logo */}
          <Logo to="/" />

          {/* Right: actions */}
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              className="p-2 text-ink/80 hover:text-berry-500 transition-colors"
            >
              <Search size={21} />
            </button>
            <NotificationBell />
            <Link
              to="/account/wishlist"
              aria-label={`Wishlist, ${wishlist?.count || 0} saved items`}
              className="relative hidden sm:block p-2 text-ink/80 hover:text-berry-500 transition-colors"
            >
              <Heart size={21} />
              {wishlist?.count > 0 && (
                <span className="absolute top-0 right-0 bg-berry-500 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center">
                  {wishlist.count}
                </span>
              )}
            </Link>
            {accountMenu}
            <button
              type="button"
              onClick={openCart}
              aria-label={`Open cart, ${itemCount} items`}
              className="relative p-2 text-ink/80 hover:text-berry-500 transition-colors"
            >
              <ShoppingBag size={21} />
              {itemCount > 0 && (
                <span className="absolute top-0 right-0 bg-berry-500 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center">
                  {itemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mega menu */}
      {megaOpen && (
        <div
          className="hidden lg:block absolute left-0 right-0 top-full bg-white border-b border-ink/10 shadow-lift animate-drop-in"
          onMouseEnter={() => setMegaOpen(true)}
          onMouseLeave={() => setMegaOpen(false)}
        >
          <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-[1fr_1fr_320px] gap-10">
            <div>
              <p className="text-sm text-ink/50 mb-3">Shop by category</p>
              <ul className="space-y-2.5">
                {categories.map((c) => (
                  <li key={c.id}>
                    <Link to={`/shop?category_id=${c.id}`} className="font-medium hover:text-berry-500 transition-colors">
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm text-ink/50 mb-3">Browse</p>
              <ul className="space-y-2.5">
                <li><Link to="/shop" className="font-medium hover:text-berry-500">All products</Link></li>
                <li><Link to="/shop?sort=newest" className="font-medium hover:text-berry-500">New arrivals</Link></li>
                <li><Link to="/shop?sort=price_asc" className="font-medium hover:text-berry-500">Price: low to high</Link></li>
                <li><Link to="/stores" className="font-medium hover:text-berry-500">Boutiques</Link></li>
              </ul>
            </div>
            <Link
              to="/shop?sort=newest"
              className="group relative rounded-2xl overflow-hidden aspect-[16/10] block"
            >
              <img src={heroImage} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <span className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent" />
              <span className="absolute bottom-4 left-4 right-4 text-white">
                <span className="block font-display text-lg leading-tight">Just landed from our boutiques</span>
                <span className="inline-flex items-center gap-1 text-sm mt-1">Shop new arrivals <ArrowRight size={14} /></span>
              </span>
            </Link>
          </div>
        </div>
      )}

      <SearchDrawer open={searchOpen} onClose={() => setSearchOpen(false)} categories={categories} />

      {/* Mobile menu drawer */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-ink/50 animate-fade-in" onClick={() => setMenuOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-[88%] max-w-sm bg-white flex flex-col animate-drawer-left">
            <div className="flex items-center justify-between px-5 h-[68px] border-b border-ink/10 shrink-0">
              <Logo to="/" />
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="p-1">
                <X size={24} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <p className="text-sm text-ink/50 mb-2">Shop by category</p>
              <ul className="mb-6">
                <li>
                  <Link to="/shop" className="block py-2.5 font-medium">All products</Link>
                </li>
                {categories.map((c) => (
                  <li key={c.id}>
                    <Link to={`/shop?category_id=${c.id}`} className="block py-2.5 font-medium">
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="border-t border-ink/10 pt-4">
                {NAV_LINKS.map((l) => (
                  <Link key={l.label} to={l.to} className="block py-2.5 font-medium">{l.label}</Link>
                ))}
              </div>
            </div>
            <div className="border-t border-ink/10 px-5 py-4 shrink-0 space-y-2">
              {user ? (
                <>
                  <Link to={dashboardPath} className="block py-2 font-medium">My orders</Link>
                  <Link to="/account/profile" className="block py-2 font-medium">Profile</Link>
                  <button type="button" onClick={handleLogout} className="block py-2 font-medium text-berry-600">
                    Log out
                  </button>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Link to="/login" className="text-center rounded-full bg-ink text-white py-3 font-semibold">Log in</Link>
                  <Link to="/register" className="text-center rounded-full border border-ink/25 py-3 font-semibold">Sign up</Link>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </header>
  );
}
