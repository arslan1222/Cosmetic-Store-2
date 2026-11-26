import { ChevronLeft, ChevronRight } from "lucide-react";

// Builds [1, "...", 4, 5, 6, "...", 20] style lists
function getPageItems(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const items = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) items.push("left-dots");
  for (let p = start; p <= end; p++) items.push(p);
  if (end < total - 1) items.push("right-dots");
  items.push(total);
  return items;
}

export default function Pagination({ page, pages, onPageChange }) {
  if (!pages || pages <= 1) return null;

  const btn =
    "min-w-9 h-9 px-3 inline-flex items-center justify-center rounded-full border text-sm transition-colors";
  const idle = "border-ink/20 text-ink/70 hover:border-ink hover:text-ink";
  const active = "bg-ink border-ink text-white font-medium";
  const disabled = "border-ink/10 text-ink/30 cursor-not-allowed";

  return (
    <nav
      aria-label="Pagination"
      className="mt-12 flex flex-wrap items-center justify-center gap-2"
    >
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className={`${btn} gap-1 ${page <= 1 ? disabled : idle}`}
      >
        <ChevronLeft size={14} /> Previous
      </button>

      {getPageItems(page, pages).map((item) =>
        typeof item === "string" ? (
          <span key={item} className="px-1 text-ink/40">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onPageChange(item)}
            aria-current={item === page ? "page" : undefined}
            className={`${btn} ${item === page ? active : idle}`}
          >
            {item}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pages}
        className={`${btn} gap-1 ${page >= pages ? disabled : idle}`}
      >
        Next <ChevronRight size={14} />
      </button>
    </nav>
  );
}
