import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CreditCard, Smartphone, Banknote, ShieldCheck, Loader2, CheckCircle2, KeyRound } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { ordersApi, paymentsApi } from "../api/endpoints";
import { formatPKR } from "../utils/format";
import { Button, Input } from "../components/ui";
import FraudCheckOverlay from "../components/FraudCheckOverlay";
import usePricing from "../hooks/usePricing";

// Shipping/address typed before the customer is sent to the card gateway's page;
// restored when they come back (a full page load wipes React state).
const DRAFT_KEY = "cs_checkout_draft";

const METHODS = [
  { id: "card", label: "Debit / Credit Card (Pakistan)", icon: CreditCard },
  { id: "easypaisa", label: "Easypaisa", icon: Smartphone },
  { id: "jazzcash", label: "JazzCash", icon: Smartphone },
  { id: "cod", label: "Cash on Delivery", icon: Banknote },
];

const PK_MOBILE_RE = /^03\d{9}$/;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One payment attempt's state, reset every time the method or amount
 * changes. Order placement for a non-COD method is blocked until this
 * reaches "verified" -- the backend enforces the same rule independently,
 * this is just so the person can't even try to skip the step.
 */
const initialPaymentState = {
  phase: "idle", // idle | sending | awaiting_otp | verifying | redirecting | verified | failed
  transactionRef: null,
  method: null, // which method + amount a "verified" payment was made for
  amount: null,
  debugOtp: null, // only ever set in simulator mode
  otp: "",
  error: null,
};

