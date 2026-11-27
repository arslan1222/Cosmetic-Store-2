import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { wishlistApi } from "../api/endpoints";
import { useWishlist } from "../context/WishlistContext";
import ProductCard from "../components/ProductCard";
import { PageSpinner, EmptyState, Breadcrumbs, Button } from "../components/ui";

export default function Wishlist() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const wishlist = useWishlist();

  useEffect(() => {
    wishlistApi
      .list()
      .then((res) => setProducts(res.data.data.items))
      .finally(() => setLoading(false));
  }, []);

  // Items removed with the heart disappear from this page straight away
  const visible = products.filter((p) => wishlist.has(p.id));

  return (
    <div>
      <div className="bg-petal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Wishlist" }]} />
          <h1 className="text-4xl font-semibold mt-3">Your wishlist</h1>
          <p className="text-ink/60 mt-1">Products you've saved for later.</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        {loading ? (
          <PageSpinner />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="Nothing saved yet"
            description="Tap the heart on any product to keep it here."
            action={<Button as={Link} to="/shop" variant="dark">Browse the shop</Button>}
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 sm:gap-x-6 gap-y-10">
            {visible.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
