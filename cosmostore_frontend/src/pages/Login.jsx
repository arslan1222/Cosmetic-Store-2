import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Button, Input } from "../components/ui";
import AuthShell from "../components/AuthShell";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await login(email, password);
      toast.success("Welcome back!");
      const dest =
        location.state?.from?.pathname ||
        (res.data.role === "admin" ? "/admin" : res.data.role === "vendor" ? "/vendor" : "/");
      navigate(dest, { replace: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to continue to CosmoStore."
      footer={
        <>
          Don't have an account?{" "}
          <Link to="/register" className="text-berry-600 font-semibold hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" variant="dark" disabled={loading} className="w-full mt-2">
          {loading ? "Logging in..." : "Log in"}
        </Button>
      </form>
    </AuthShell>
  );
}
