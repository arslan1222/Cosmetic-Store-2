import { useState } from "react";
import { X } from "lucide-react";
import { formatPKR } from "../utils/format";
import { FREE_SHIPPING_THRESHOLD } from "../utils/image";

export default function AnnouncementBar() {
  const [open, setOpen] = useState(() => sessionStorage.getItem("cs_announce") !== "closed");
  if (!open) return null;

  const close = () => {
    sessionStorage.setItem("cs_announce", "closed");
    setOpen(false);
  };

  return (
    <div className="bg-ink text-white text-[13px]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-10 flex items-center justify-center gap-8 relative">
        <p className="font-medium text-center">
          Free shipping on orders over {formatPKR(FREE_SHIPPING_THRESHOLD)}
        </p>
        <p className="hidden md:block text-white/70">Cash on delivery available</p>
        <p className="hidden lg:block text-white/70">Easypaisa &amp; JazzCash accepted</p>
        <button
          type="button"
          onClick={close}
          aria-label="Dismiss announcement"
          className="absolute right-3 sm:right-5 text-white/60 hover:text-white"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
