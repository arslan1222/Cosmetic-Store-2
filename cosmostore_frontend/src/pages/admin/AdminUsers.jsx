import { useEffect, useState } from "react";
import { adminApi } from "../../api/endpoints";
import { useToast } from "../../context/ToastContext";
import { formatDate } from "../../utils/format";
import { PageSpinner, Select, Button, EmptyState, StatusBadge } from "../../components/ui";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = () => adminApi.users(role || undefined).then((res) => setUsers(res.data.data));

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [role]);

  const toggleActive = async (id) => {
    try {
      await adminApi.toggleUserActive(id);
      toast.success("User updated.");
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleWatchlist = async (u) => {
    try {
      await adminApi.setWatchlist(u.id, !u.is_watchlisted);
      toast.success(u.is_watchlisted ? "Removed from watchlist." : "Added to watchlist. Their orders will be held for review.");
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <PageSpinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-xl">Users ({users.length})</h2>
        <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-40">
          <option value="">All roles</option>
          <option value="customer">Customers</option>
          <option value="vendor">Vendors</option>
          <option value="admin">Admins</option>
        </Select>
      </div>

      {users.length === 0 ? (
        <EmptyState title="No users found" />
      ) : (
        <div className="bg-white border border-ink/10 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-blush/40 text-ink/60 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Orders</th>
                <th className="px-4 py-3 font-medium">Flagged orders</th>
                <th className="px-4 py-3 font-medium">Watchlist</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-ink/5">
                  <td className="px-4 py-3 font-medium">{u.full_name}</td>
                  <td className="px-4 py-3 text-ink/60">{u.email}</td>
                  <td className="px-4 py-3 capitalize text-ink/60">{u.role}</td>
                  <td className="px-4 py-3">{u.total_orders}</td>
                  <td className="px-4 py-3">
                    <span className={u.total_flagged_orders > 0 ? "text-amber-700 font-semibold" : ""}>
                      {u.total_flagged_orders}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {u.role === "customer" ? (
                      <button
                        type="button"
                        onClick={() => toggleWatchlist(u)}
                        className={`text-xs font-medium rounded-full px-3 py-1.5 border transition-colors ${
                          u.is_watchlisted
                            ? "bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                            : "border-ink/15 text-ink/60 hover:border-ink"
                        }`}
                      >
                        {u.is_watchlisted ? "On watchlist" : "Add"}
                      </button>
                    ) : u.role === "vendor" && u.store_status ? (
                      <StatusBadge status={u.store_status} />
                    ) : (
                      <span className="text-ink/30">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink/60 whitespace-nowrap">{formatDate(u.created_at)}</td>
                  <td className="px-4 py-3">
                    <Button
                      variant={u.is_active_account === false ? "primary" : "outline"}
                      onClick={() => toggleActive(u.id)}
                      className="!px-3 !py-1.5 text-xs"
                    >
                      {u.is_active_account === false ? "Activate" : "Deactivate"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
