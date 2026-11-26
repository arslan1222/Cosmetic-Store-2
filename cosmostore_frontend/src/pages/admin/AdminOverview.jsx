import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Users, Store, Package, ShoppingBag, ShieldAlert, TrendingUp } from "lucide-react";
import { adminApi } from "../../api/endpoints";
import { formatPKR } from "../../utils/format";
import { PageSpinner } from "../../components/ui";

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="bg-white border border-ink/10 rounded-2xl p-5">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center mb-3 ${accent}`}>
        <Icon size={16} />
      </div>
      <p className="text-2xl font-semibold text-ink">{value}</p>
      <p className="text-xs text-ink/50 mt-0.5">{label}</p>
    </div>
  );
}

export default function AdminOverview() {
  const [data, setData] = useState(null);

  useEffect(() => {
    adminApi.analyticsSummary().then((res) => setData(res.data.data));
  }, []);

  if (!data) return <PageSpinner />;

  const chartData = data.daily_sales_last_30_days.map((d) => ({
    day: d.day.slice(5),
    total: d.total,
  }));

  return (
    <div>
      <h2 className="font-display text-xl mb-6">Overview</h2>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={TrendingUp} label="Total sales" value={formatPKR(data.total_sales)} accent="bg-berry-100 text-berry-600" />
        <StatCard icon={ShoppingBag} label="Total orders" value={data.total_orders} accent="bg-gold-400/20 text-gold-600" />
        <StatCard icon={Users} label="Customers" value={data.total_customers} accent="bg-blush text-berry-500" />
        <StatCard icon={Store} label="Vendors" value={data.total_vendors} accent="bg-berry-100 text-berry-600" />
        <StatCard icon={Package} label="Products" value={data.total_products} accent="bg-gold-400/20 text-gold-600" />
        <StatCard
          icon={ShieldAlert}
          label="Flagged orders"
          value={data.flagged_orders}
          accent="bg-amber-100 text-amber-600"
        />
        <StatCard
          icon={ShieldAlert}
          label="Fraud rate"
          value={`${data.fraud_rate_percent}%`}
          accent="bg-red-100 text-red-600"
        />
        <StatCard icon={ShieldAlert} label="Rejected orders" value={data.rejected_orders} accent="bg-red-100 text-red-600" />
        <StatCard icon={Store} label="Vendor applications waiting" value={data.pending_vendor_applications} accent="bg-amber-100 text-amber-600" />
        <StatCard icon={Users} label="Watchlisted customers" value={data.watchlisted_customers} accent="bg-red-100 text-red-600" />
      </div>

      <div className="bg-white border border-ink/10 rounded-2xl p-6">
        <h3 className="font-medium mb-5">Sales  last 30 days</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#24152110" />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#24152180" }} />
            <YAxis tick={{ fontSize: 11, fill: "#24152180" }} />
            <Tooltip formatter={(v) => formatPKR(v)} />
            <Line type="monotone" dataKey="total" stroke="#A6314F" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white border border-ink/10 rounded-2xl p-6 mt-6">
        <h3 className="font-medium mb-4">Orders by status</h3>
        <div className="flex flex-wrap gap-3">
          {Object.entries(data.orders_by_status).map(([status, count]) => (
            <div key={status} className="bg-blush/50 rounded-xl px-4 py-3">
              <p className="text-lg font-semibold">{count}</p>
              <p className="text-xs text-ink/50 capitalize">{status.replaceAll("_", " ")}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
