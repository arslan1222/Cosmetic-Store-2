import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Database } from "lucide-react";
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

const pct = (v) => (v == null ? "-" : `${(v * 100).toFixed(2)}%`);

/** Decision Tree (baseline) vs Random Forest (deployed), same held-out test set. */
function ModelComparison({ comparison, deployed }) {
  const rows = [
    ["decision_tree", "Decision Tree (baseline)"],
    ["random_forest", "Random Forest"],
  ];
  return (
    <div className="bg-white border border-ink/10 rounded-2xl p-6 mb-6">
      <h3 className="font-medium mb-1">Model comparison</h3>
      <p className="text-xs text-ink/50 mb-4">Both models scored on the same untouched test set. The deployed model is the {deployed}.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink/50 border-b border-ink/10">
              <th className="py-2 pr-4 font-medium">Model</th>
              <th className="py-2 pr-4 font-medium">Precision</th>
              <th className="py-2 pr-4 font-medium">Recall</th>
              <th className="py-2 pr-4 font-medium">F1</th>
              <th className="py-2 pr-4 font-medium">PR-AUC</th>
              <th className="py-2 font-medium">ROC-AUC</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([key, label]) => {
              const m = comparison[key];
              if (!m) return null;
              return (
                <tr key={key} className="border-b border-ink/5 last:border-0">
                  <td className="py-2.5 pr-4 font-medium">{label}</td>
                  <td className="py-2.5 pr-4">{pct(m.precision)}</td>
                  <td className="py-2.5 pr-4">{pct(m.recall)}</td>
                  <td className="py-2.5 pr-4">{pct(m.f1_score)}</td>
                  <td className="py-2.5 pr-4">{pct(m.pr_auc)}</td>
                  <td className="py-2.5">{pct(m.roc_auc)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Precision/recall at several hold thresholds: how to pick FRAUD_HOLD_THRESHOLD. */
function ThresholdTable({ byThreshold }) {
  const entries = Object.entries(byThreshold || {});
  if (!entries.length) return null;
  return (
    <div className="bg-white border border-ink/10 rounded-2xl p-6 mb-6">
      <h3 className="font-medium mb-1">Choosing the hold threshold</h3>
      <p className="text-xs text-ink/50 mb-4">
        An order is held when the model's probability is at or above the threshold (setting <code>FRAUD_HOLD_THRESHOLD</code>).
        Higher means fewer false alarms but more missed fraud.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink/50 border-b border-ink/10">
              <th className="py-2 pr-4 font-medium">Threshold</th>
              <th className="py-2 pr-4 font-medium">Precision</th>
              <th className="py-2 pr-4 font-medium">Recall</th>
              <th className="py-2 font-medium">Orders flagged (test set)</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([t, v]) => (
              <tr key={t} className="border-b border-ink/5 last:border-0">
                <td className="py-2.5 pr-4 font-medium">{t}</td>
                <td className="py-2.5 pr-4">{pct(v.precision)}</td>
                <td className="py-2.5 pr-4">{pct(v.recall)}</td>
                <td className="py-2.5">{v.flagged.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
      counts[c.risk_level || riskLevel(c.fraud_probability)] += 1;
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

      {metrics.is_demo_model ? (
        <div className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 mb-6" role="alert">
          <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 leading-relaxed">
            <p className="font-semibold">Demo model: trained on synthetic data</p>
            <p>
              The Kaggle dataset wasn't found, so this model was trained on generated data. The figures below describe that
              fake data, not real-world accuracy, so don't quote them in the report. Download the dataset and run{" "}
              <code className="bg-amber-100 px-1 rounded">python -m app.ml.train_model</code> to train a real model.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 mb-6">
          <Database size={20} className="text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-900 leading-relaxed">
            Trained on the <b>Kaggle PaySim dataset</b>: {(metrics.dataset_rows ?? metrics.trained_rows).toLocaleString()} transactions,{" "}
            {(metrics.dataset_fraud_rows ?? 0).toLocaleString()} of them fraud. Scores below are from a held-out test set of{" "}
            {(metrics.test_rows ?? 0).toLocaleString()} untouched transactions.
          </p>
        </div>
      )}

      <p className="text-ink/55 text-sm mb-6">
        {metrics.deployed_model || "RandomForestClassifier"} · dataset: {metrics.dataset || "unknown"}
        {metrics.trained_at && <> · trained {new Date(metrics.trained_at).toLocaleDateString()}</>}
        {checks.length > 0 && <> · {checks.length} live checks recorded</>}.
      </p>

      <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <Metric label="Accuracy" value={metrics.accuracy} />
        <Metric label="Precision" value={metrics.precision} />
        <Metric label="Recall" value={metrics.recall} />
        <Metric label="F1 score" value={metrics.f1_score} />
        <Metric label="ROC-AUC" value={metrics.roc_auc} />
        {metrics.pr_auc != null && <Metric label="PR-AUC" value={metrics.pr_auc} />}
      </div>

      {metrics.model_comparison && <ModelComparison comparison={metrics.model_comparison} deployed={metrics.deployed_model || "Random Forest"} />}
      <ThresholdTable byThreshold={metrics.by_threshold} />

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
