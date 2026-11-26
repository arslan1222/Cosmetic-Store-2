import { Link } from "react-router-dom";
import { AtSign, Share2, MessageCircle, ShieldCheck, Truck, Wallet, Store } from "lucide-react";

const PERKS = [
  { icon: ShieldCheck, title: "Fraud-screened checkout", text: "Every order is checked before it ships" },
  { icon: Truck, title: "Free shipping over Rs 5,000", text: "Rs 150 flat rate below that" },
  { icon: Wallet, title: "Pay your way", text: "Easypaisa, JazzCash, card or cash" },
  { icon: Store, title: "Independent boutiques", text: "Sold by vetted local vendors" },
];

export default function Footer() {
  return (
    <footer className="mt-24">
      <div className="bg-petal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PERKS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0">
                <Icon size={18} className="text-berry-500" />
              </span>
              <div>
                <p className="font-semibold text-sm">{title}</p>
                <p className="text-sm text-ink/60">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-ink text-white/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 grid grid-cols-2 md:grid-cols-4 gap-10">
          <div className="col-span-2">
            <p className="font-display text-3xl font-semibold text-white mb-4">
              Cosmo<span className="text-berry-200">Store</span>
            </p>
            <p className="text-sm text-white/60 max-w-sm leading-relaxed">
              A marketplace of independent cosmetic boutiques across Pakistan, with fraud-screened
              checkout on every order.
            </p>
            <div className="flex gap-2 mt-5">
              {[
                { icon: AtSign, label: "Instagram" },
                { icon: Share2, label: "Facebook" },
                { icon: MessageCircle, label: "WhatsApp" },
              ].map(({ icon: Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center hover:bg-white hover:text-ink transition-colors"
                >
                  <Icon size={17} />
                </a>
              ))}
            </div>
          </div>

          <div>
            <p className="text-white font-semibold text-sm mb-4">Shop</p>
            <ul className="space-y-2.5 text-sm text-white/60">
              <li><Link to="/shop" className="hover:text-white">All products</Link></li>
              <li><Link to="/shop?sort=newest" className="hover:text-white">New arrivals</Link></li>
              <li><Link to="/stores" className="hover:text-white">Boutiques</Link></li>
              <li><Link to="/cart" className="hover:text-white">Your cart</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-white font-semibold text-sm mb-4">Sell with us</p>
            <ul className="space-y-2.5 text-sm text-white/60">
              <li><Link to="/register" className="hover:text-white">Become a vendor</Link></li>
              <li><Link to="/vendor" className="hover:text-white">Vendor dashboard</Link></li>
              <li><Link to="/account/profile" className="hover:text-white">Your account</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/45">
            <p>© {new Date().getFullYear()} CosmoStore. All rights reserved.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {["Easypaisa", "JazzCash", "Visa", "Cash on delivery"].map((m) => (
                <span key={m} className="px-3 py-1 rounded-full border border-white/15">{m}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
