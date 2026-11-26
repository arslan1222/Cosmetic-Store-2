import { useEffect, useMemo, useState } from "react";
import { Activity } from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { adminApi } from "../../api/endpoints";
import { EmptyState, PageSpinner } from "../../components/ui";
import { riskLevel } from "../../utils/format";

const RISK_COLORS = { low: "#10b981", medium: "#f59e0b", high: "#dc2626" };

function Metric({ label, value }) {
  return (
    <div className="bg-white border border-ink/10 rounded-2xl p-5 text-center">
      <p className="text-2xl font-semibold text-ink">{(value * 100).toFixed(2)}%</p>
      <p className="text-xs text-ink/50 mt-1">{label}</p>
    </div>
  );
}

export default function AdminFraudMetrics() {
  const [metrics, setMetrics] = useState(null);
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notTrained, setNotTrained] = useState(false);

  useEffect(() => {
    Promise.all([
      adminApi.modelMetrics().then((res) => setMetrics(res.data.data)).catch(() => setNotTrained(true)),
      adminApi.fraudChecks().then((res) => setChecks(res.data.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const riskDistribution = useMemo(() => {
    const counts = { low: 0, medium: 0, high: 0 };
    checks.forEach((c) => {
      counts[riskLevel(c.fraud_probability)] += 1;
    });
    return [
      { name: "Low risk", key: "low", value: counts.low },
      { name: "Medium risk", key: "medium", value: counts.medium },
      { name: "High risk", key: "high", value: counts.high },
    ].filter((d) => d.value > 0);
  }, [checks]);

  const byTransactionType = useMemo(() => {
    const groups = {};
    checks.forEach((c) => {
      if (!groups[c.transaction_type]) groups[c.transaction_type] = { total: 0, count: 0 };
      groups[c.transaction_type].total += c.fraud_probability;
      groups[c.transaction_type].count += 1;
    });
    return Object.entries(groups).map(([type, g]) => ({
      type,
      avgRisk: Math.round((g.total / g.count) * 1000) / 10,
    }));
  }, [checks]);

  if (loading) return <PageSpinner />;
  if (notTrained || !metrics) {
    return (
      <EmptyState
        icon={Activity}
        title="Model not trained yet"
        description="Run `python -m app.ml.train_model` on the backend to train the fraud detection model."
      />
    );
  }

  const [[tn, fp], [fn, tp]] = metrics.confusion_matrix;

  return (
    <div>
      <h2 className="font-display text-xl mb-2">Fraud model performance</h2>
      <p className="text-ink/55 text-sm mb-6">
        RandomForestClassifier trained on {metrics.trained_rows.toLocaleString()} transactions
        {checks.length > 0 && <> · {checks.length} live checks recorded</>}.
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <Metric label="Accuracy" value={metrics.accuracy} />
        <Metric label="Precision" value={metrics.precision} />
        <Metric label="Recall" value={metrics.recall} />
        <Metric label="F1 score" value={metrics.f1_score} />
        <Metric label="ROC-AUC" value={metrics.roc_auc} />
      </div>

      <div className="bg-white border border-ink/10 rounded-2xl p-6 mb-6">
        <h3 className="font-medium mb-4">Confusion matrix (held-out test set)</h3>
        <div className="grid grid-cols-2 gap-2 max-w-sm">
          <div className="bg-emerald-50 rounded-xl p-4 text-center">
            <p className="text-xl font-semibold text-emerald-700">{tn.toLocaleString()}</p>
            <p className="text-xs text-ink/50">True negative</p>
          </div>
          <div className="bg-red-50 rounded-xl p-4 text-center">
            <p className="text-xl font-semibold text-red-700">{fp.toLocaleString()}</p>
            <p className="text-xs text-ink/50">False positive</p>
          </div>
          <div className="bg-red-50 rounded-xl p-4 text-center">
            <p className="text-xl font-semibold text-red-700">{fn.toLocaleString()}</p>
            <p className="text-xs text-ink/50">False negative</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-4 text-center">
            <p className="text-xl font-semibold text-emerald-700">{tp.toLocaleString()}</p>
            <p className="text-xs text-ink/50">True positive</p>
          </div>
        </div>
        <p className="text-xs text-ink/40 mt-4">Training time: {metrics.training_seconds}s</p>
      </div>

      {checks.length > 0 && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white border border-ink/10 rounded-2xl p-6">
            <h3 className="font-medium mb-4">Risk distribution - live checks</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={riskDistribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85}>
                  {riskDistribution.map((d) => (
                    <Cell key={d.key} fill={RISK_COLORS[d.key]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white border border-ink/10 rounded-2xl p-6">
            <h3 className="font-medium mb-4">Average risk by transaction type</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byTransactionType}>
                <CartesianGrid strokeDasharray="3 3" stroke="#24152110" />
                <XAxis dataKey="type" tick={{ fontSize: 11, fill: "#24152180" }} />
                <YAxis tick={{ fontSize: 11, fill: "#24152180" }} unit="%" />
                <Tooltip formatter={(v) => `${v}%`} />
                <Bar dataKey="avgRisk" fill="#A6314F" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
