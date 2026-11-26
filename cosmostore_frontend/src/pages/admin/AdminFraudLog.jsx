import { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { adminApi } from "../../api/endpoints";
import { formatPKR, formatDateTime, riskLevel } from "../../utils/format";
import { PageSpinner, EmptyState, Select } from "../../components/ui";
import { RiskBadge, RiskMeter } from "../../components/RiskIndicators";
import { FLAG_SOURCE_LABELS } from "../../utils/format";

export default function AdminFraudLog() {
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [riskFilter, setRiskFilter] = useState("");

  useEffect(() => {
    adminApi
      .fraudChecks()
      .then((res) => setChecks(res.data.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSpinner />;

  const filtered = riskFilter
    ? checks.filter((c) => (c.risk_level || riskLevel(c.fraud_probability)) === riskFilter)
    : checks;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-xl">Fraud checks log</h2>
        <Select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} className="w-40">
          <option value="">All risk levels</option>
          <option value="low">Low risk</option>
          <option value="medium">Medium risk</option>
          <option value="high">High risk</option>
        </Select>
      </div>
      <p className="text-ink/55 text-sm mb-6">
        Every order screened by the fraud model and rule checks, most recent first (last 200). Hover a flagged row's source to see the reasons.
      </p>

      {filtered.length === 0 ? (
        <EmptyState icon={ListChecks} title="No fraud checks recorded yet" />
      ) : (
        <div className="bg-white border border-ink/10 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-blush/40 text-ink/60 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium w-40">Risk score</th>
                <th className="px-4 py-3 font-medium">Level</th>
                <th className="px-4 py-3 font-medium">Flagged</th>
                <th className="px-4 py-3 font-medium">Flagged by</th>
                <th className="px-4 py-3 font-medium">Admin decision</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-ink/5">
                  <td className="px-4 py-3 whitespace-nowrap text-ink/60">{formatDateTime(c.created_at)}</td>
                  <td className="px-4 py-3">{c.transaction_type}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatPKR(c.amount)}</td>
                  <td className="px-4 py-3">
                    <RiskMeter probability={c.fraud_probability} showLabel={false} />
                  </td>
                  <td className="px-4 py-3"><RiskBadge level={c.risk_level} probability={c.fraud_probability} /></td>
                  <td className="px-4 py-3">
                    {c.is_flagged ? (
                      <span className="text-amber-700 font-medium">Yes</span>
                    ) : (
                      <span className="text-ink/40">No</span>
                    )}
                  </td>
                  <td
                    className="px-4 py-3 text-ink/60 whitespace-nowrap"
                    title={(c.risk_factors || []).map((f) => `- ${f.label}`).join("\n")}
                  >
                    {c.is_flagged ? FLAG_SOURCE_LABELS[c.flag_source] || "Model" : "-"}
                  </td>
                  <td className="px-4 py-3 capitalize text-ink/60">{c.admin_decision || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
