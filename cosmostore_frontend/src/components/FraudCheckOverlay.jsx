import { Check, Loader2, ShieldCheck, ShoppingBag, CreditCard, PackageCheck, ShieldAlert } from "lucide-react";

const STEPS = [
  { key: "validating", label: "Validating cart", icon: ShoppingBag },
  { key: "paying", label: "Processing payment", icon: CreditCard },
  { key: "fraud", label: "Running fraud detection scan", icon: ShieldCheck },
  { key: "finalizing", label: "Finalizing order", icon: PackageCheck },
];

const STEP_ORDER = STEPS.map((s) => s.key);

/**
 * stage: one of "validating" | "paying" | "fraud" | "finalizing" | "flagged" | "cleared"
 * "flagged"/"cleared" are terminal micro-states shown for a beat right after
 * the fraud check resolves, before navigating to the confirmation page.
 */
export default function FraudCheckOverlay({ stage }) {
  if (!stage) return null;

  const activeIndex = STEP_ORDER.indexOf(stage === "flagged" || stage === "cleared" ? "fraud" : stage);

  return (
    <div className="fixed inset-0 z-[200] bg-ink/60 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl shadow-soft max-w-md w-full p-8">
        {stage === "flagged" ? (
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <ShieldAlert size={26} className="text-amber-600" />
            </div>
            <p className="font-display text-xl mb-1">Extra verification needed</p>
            <p className="text-sm text-ink/55">Redirecting you to your order status...</p>
          </div>
        ) : stage === "cleared" ? (
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck size={26} className="text-emerald-600" />
            </div>
            <p className="font-display text-xl mb-1">Transaction cleared</p>
            <p className="text-sm text-ink/55">Confirming your order...</p>
          </div>
        ) : (
          <>
            <div className="text-center mb-7">
              <div className="w-14 h-14 rounded-full bg-blush flex items-center justify-center mx-auto mb-4 relative">
                <ShieldCheck size={26} className="text-berry-500" />
                <span className="absolute inset-0 rounded-full border-2 border-berry-400/40 animate-ping" />
              </div>
              <p className="font-display text-xl mb-1">Securing your order</p>
              <p className="text-sm text-ink/55">
                Our fraud detection model is checking this transaction against known risk patterns.
              </p>
            </div>

            <div className="space-y-4">
              {STEPS.map((step, i) => {
                const isDone = i < activeIndex;
                const isActive = i === activeIndex;
                return (
                  <div key={step.key} className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                        isDone
                          ? "bg-emerald-500 text-white"
                          : isActive
                          ? "bg-berry-500 text-white"
                          : "bg-ink/10 text-ink/30"
                      }`}
                    >
                      {isDone ? (
                        <Check size={15} />
                      ) : isActive ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <step.icon size={14} />
                      )}
                    </div>
                    <span
                      className={`text-sm ${
                        isDone ? "text-ink/40 line-through" : isActive ? "text-ink font-medium" : "text-ink/35"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {activeIndex === 2 && (
              <p className="text-[11px] text-ink/40 text-center mt-6 leading-relaxed">
                Evaluating payment amount, account history, and transaction patterns with our
                RandomForest classifier.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