export default function Checkout() {
  const { items, subtotal, clearCart, loaded: cartLoaded } = useCart();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pricing = usePricing();

  const [address, setAddress] = useState(user?.address || "");
  const [city, setCity] = useState(user?.city || "");
  const [method, setMethod] = useState("card");
  const [mobile, setMobile] = useState("");
  const [cnicLast6, setCnicLast6] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState(""); // MM/YY
  const [cardCvv, setCardCvv] = useState("");
  const [placing, setPlacing] = useState(false);
  const [stage, setStage] = useState("form"); // form | paying | fraud | finalizing | flagged | cleared

  const [gatewayConfig, setGatewayConfig] = useState(null);
  const [payment, setPayment] = useState(initialPaymentState);
  // True while we're coming back from the card gateway's page and confirming with the server.
  const [returningFromCard, setReturningFromCard] = useState(() => searchParams.has("card"));
  const handledReturn = useRef(false); // the return handler must run exactly once (React dev mode runs effects twice)

  const discountTotal = items.reduce(
    (sum, item) => sum + (Number(item.product.price) - Number(item.product.final_price)) * item.quantity,
    0
  );
  const { shipping: shippingFee, tax: taxTotal, total } = pricing.totals(subtotal);

  useEffect(() => {
    paymentsApi.config().then((res) => setGatewayConfig(res.data.data)).catch(() => {});
  }, []);

  // Reset payment verification whenever the method or amount changes -- a
  // transaction verified for one amount/method must never silently carry
  // over to another. (A verified payment for exactly this method + amount is kept.)
  useEffect(() => {
    setPayment((p) =>
      p.phase === "verified" && p.method === method && Math.abs((p.amount ?? -1) - total) < 0.01
        ? p
        : initialPaymentState
    );
  }, [method, total]);

  // Coming back from the card gateway: ask OUR server whether it recorded the
  // payment (it only does so after verifying Safepay's signature), rather than
  // trusting anything in the URL.
  useEffect(() => {
    const result = searchParams.get("card");
    if (!result || handledReturn.current) return;
    handledReturn.current = true;
    const ref = searchParams.get("ref");

    let draft = null;
    try {
      draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
    } catch {
      /* ignore */
    }
    if (draft) {
      setAddress((a) => draft.address || a);
      setCity((c) => draft.city || c);
    }
    setMethod("card");

    const finish = () => {
      setReturningFromCard(false);
      navigate("/checkout", { replace: true }); // drop ?card=... from the URL
    };

    if (result !== "success" || !ref) {
      toast.error(
        result === "cancelled"
          ? "Card payment was cancelled. You have not been charged."
          : "We couldn't confirm your card payment. You have not been charged; please try again."
      );
      finish();
      return;
    }

    paymentsApi
      .cardStatus(ref)
      .then((res) => {
        const txn = res.data.data;
        if (txn.status !== "success") throw new Error("Payment not confirmed yet.");
        setPayment({
          ...initialPaymentState,
          phase: "verified",
          transactionRef: ref,
          method: "card",
          amount: Number(txn.amount),
        });
        toast.success("Card payment confirmed.");
      })
      .catch(() => toast.error("We couldn't confirm your card payment. Please try again."))
      .finally(() => {
        sessionStorage.removeItem(DRAFT_KEY);
        finish();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (returningFromCard || (!cartLoaded && items.length === 0)) {
    return (
      <div className="max-w-md mx-auto px-4 py-32 text-center">
        <Loader2 className="animate-spin text-berry-500 mx-auto mb-4" />
        <p className="text-ink/60">{returningFromCard ? "Confirming your card payment..." : "Loading checkout..."}</p>
      </div>
    );
  }
  if (items.length === 0) {
    navigate("/cart");
    return null;
  }

  const isWallet = method === "easypaisa" || method === "jazzcash";

  // ---------------------------------------------------------- Wallet OTP flow
  const sendWalletOtp = async () => {
    if (!PK_MOBILE_RE.test(mobile)) {
      setPayment({ ...initialPaymentState, phase: "failed", error: "Enter a valid number in the format 03XXXXXXXXX." });
      return;
    }
    setPayment({ ...initialPaymentState, phase: "sending" });
    try {
      const initiateFn = method === "easypaisa" ? paymentsApi.easypaisaInitiate : paymentsApi.jazzcashInitiate;
      const payload = { amount: total, mobile_number: mobile };
      if (method === "jazzcash") payload.cnic_last6 = cnicLast6;
      const res = await initiateFn(payload);
      const data = res.data.data;
      setPayment({
        ...initialPaymentState,
        phase: "awaiting_otp",
        transactionRef: data.transaction_ref,
        debugOtp: data.debug_otp || null,
      });
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      setPayment({ ...initialPaymentState, phase: "failed", error: msg });
    }
  };

  const confirmWalletOtp = async () => {
    setPayment((p) => ({ ...p, phase: "verifying", error: null }));
    try {
      const verifyFn = method === "easypaisa" ? paymentsApi.easypaisaVerify : paymentsApi.jazzcashVerify;
      await verifyFn({ transaction_ref: payment.transactionRef, otp: payment.otp });
      setPayment((p) => ({ ...p, phase: "verified", method, amount: total }));
      toast.success("Payment confirmed.");
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      setPayment((p) => ({ ...p, phase: "awaiting_otp", error: msg }));
    }
  };

  // ------------------------------------------------------------- Card flow
  // LIVE: send the customer to the gateway's own secure page. We never see the card.
  const payWithCardLive = async () => {
    if (!address || !city) {
      toast.error("Please fill in your shipping address and city first.");
      return;
    }
    setPayment({ ...initialPaymentState, phase: "redirecting" });
    try {
      const res = await paymentsApi.cardInitiate({ amount: total });
      const { checkout_url } = res.data.data;
      if (!checkout_url) throw new Error("The card gateway did not return a payment page.");
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ address, city }));
      window.location.assign(checkout_url);
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      setPayment({ ...initialPaymentState, phase: "failed", error: msg });
    }
  };

  // DEMO (no merchant keys): validate a demo card on our server. Nothing is charged or stored.
  const verifyCardDemo = async () => {
    const digitsOnly = cardNumber.replace(/\s/g, "");
    const [mm, yy] = cardExpiry.split("/").map((s) => s?.trim());
    if (digitsOnly.length < 12) {
      setPayment({ ...initialPaymentState, phase: "failed", error: "Enter a valid card number." });
      return;
    }
    setPayment({ ...initialPaymentState, phase: "verifying" });
    try {
      const initRes = await paymentsApi.cardInitiate({ amount: total });
      const txnRef = initRes.data.data.transaction_ref;
      await paymentsApi.cardConfirm({
        transaction_ref: txnRef,
        card_number: digitsOnly,
        exp_month: Number(mm),
        exp_year: Number(yy?.length === 2 ? `20${yy}` : yy),
        cvv: cardCvv,
      });
      setPayment({ ...initialPaymentState, phase: "verified", transactionRef: txnRef, method: "card", amount: total });
      toast.success("Demo card accepted.");
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      setPayment({ ...initialPaymentState, phase: "failed", error: msg });
    }
  };

  // ----------------------------------------------------------- Place order
  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (!address || !city) {
      toast.error("Please provide a shipping address and city.");
      return;
    }
    if (method !== "cod" && payment.phase !== "verified") {
      toast.error("Please complete payment verification first.");
      return;
    }

    setPlacing(true);
    try {
      setStage("paying");
      await wait(400);

      // The backend's ML fraud detection model (RandomForestClassifier)
      // scores this transaction here -- amount, type, simulated balances,
      // account age, and order velocity -- before deciding to confirm or
      // hold the order.
      setStage("fraud");
      const [res] = await Promise.all([
        ordersApi.checkout({
          payment_method: method,
          shipping_address: address,
          shipping_city: city,
          transaction_ref: method === "cod" ? undefined : payment.transactionRef,
        }),
        wait(900),
      ]);

      const order = res.data.data;
      const flagged = order.status === "held_for_review";

      setStage(flagged ? "flagged" : "cleared");
      await wait(1100);

      setStage("finalizing");
      await clearCart();
      await wait(300);

      navigate(`/order-confirmation/${order.id}`, { state: { order } });
    } catch (err) {
      toast.error(err.response?.data?.message || err.message);
      setStage("form");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      {stage !== "form" && <FraudCheckOverlay stage={stage} />}

      <h1 className="text-3xl mb-8">Checkout</h1>

      <form onSubmit={handlePlaceOrder} className="grid lg:grid-cols-[1fr_320px] gap-10">
        <div className="space-y-8">
          <section className="bg-white border border-ink/10 rounded-2xl p-6">
            <h2 className="font-display text-xl mb-5">Shipping details</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                label="Address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="House, street, area"
                required
                className="sm:col-span-2"
              />
              <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} required />
            </div>
          </section>

          <section className="bg-white border border-ink/10 rounded-2xl p-6">
            <h2 className="font-display text-xl mb-5">Payment method</h2>
            <div className="grid sm:grid-cols-2 gap-3 mb-5">
              {METHODS.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={`flex items-center gap-3 border rounded-xl px-4 py-3 text-sm text-left transition-colors ${
                    method === m.id ? "border-berry-500 bg-berry-50" : "border-ink/15 hover:border-ink/30"
                  }`}
                >
                  <m.icon size={18} className={method === m.id ? "text-berry-600" : "text-ink/50"} />
                  {m.label}
                </button>
              ))}
            </div>

            {!gatewayConfig?.[`${method}_live`] && method !== "cod" && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                Demo mode: no live merchant account is configured for this gateway, so a local check stands in for the
                real one. Add the gateway's credentials to the backend environment to switch to a real sandbox.
              </p>
            )}

            {/* ---- Card (live): hosted by the Pakistani gateway ---- */}
            {method === "card" && gatewayConfig?.card_live && (
              <div className="space-y-3">
                <div className="rounded-xl bg-petal px-4 py-3 text-sm text-ink/75 leading-relaxed">
                  You'll enter your card on <b>{gatewayConfig.card_provider}'s secure payment page</b> (Visa, Mastercard,
                  UnionPay and PayPak cards). Your card details never reach CosmoStore.
                  {gatewayConfig.card_environment === "sandbox" && (
                    <span className="block text-amber-700 mt-1">Sandbox mode: use the gateway's test cards, no real money moves.</span>
                  )}
                </div>
                {payment.phase !== "verified" ? (
                  <Button
                    type="button"
                    variant="dark"
                    onClick={payWithCardLive}
                    disabled={payment.phase === "redirecting"}
                  >
                    {payment.phase === "redirecting" ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={15} />}
                    {payment.phase === "redirecting" ? "Taking you to the secure page..." : `Pay ${formatPKR(total)} with card`}
                  </Button>
                ) : (
                  <p className="flex items-center gap-1.5 text-emerald-700 text-sm">
                    <CheckCircle2 size={15} /> Card payment confirmed. Review your order below and place it.
                  </p>
                )}
                {payment.error && <p className="text-sm text-red-600">{payment.error}</p>}
              </div>
            )}

            {method === "card" && !gatewayConfig?.card_live && (
              <div className="space-y-4">
                <p className="text-xs text-ink/55">
                  Demo card form: nothing is charged and the number is not stored. Try{" "}
                  <span className="font-mono">4242 4242 4242 4242</span> (approved) or{" "}
                  <span className="font-mono">4000 0000 0000 0002</span> (declined), any future expiry, any 3-digit CVV.
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Input
                    label="Card number"
                    placeholder="4242 4242 4242 4242"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    required
                    className="sm:col-span-2"
                    disabled={payment.phase === "verified"}
                  />
                  <Input
                    label="Expiry"
                    placeholder="MM/YY"
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(e.target.value)}
                    required
                    disabled={payment.phase === "verified"}
                  />
                  <Input
                    label="CVV"
                    placeholder="123"
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value)}
                    required
                    disabled={payment.phase === "verified"}
                  />
                </div>
                {payment.phase !== "verified" ? (
                  <Button type="button" variant="outline" onClick={verifyCardDemo} disabled={payment.phase === "verifying"}>
                    {payment.phase === "verifying" ? <Loader2 size={14} className="animate-spin" /> : null}
                    Verify card
                  </Button>
                ) : (
                  <p className="flex items-center gap-1.5 text-emerald-700 text-sm">
                    <CheckCircle2 size={15} /> Demo card accepted.
                  </p>
                )}
                {payment.error && <p className="text-sm text-red-600">{payment.error}</p>}
              </div>
            )}

            {/* ---- Wallets ---- */}
            {isWallet && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Input
                    label="Mobile number"
                    placeholder="03XXXXXXXXX"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    required
                    disabled={payment.phase === "awaiting_otp" || payment.phase === "verified"}
                  />
                  {method === "jazzcash" && (
                    <Input
                      label="CNIC (last 6 digits)"
                      placeholder="123456"
                      value={cnicLast6}
                      onChange={(e) => setCnicLast6(e.target.value)}
                      required
                      disabled={payment.phase === "awaiting_otp" || payment.phase === "verified"}
                    />
                  )}
                </div>

                {payment.phase === "idle" || payment.phase === "failed" || payment.phase === "sending" ? (
                  <Button type="button" variant="outline" onClick={sendWalletOtp} disabled={payment.phase === "sending"}>
                    {payment.phase === "sending" ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                    {payment.phase === "sending" ? "Sending..." : "Send OTP"}
                  </Button>
                ) : null}

                {(payment.phase === "awaiting_otp" || payment.phase === "verifying") && (
                  <div className="bg-blush/40 rounded-xl p-4 space-y-3">
                    {payment.debugOtp && (
                      <p className="text-xs text-amber-700">
                        Simulator mode - your OTP is <span className="font-mono font-semibold">{payment.debugOtp}</span>
                      </p>
                    )}
                    <div className="flex gap-3 items-end">
                      <Input
                        label="Enter OTP"
                        value={payment.otp}
                        onChange={(e) => setPayment((p) => ({ ...p, otp: e.target.value }))}
                        maxLength={4}
                        className="max-w-[140px]"
                      />
                      <Button type="button" onClick={confirmWalletOtp} disabled={payment.phase === "verifying" || payment.otp.length !== 4}>
                        {payment.phase === "verifying" ? <Loader2 size={14} className="animate-spin" /> : "Confirm"}
                      </Button>
                    </div>
                  </div>
                )}

                {payment.phase === "verified" && (
                  <p className="flex items-center gap-1.5 text-emerald-700 text-sm">
                    <CheckCircle2 size={15} /> Payment confirmed via {method === "easypaisa" ? "Easypaisa" : "JazzCash"}.
                  </p>
                )}
                {payment.error && <p className="text-sm text-red-600">{payment.error}</p>}
              </div>
            )}

            {method === "cod" && (
              <p className="text-sm text-ink/60">Pay in cash when your order is delivered.</p>
            )}
          </section>

          <div className="flex items-start gap-2.5 text-xs text-ink/50 bg-blush/50 rounded-xl px-4 py-3">
            <ShieldCheck size={16} className="text-berry-500 shrink-0 mt-0.5" />
            Every order is automatically screened by our ML-based fraud detection system before it's
            confirmed. Most orders confirm instantly - a small number are held briefly for manual review.
          </div>
        </div>

        {/* Summary */}
        <div className="bg-white border border-ink/10 rounded-2xl p-6 h-fit sticky top-24">
          <h2 className="font-display text-xl mb-5">Order summary</h2>
          <div className="space-y-2.5 text-sm mb-5 max-h-52 overflow-y-auto pr-1">
            {items.map((item) => (
              <div key={item.id} className="flex justify-between text-ink/70">
                <span className="truncate pr-2">
                  {item.product.name} × {item.quantity}
                </span>
                <span className="shrink-0">{formatPKR(item.subtotal)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-2 text-sm border-t border-ink/10 pt-4 mb-4">
            <div className="flex justify-between text-ink/70">
              <span>Subtotal</span>
              <span>{formatPKR(subtotal + discountTotal)}</span>
            </div>
            {discountTotal > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount</span>
                <span>-{formatPKR(discountTotal)}</span>
              </div>
            )}
            <div className="flex justify-between text-ink/70">
              <span>Tax</span>
              <span>{taxTotal === 0 ? "Rs 0" : formatPKR(taxTotal)}</span>
            </div>
            <div className="flex justify-between text-ink/70">
              <span>Shipping</span>
              <span>{shippingFee === 0 ? "Free" : formatPKR(shippingFee)}</span>
            </div>
          </div>
          <div className="flex justify-between font-semibold text-lg border-t border-ink/10 pt-4 mb-6">
            <span>Total</span>
            <span>{formatPKR(total)}</span>
          </div>
          <Button type="submit" disabled={placing || (method !== "cod" && payment.phase !== "verified")} className="w-full">
            {placing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Processing...
              </>
            ) : (
              "Place order"
            )}
          </Button>
          {method !== "cod" && payment.phase !== "verified" && (
            <p className="text-xs text-ink/45 text-center mt-2">Complete payment verification above to continue.</p>
          )}
        </div>
      </form>
    </div>
  );
}
