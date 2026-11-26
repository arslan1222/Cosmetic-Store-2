import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/account/orders", label: "Orders" },
  { to: "/account/profile", label: "Profile" },
];

export default function AccountLayout({ children }) {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-3xl mb-6">My account</h1>
      <div className="flex gap-6 border-b border-ink/10 mb-8">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive ? "border-berry-500 text-berry-600" : "border-transparent text-ink/50 hover:text-ink"
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      {children}
    </div>
  );
}
