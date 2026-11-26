import { useState } from "react";
import { Store } from "lucide-react";
import { catalogApi } from "../../api/endpoints";
import { useToast } from "../../context/ToastContext";
import { Button, Input, TextArea } from "../../components/ui";

export default function VendorStoreSetup({ onCreated }) {
  const [form, setForm] = useState({ store_name: "", description: "" });
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await catalogApi.createStore(form);
      toast.success("Store created! It'll appear publicly once approved by an admin.");
      onCreated(res.data.data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-blush flex items-center justify-center mx-auto mb-5">
        <Store size={24} className="text-berry-500" />
      </div>
      <h1 className="text-2xl mb-2">Set up your store</h1>
      <p className="text-ink/60 mb-8">Create your virtual storefront to start listing cosmetic products.</p>

      <form onSubmit={submit} className="bg-white border border-ink/10 rounded-2xl p-6 space-y-4 text-left">
        <Input
          label="Store name"
          value={form.store_name}
          onChange={(e) => setForm((f) => ({ ...f, store_name: e.target.value }))}
          placeholder="e.g. Glow Beauty Studio"
          required
        />
        <TextArea
          label="Description"
          rows={3}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Tell shoppers what makes your store special."
        />
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Creating..." : "Create store"}
        </Button>
      </form>
    </div>
  );
}
