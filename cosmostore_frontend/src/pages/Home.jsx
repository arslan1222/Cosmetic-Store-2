import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ShieldCheck,
  Store,
  Truck,
  Wallet,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Droplets,
  Brush,
  Flower2,
  Eye,
  Palette,
} from "lucide-react";
import { catalogApi } from "../api/endpoints";
import heroImage from "../assets/hero.png";
import ProductCard from "../components/ProductCard";
import Pagination from "../components/Pagination";
import { PageSpinner } from "../components/ui";
import { resolveImage } from "../utils/image";

import foundationImg from "../assets/Foundation.jpg";
import concealerImg from "../assets/Concealer.jpg";
import blushImg from "../assets/Blush.jpg";
import mascaraImg from "../assets/Mascara.jpg";
import skincareImg from "../assets/Skincare.jpg";
import lipstickImg from "../assets/Lipstick.jpg";


const CATEGORY_IMAGES = {
  Foundation: foundationImg,
  Lipstick: lipstickImg,
  Concealer: concealerImg,
  Blush: blushImg,
  Mascara: mascaraImg,
  Skincare: skincareImg,
};

const PER_PAGE = 8;

const TRUST = [
  { icon: ShieldCheck, text: "Fraud-screened checkout" },
  { icon: Store, text: "Independent local vendors" },
  { icon: Truck, text: "Free shipping over Rs 5,000" },
  { icon: Wallet, text: "Easypaisa, JazzCash & COD" },
];

const STEPS = [
  { title: "You place your order", text: "Pick your payment method and confirm. It takes under a minute." },
  { title: "We screen it in real time", text: "Our fraud model checks the order for risk signals before the vendor sees it." },
  { title: "It's confirmed or reviewed", text: "Genuine orders go straight through. Unusual ones get a quick human check." },
];

