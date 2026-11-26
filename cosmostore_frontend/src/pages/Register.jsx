import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Clock, ArrowRight } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Button, Input, TextArea } from "../components/ui";
import AuthShell from "../components/AuthShell";

const EMPTY = {
  full_name: "",
  email: "",
  phone: "",
  password: "",
  role: "customer",
  store_name: "",
  store_description: "",
};

export default function Register() {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);
  const { register, login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const isVendor = form.role === "vendor";
  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(form);

      if (isVendor) {
        // Vendors are applicants until an admin approves the store, so they
        // are not signed in automatically: show what happens next instead.
        setApplied(true);
        return;
      }

      await login(form.email, form.password);
      toast.success("Account created! Welcome to CosmoStore.");
      navigate("/");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const roleBtn = (role, label) => (
    <button
      type="button"
      onClick={() => setForm((f) => ({ ...f, role }))}
      aria-pressed={form.role === role}
      className={`rounded-full py-3 text-sm font-semibold border transition-colors ${
        form.role === role ? "border-ink bg-ink text-white" : "border-ink/20 text-ink/65 hover:border-ink"
      }`}
    >
      {label}
    </button>
  );

  if (applied) {
    return (
      <AuthShell
        title="Application submitted"
        subtitle="Thanks for applying to sell on CosmoStore."
        footer={
          <>
            Want to shop in the meantime?{" "}
            <Link to="/" className="text-berry-600 font-semibold hover:underline">
              Browse the store
            </Link>
          </>
        }
      >
        <div className="rounded-2xl bg-petal p-6">
          <span className="w-11 h-11 rounded-full bg-white flex items-center justify-center mb-4">
            <Clock size={20} className="text-berry-500" />
          </span>
          <p className="font-semibold mb-1">Your store is waiting for admin approval</p>
          <p className="text-sm text-ink/70 leading-relaxed mb-4">
            We review every vendor before they go live. You can log in at any time to see the status of{" "}
            <b>{form.store_name}</b>. You'll be able to add products as soon as it's approved, and you'll get a
            notification and an email either way.
          </p>
          <Button variant="dark" onClick={() => navigate("/login")}>
            Go to login <ArrowRight size={16} />
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={isVendor ? "Apply to sell on CosmoStore" : "Create your account"}
      subtitle={
        isVendor
          ? "Tell us about your store. An admin reviews every application before it goes live."
          : "Shop from independent beauty boutiques."
      }
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-berry-600 font-semibold hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {roleBtn("customer", "I'm shopping")}
          {roleBtn("vendor", "I'm selling")}
        </div>

        <Input label="Full name" value={form.full_name} onChange={update("full_name")} required />
        <Input label="Email" type="email" value={form.email} onChange={update("email")} required />
        <Input
          label={isVendor ? "Contact phone" : "Phone (optional)"}
          value={form.phone}
          onChange={update("phone")}
          placeholder="03xx-xxxxxxx"
          required={isVendor}
        />
        <Input
          label="Password"
          type="password"
          value={form.password}
          onChange={update("password")}
          required
          minLength={6}
        />

        {isVendor && (
          <div className="space-y-4 pt-2 border-t border-ink/10">
            <Input
              label="Store name"
              value={form.store_name}
              onChange={update("store_name")}
              placeholder="e.g. Glow Beauty Studio"
              required
            />
            <TextArea
              label="What do you sell? (optional)"
              rows={3}
              value={form.store_description}
              onChange={update("store_description")}
              placeholder="Brands, product types, where you're based. This helps us approve you faster."
            />
          </div>
        )}

        <Button type="submit" variant="dark" disabled={loading} className="w-full mt-2">
          {loading
            ? isVendor
              ? "Submitting..."
              : "Creating account..."
            : isVendor
            ? "Submit application"
            : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
