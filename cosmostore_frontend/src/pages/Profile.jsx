import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { authApi } from "../api/endpoints";
import { Button, Input } from "../components/ui";
import AccountLayout from "../components/AccountLayout";

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({
    full_name: user?.full_name || "",
    phone: user?.phone || "",
    address: user?.address || "",
    city: user?.city || "",
  });
  const [saving, setSaving] = useState(false);

  const [passwords, setPasswords] = useState({ old_password: "", new_password: "" });
  const [changingPassword, setChangingPassword] = useState(false);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await authApi.updateProfile(form);
      await refreshUser();
      toast.success("Profile updated.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setChangingPassword(true);
    try {
      await authApi.changePassword(passwords);
      toast.success("Password changed.");
      setPasswords({ old_password: "", new_password: "" });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <AccountLayout>
      <div className="grid md:grid-cols-2 gap-8">
        <form onSubmit={saveProfile} className="bg-white border border-ink/10 rounded-2xl p-6 space-y-4">
          <h2 className="font-display text-xl mb-2">Personal details</h2>
          <Input label="Full name" value={form.full_name} onChange={update("full_name")} />
          <Input label="Phone" value={form.phone} onChange={update("phone")} />
          <Input label="Address" value={form.address} onChange={update("address")} />
          <Input label="City" value={form.city} onChange={update("city")} />
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </form>

        <form onSubmit={changePassword} className="bg-white border border-ink/10 rounded-2xl p-6 space-y-4 h-fit">
          <h2 className="font-display text-xl mb-2">Change password</h2>
          <Input
            label="Current password"
            type="password"
            value={passwords.old_password}
            onChange={(e) => setPasswords((p) => ({ ...p, old_password: e.target.value }))}
            required
          />
          <Input
            label="New password"
            type="password"
            value={passwords.new_password}
            onChange={(e) => setPasswords((p) => ({ ...p, new_password: e.target.value }))}
            required
            minLength={6}
          />
          <Button type="submit" variant="outline" disabled={changingPassword}>
            {changingPassword ? "Updating..." : "Update password"}
          </Button>
        </form>
      </div>
    </AccountLayout>
  );
}
