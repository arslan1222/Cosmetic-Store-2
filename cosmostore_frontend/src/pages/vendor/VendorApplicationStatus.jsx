import { useState } from "react";
import { Clock, XCircle, PauseCircle } from "lucide-react";
import { catalogApi } from "../../api/endpoints";
import { useToast } from "../../context/ToastContext";
import { Button, Input, TextArea } from "../../components/ui";

/**
 * Shown instead of the vendor dashboard while the store is not approved.
 * pending   -> explains the wait
 * rejected  -> shows the admin's reason, lets the vendor fix details and resubmit
 * suspended -> explains and points to support
 */
export default function VendorApplicationStatus({ store, onChange }) {
  const toast = useToast();
  const [form, setForm] = useState({
    store_name: store.store_name || "",
    description: store.description || "",
  });
  const [busy, setBusy] = useState(false);

  const resubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await catalogApi.updateStore(store.id, form);
      const res = await catalogApi.resubmitStore();
      toast.success("Application resubmitted. An admin will review it again.");
      onChange(res.data.data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (store.status === "pending") {
    return (
      <div className="max-w-xl mx-auto py-16">
        <div className="rounded-3xl bg-petal p-8 sm:p-10">
          <span className="w-12 h-12 rounded-full bg-white flex items-center justify-center mb-5">
            <Clock size={22} className="text-berry-500" />
          </span>
          <h1 className="text-2xl font-semibold mb-2">Your application is under review</h1>
          <p className="text-ink/70 leading-relaxed mb-6">
            An admin is reviewing <b>{store.store_name}</b>. You can't add products yet, but you don't need to do
            anything else. We'll notify you here and by email as soon as there's a decision.
          </p>
          <ol className="space-y-3 text-sm">
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center">✓</span>
              Application submitted
            </li>
            <li className="flex items-center gap-3 font-medium">
              <span className="w-6 h-6 rounded-full bg-berry-500 text-white text-xs flex items-center justify-center">2</span>
              Admin review (in progress)
            </li>
            <li className="flex items-center gap-3 text-ink/50">
              <span className="w-6 h-6 rounded-full bg-ink/15 text-ink/60 text-xs flex items-center justify-center">3</span>
              Store goes live and you can add products
            </li>
          </ol>
        </div>
      </div>
    );
  }

  if (store.status === "rejected") {
    return (
      <div className="max-w-xl mx-auto py-14">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6 sm:p-8 mb-6">
          <span className="w-12 h-12 rounded-full bg-white flex items-center justify-center mb-4">
            <XCircle size={22} className="text-red-600" />
          </span>
          <h1 className="text-2xl font-semibold mb-2">Your application wasn't approved</h1>
          <p className="text-sm text-ink/60 mb-1">Reason from the admin:</p>
          <p className="text-ink/85 leading-relaxed">{store.rejection_reason || "No reason was given."}</p>
        </div>

        <form onSubmit={resubmit} className="bg-white border border-ink/10 rounded-3xl p-6 sm:p-8 space-y-4">
          <p className="font-semibold">Update your details and apply again</p>
          <Input
            label="Store name"
            value={form.store_name}
            onChange={(e) => setForm((f) => ({ ...f, store_name: e.target.value }))}
            required
          />
          <TextArea
            label="Description"
            rows={4}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Describe your products, brands and where you're based."
          />
          <Button type="submit" variant="dark" disabled={busy} className="w-full">
            {busy ? "Resubmitting..." : "Resubmit for review"}
          </Button>
        </form>
      </div>
    );
  }

  // suspended
  return (
    <div className="max-w-xl mx-auto py-16">
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8">
        <span className="w-12 h-12 rounded-full bg-white flex items-center justify-center mb-5">
          <PauseCircle size={22} className="text-amber-600" />
        </span>
        <h1 className="text-2xl font-semibold mb-2">Your store is suspended</h1>
        <p className="text-ink/70 leading-relaxed">
          <b>{store.store_name}</b> is currently hidden from customers and you can't edit products.
          {store.rejection_reason && (
            <>
              {" "}
              Reason: {store.rejection_reason}
            </>
          )}{" "}
          Please contact support to resolve this.
        </p>
      </div>
    </div>
  );
}
