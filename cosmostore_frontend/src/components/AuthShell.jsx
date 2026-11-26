import { Link } from "react-router-dom";
import heroImage from "../assets/hero.png";

// Split layout shared by Login and Register: photo on the left (desktop), form on the right.
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid lg:grid-cols-2 min-h-[calc(100vh-108px)]">
      <div className="hidden lg:block relative">
        <img src={heroImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
        <div className="absolute bottom-12 left-12 right-12 text-white">
          <p className="font-display text-4xl font-semibold leading-tight text-white max-w-md mb-3">
            Beauty from independent boutiques, checked before it ships.
          </p>
          <p className="text-white/75">Fraud-screened checkout on every order.</p>
        </div>
      </div>

      <div className="flex items-center justify-center px-4 sm:px-10 py-14">
        <div className="w-full max-w-md">
          <Link to="/" className="font-display text-2xl font-semibold lg:hidden block mb-8">
            Cosmo<span className="text-berry-500">Store</span>
          </Link>
          <h1 className="text-3xl font-semibold mb-2">{title}</h1>
          <p className="text-ink/55 mb-8">{subtitle}</p>
          {children}
          <p className="text-sm text-ink/60 mt-7">{footer}</p>
        </div>
      </div>
    </div>
  );
}
