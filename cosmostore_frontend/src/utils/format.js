export function formatPKR(amount) {
  const num = Number(amount) || 0;
  return "Rs " + num.toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

export function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-PK", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-PK", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const STATUS_STYLES = {
  pending: "bg-gray-100 text-gray-700",
  held_for_review: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  shipped: "bg-sky-100 text-sky-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-gray-200 text-gray-600",
  rejected: "bg-red-100 text-red-700",
  approved: "bg-emerald-100 text-emerald-800",
  suspended: "bg-red-100 text-red-700",
};

export function statusLabel(status) {
  return (status || "").replaceAll("_", " ");
}

// Severity colours for the individual reasons an order was flagged
export const SEVERITY_STYLES = {
  high: { dot: "bg-red-500", text: "text-red-700", label: "High" },
  medium: { dot: "bg-amber-500", text: "text-amber-700", label: "Medium" },
  low: { dot: "bg-sky-500", text: "text-sky-700", label: "Low" },
};

export const FLAG_SOURCE_LABELS = {
  model: "Fraud model",
  rules: "Rule check",
  "model+rules": "Model + rules",
};

export function riskLevel(probability) {
  const p = Number(probability) || 0;
  if (p >= 0.55) return "high";
  if (p >= 0.3) return "medium";
  return "low";
}

export const RISK_STYLES = {
  low: { badge: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-500", label: "Low risk" },
  medium: { badge: "bg-amber-100 text-amber-800", bar: "bg-amber-500", label: "Medium risk" },
  high: { badge: "bg-red-100 text-red-700", bar: "bg-red-500", label: "High risk" },
};