export default function Home() {
  const [categories, setCategories] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [deals, setDeals] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const productsRef = useRef(null);
  const dealsRef = useRef(null);

  useEffect(() => {
    catalogApi.categories().then((res) => setCategories(res.data.data)).catch(() => {});
    catalogApi.stores().then((res) => setStores(res.data.data.slice(0, 4))).catch(() => {});
    catalogApi
      .products({ per_page: 24, sort: "newest" })
      .then((res) => setDeals(res.data.data.items.filter((p) => p.discount_percent > 0 && p.stock_quantity > 0)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    catalogApi
      .products({ per_page: PER_PAGE, sort: "newest", page })
      .then((res) => {
        const data = res.data.data;
        setFeatured(data.items);
        setTotalPages(data.pages || 1);
      })
      .finally(() => setLoading(false));
  }, [page]);

  const goToPage = (newPage) => {
    setPage(newPage);
    productsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollDeals = (dir) =>
    dealsRef.current?.scrollBy({ left: dir * dealsRef.current.clientWidth * 0.8, behavior: "smooth" });

  const sidePhoto = resolveImage(featured[0]?.image_url);

  return (
    <div>
      {/* ------------------------------------------------------------------ */}
      {/* Split hero: hover a panel to expand it                              */}
      {/* ------------------------------------------------------------------ */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-5">
        <div className="hero-split flex flex-col lg:flex-row gap-4 lg:h-[600px]">
          <div className="hero-panel is-main relative rounded-3xl overflow-hidden min-h-[480px] bg-taupe">
            <img
              src={heroImage}
              alt="A pump bottle, folded towel and pink tulips on a white table"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-ink/75 via-ink/35 to-transparent" />
            <div className="relative h-full flex flex-col justify-end p-7 sm:p-12 text-white max-w-xl">
              <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.4rem] leading-[1.05] font-semibold text-white mb-5">
                Beauty from Pakistan's independent boutiques
              </h1>
              <p className="text-white/85 text-lg leading-relaxed mb-8 max-w-md">
                Skincare, foundation and colour from vetted local sellers. Every order is checked
                before it ships.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/shop?sort=newest"
                  className="inline-flex items-center gap-2 bg-white text-ink rounded-full px-7 py-3.5 font-semibold hover:bg-petal transition-colors"
                >
                  Shop new arrivals <ArrowRight size={16} />
                </Link>
                <Link
                  to="/stores"
                  className="inline-flex items-center gap-2 border border-white/60 text-white rounded-full px-7 py-3.5 font-semibold hover:bg-white/15 transition-colors"
                >
                  Browse boutiques
                </Link>
              </div>
            </div>
          </div>

          <Link
            to="/shop?category=Skincare"
            className="hero-panel relative rounded-3xl overflow-hidden min-h-[320px] bg-sage group"
          >
            {sidePhoto && (
              <img
                src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT3TjcbFatYFjCocUmDg2IqdYsO9riJx07qCIqMguiJLAeJJaCfh_oVFZek&s=10"
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-105"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
            <div className="relative h-full min-h-[320px] flex flex-col justify-between p-7 sm:p-9">
              <span className="self-start bg-white/90 text-ink text-xs font-semibold px-3 py-1.5 rounded-full">
                Skincare
              </span>
              <div className="text-white">
                <p className="font-display text-3xl font-semibold leading-tight mb-2 text-white">
                  Serums, cleansers and daily SPF
                </p>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                  Shop skincare <ArrowRight size={15} />
                </span>
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Quick category links                                                */}
      {/* ------------------------------------------------------------------ */}
      {categories.length > 0 && (
        
          <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-12">
            <div className="flex gap-5 sm:gap-8 overflow-x-auto scrollbar-hide justify-start lg:justify-center pb-2">
              {categories.map((c) => {
                const categoryImage = CATEGORY_IMAGES[c.name];

                return (
                  <Link
                    key={c.id}
                    to={`/shop?category_id=${c.id}`}
                    className="group flex flex-col items-center gap-3 shrink-0 w-24"
                  >
                    <div className="w-[88px] h-[88px] rounded-full overflow-hidden bg-petal border border-ink/10">
                      {categoryImage ? (
                        <img
                          src={categoryImage}
                          alt={c.name}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Sparkles size={30} className="text-berry-500" />
                        </div>
                      )}
                    </div>

                    <span className="text-sm font-medium text-center group-hover:text-berry-600 transition-colors">
                      {c.name}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

      )}

      {/* ------------------------------------------------------------------ */}
      {/* New arrivals (paginated)                                            */}
      {/* ------------------------------------------------------------------ */}
      <section ref={productsRef} className="max-w-7xl mx-auto px-4 sm:px-6 pt-16 scroll-mt-28">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-3xl font-semibold">New arrivals</h2>
            <p className="text-ink/55 mt-1">Fresh from our boutiques this week.</p>
          </div>
          <Link to="/shop?sort=newest" className="text-sm font-semibold hover:text-berry-600 flex items-center gap-1.5">
            View all <ArrowRight size={15} />
          </Link>
        </div>
        {loading ? (
          <PageSpinner />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 sm:gap-x-6 gap-y-10">
              {featured.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
            <Pagination page={page} pages={totalPages} onPageChange={goToPage} />
          </>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Promo tiles                                                         */}
      {/* ------------------------------------------------------------------ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-20 grid md:grid-cols-2 gap-4">
        <Link
          to="/shop?category=Lipstick"
          className="group relative rounded-3xl bg-berry-500 text-white p-8 sm:p-10 min-h-[260px] flex flex-col justify-between overflow-hidden"
        >
          {/* Background Image */}
          <img
            src="https://img.magnific.com/free-photo/woman-bright-beret-paints-her-lips-with-red-lipstick-girl-lilac-blouse-posing-pink-background_197531-17566.jpg?w=360"
            alt="Luxury lipstick collection"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />

          {/* Dark Overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/40 to-black/10" />

          {/* Content */}
          <p className="font-display text-3xl sm:text-4xl font-semibold leading-tight text-white max-w-xs relative z-10">
            Lipsticks, from matte to everyday nude
          </p>

          <span className="relative z-10 inline-flex items-center gap-2 font-semibold text-white">
            Shop lipstick <ArrowRight size={16} />
          </span>
        </Link>
        <Link
          to="/shop?category=Foundation"
          className="group relative rounded-3xl bg-sage p-8 sm:p-10 min-h-[260px] flex flex-col justify-between overflow-hidden"
        >

          <img
            src="https://thumbs.dreamstime.com/b/beautiful-white-girl-red-lipstick-lips-stunning-brunette-girl-long-hair-tail-closeup-face-young-beautiful-woman-199436215.jpg"
            alt="Luxury lipstick collection"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
          <span className="absolute -right-10 -bottom-16 w-64 h-64 rounded-full bg-white/50 transition-transform duration-700 group-hover:scale-125" />
          <p className="font-display text-3xl sm:text-4xl font-semibold leading-tight max-w-xs relative text-white">
            Base coverage for every skin tone
          </p>
          <span className="relative inline-flex items-center gap-2 font-semibold">
            Shop foundation <ArrowRight size={16} />
          </span>
        </Link>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Deals carousel (only when something is discounted)                  */}
      {/* ------------------------------------------------------------------ */}
      {deals.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-20">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="text-3xl font-semibold">On sale now</h2>
              <p className="text-ink/55 mt-1">Discounted by the boutiques themselves.</p>
            </div>
            <div className="hidden sm:flex gap-2">
              <button
                type="button"
                onClick={() => scrollDeals(-1)}
                aria-label="Previous"
                className="w-11 h-11 rounded-full border border-ink/20 flex items-center justify-center hover:bg-ink hover:text-white transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => scrollDeals(1)}
                aria-label="Next"
                className="w-11 h-11 rounded-full border border-ink/20 flex items-center justify-center hover:bg-ink hover:text-white transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div
            ref={dealsRef}
            className="flex gap-4 sm:gap-6 overflow-x-auto scrollbar-hide snap-x snap-mandatory -mx-4 px-4 sm:mx-0 sm:px-0"
          >
            {deals.map((p) => (
              <ProductCard key={p.id} product={p} className="snap-start shrink-0 w-[46%] sm:w-[31%] lg:w-[23.5%]" />
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Boutiques                                                           */}
      {/* ------------------------------------------------------------------ */}
      {stores.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-20">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="text-3xl font-semibold">Shop by boutique</h2>
              <p className="text-ink/55 mt-1">Each store is run by an independent local seller.</p>
            </div>
            <Link to="/stores" className="text-sm font-semibold hover:text-berry-600 flex items-center gap-1.5">
              All boutiques <ArrowRight size={15} />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {stores.map((s) => (
              <Link
                key={s.id}
                to={`/store/${s.id}`}
                className="group rounded-2xl bg-white border border-ink/10 p-6 hover:border-ink transition-colors"
              >
                <span className="w-12 h-12 rounded-full bg-ink text-white font-display text-xl flex items-center justify-center mb-5">
                  {s.store_name?.[0]}
                </span>
                <h3 className="font-display text-xl font-semibold mb-1 group-hover:text-berry-600 transition-colors">
                  {s.store_name}
                </h3>
                <p className="text-sm text-ink/60 line-clamp-2 mb-4">{s.description}</p>
                <p className="text-xs font-medium text-ink/45">{s.product_count} products</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* How orders are protected (a real sequence, so numbered)             */}
      {/* ------------------------------------------------------------------ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-20">
        <div className="rounded-3xl bg-petal px-6 sm:px-12 py-12 grid lg:grid-cols-[1fr_2fr] gap-10 items-start">
          <div>
            <h2 className="text-3xl font-semibold mb-3">How we protect every order</h2>
            <p className="text-ink/65 leading-relaxed">
              Buying from independent sellers should feel as safe as buying from a big brand.
            </p>
          </div>
          <ol className="grid sm:grid-cols-3 gap-6">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="w-9 h-9 rounded-full bg-ink text-white text-sm font-semibold flex items-center justify-center mb-4">
                  {i + 1}
                </span>
                <p className="font-semibold mb-1.5">{s.title}</p>
                <p className="text-sm text-ink/65 leading-relaxed">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Trust badges                                                        */}
      {/* ------------------------------------------------------------------ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-12">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {TRUST.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-5 py-4">
              <Icon size={20} className="text-berry-500 shrink-0" />
              <span className="text-sm font-medium">{text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Vendor CTA */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-16">
          <div className="relative overflow-hidden rounded-3xl min-h-[280px] flex flex-col md:flex-row md:items-center justify-between gap-6 px-6 sm:px-12 py-12">

            {/* Background Image */}
            <img
              src="https://www.lorealparisusa.com/-/media/project/loreal/brand-sites/oap/americas/us/beauty-magazine/2024/sep/banner-blush-for-your-skintone-desktop.jpg"
              alt="Beauty boutique products"
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Dark Overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#1c1012]/95 via-[#1c1012]/80 to-[#1c1012]/45" />

            {/* Content */}
            <div className="relative z-10">
              <h2 className="text-3xl font-semibold text-white mb-2">
                Run a beauty boutique?
              </h2>

              <p className="text-white/80 max-w-lg leading-relaxed">
                Open your store on CosmoStore, list products in bulk from Excel
                and get paid by customers across Pakistan.
              </p>
            </div>

            <Link
              to="/register"
              className="relative z-10 inline-flex items-center justify-center gap-2 bg-white text-ink rounded-full px-7 py-3.5 font-semibold hover:bg-petal transition-colors shrink-0"
            >
              Become a vendor <ArrowRight size={16} />
            </Link>

          </div>
        </section>
    </div>
  );
}
