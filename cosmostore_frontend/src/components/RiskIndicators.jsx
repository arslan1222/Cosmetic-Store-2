import { riskLevel, RISK_STYLES, SEVERITY_STYLES, FLAG_SOURCE_LABELS } from "../utils/format";

/**
 * Coloured pill: "Low risk" / "Medium risk" / "High risk".
 * Pass `level` (the backend's verdict, which also accounts for rule hits).
 * Falls back to the raw model probability for older records that have no level.
 */
export function RiskBadge({ level, probability }) {
  const resolved = level || riskLevel(probability);
  const style = RISK_STYLES[resolved];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${style.badge}`}>
      {style.label}
    </span>
  );
}

/** Horizontal probability bar with percentage label, used in fraud review/logs */
export function RiskMeter({ probability, level, label = "Fraud model probability", showLabel = true }) {
  const style = RISK_STYLES[level || riskLevel(probability)];
  const pct = Math.min(100, Math.max(0, (Number(probability) || 0) * 100));

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-ink/50">{label}</span>
          <span className="text-xs font-semibold text-ink">{pct.toFixed(1)}%</span>
        </div>
      )}
      <div className="h-2 rounded-full bg-ink/10 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${style.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** The reasons an order was flagged, most severe first. */
export function RiskFactors({ factors = [] }) {
  if (!factors.length) {
    return <p className="text-sm text-ink/55">No individual risk signals were recorded.</p>;
  }
  const order = { high: 0, medium: 1, low: 2 };
  const sorted = [...factors].sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <ul className="space-y-2">
      {sorted.map((f, i) => {
        const sev = SEVERITY_STYLES[f.severity] || SEVERITY_STYLES.low;
        return (
          <li key={`${f.code}-${i}`} className="flex items-start gap-2.5 text-sm">
            <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${sev.dot}`} aria-hidden="true" />
            <span className="text-ink/80">
              {f.label} <span className={`text-xs font-medium ${sev.text}`}>({sev.label.toLowerCase()})</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Where the flag came from: model, rules, or both. */
export function FlagSource({ source }) {
  if (!source) return null;
  return (
    <span className="text-xs text-ink/55">
      Flagged by <span className="font-medium text-ink/75">{FLAG_SOURCE_LABELS[source] || source}</span>
    </span>
  );
}
