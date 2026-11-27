"""
Pakistani debit / credit card payments through Safepay (replaces Stripe).

Why Safepay
-----------
Stripe cannot pay out to Pakistani merchants, and it settles in USD. Safepay is
a Pakistan-based gateway that settles in PKR and accepts local and
international cards (Visa, Mastercard, UnionPay, PayPak -- confirm the exact
list enabled on your merchant account in the Safepay dashboard).

How the live flow works (hosted checkout -- card digits never touch our server)
--------------------------------------------------------------------------------
1. initiate : we call Safepay's  POST /order/v1/init  with the amount in PKR and
              get back a *tracker* token. We build Safepay's hosted-checkout URL
              for that tracker and send the browser there.
2. pay      : the customer types the card on Safepay's page (3-D Secure etc. is
              handled by Safepay/the issuing bank).
3. return   : Safepay redirects the browser back to OUR backend
              (/api/payments/card/return) with  tracker, reference, sig.
              sig = HMAC-SHA256(tracker, SAFEPAY_SECRET_KEY). We recompute it and
              only then mark the PaymentTransaction SUCCESS. Nothing the browser
              claims is trusted on its own.
4. webhook  : Safepay also POSTs a signed event (X-SFPY-SIGNATURE) to
              /api/payments/card/webhook, a second, server-to-server confirmation
              for customers who close the tab before being redirected back.

Demo mode (no SAFEPAY_* keys in the environment)
------------------------------------------------
So the project still runs for development and the viva without a merchant
account, a clearly-labelled *demo* card form is shown and validated here
(Luhn checksum, expiry, CVV). It never talks to a bank and nothing is charged.
Card numbers entered in demo mode are validated in memory and never stored.

Test numbers for demo mode:
    4242 4242 4242 4242   -> approved (Visa)
    5555 5555 5555 4444   -> approved (Mastercard)
    4000 0000 0000 0002   -> declined by the "issuer"
"""
import hashlib
import hmac
from urllib.parse import urlencode

import requests
from flask import current_app

from .common import luhn_check, is_card_expired, new_transaction_ref

SANDBOX_API = "https://sandbox.api.getsafepay.com"
PRODUCTION_API = "https://api.getsafepay.com"

# Demo-mode "issuer decline" card, so the failure path can be shown too.
DEMO_DECLINE_CARD = "4000000000000002"


# ----------------------------------------------------------------- config
def _cfg(key, default=""):
    return current_app.config.get(key) or default


def is_configured() -> bool:
    return bool(_cfg("SAFEPAY_API_KEY") and _cfg("SAFEPAY_SECRET_KEY"))


def environment() -> str:
    return "production" if _cfg("SAFEPAY_ENV", "sandbox") == "production" else "sandbox"


def _api_base() -> str:
    # SAFEPAY_BASE_URL exists only so the flow can be tested against a local
    # stand-in server; leave it empty in real deployments.
    override = _cfg("SAFEPAY_BASE_URL")
    if override:
        return override.rstrip("/")
    return PRODUCTION_API if environment() == "production" else SANDBOX_API


# ------------------------------------------------------- card scheme (demo UI)
def detect_scheme(card_number: str) -> str:
    """Best-effort card scheme from the leading digits, for a friendlier demo UI."""
    d = "".join(c for c in (card_number or "") if c.isdigit())
    if d.startswith("4"):
        return "Visa"
    if d[:2] in {"51", "52", "53", "54", "55"} or (d[:4].isdigit() and 2221 <= int(d[:4]) <= 2720):
        return "Mastercard"
    if d.startswith("62"):
        return "UnionPay"
    return "Card"


# ------------------------------------------------------------- live: initiate
def create_checkout(amount_pkr: float, order_ref: str, return_url: str, cancel_url: str) -> dict:
    """Start a payment.

    Live  -> {"ok", "is_live_gateway": True,  "transaction_ref": <tracker>, "checkout_url": ...}
    Demo  -> {"ok", "is_live_gateway": False, "transaction_ref": <local ref>}
    """
    if not is_configured():
        return {"ok": True, "is_live_gateway": False, "transaction_ref": new_transaction_ref("CARD")}

    try:
        resp = requests.post(
            f"{_api_base()}/order/v1/init",
            json={
                "client": _cfg("SAFEPAY_API_KEY"),
                "amount": round(float(amount_pkr), 2),
                "currency": "PKR",
                "environment": environment(),
            },
            timeout=15,
        )
        body = resp.json()
        tracker = (body.get("data") or {}).get("token")
        if resp.status_code >= 400 or not tracker:
            msg = ((body.get("status") or {}).get("message")) or "Safepay did not return a payment tracker."
            return {"ok": False, "error": f"Card gateway error: {msg}"}
    except (requests.RequestException, ValueError) as e:
        return {"ok": False, "error": f"Could not reach the card gateway: {e}"}

    checkout_url = f"{_api_base()}/components?" + urlencode({
        "env": environment(),
        "beacon": tracker,
        "source": "cosmostore",
        "order_id": order_ref,
        "redirect_url": return_url,
        "cancel_url": cancel_url,
    })
    return {
        "ok": True,
        "is_live_gateway": True,
        "transaction_ref": tracker,
        "checkout_url": checkout_url,
    }


# ------------------------------------------------------ live: verify callbacks
def verify_return_signature(tracker: str, signature: str) -> bool:
    """sig = HMAC-SHA256(tracker) keyed with the merchant's Safepay secret key."""
    secret = _cfg("SAFEPAY_SECRET_KEY")
    if not (secret and tracker and signature):
        return False
    expected = hmac.new(secret.encode(), tracker.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.strip().lower())


def verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
    """X-SFPY-SIGNATURE = HMAC-SHA512 of the raw request body, keyed with the
    webhook secret. Fails closed: with no secret configured nothing verifies."""
    secret = _cfg("SAFEPAY_WEBHOOK_SECRET")
    if not (secret and raw_body and signature):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature.strip().lower())


# -------------------------------------------------------------- demo: validate
def confirm_simulated(card_number: str, exp_month, exp_year, cvv: str) -> dict:
    """Demo-mode card validation -- deterministic, nothing is charged or stored."""
    digits = "".join(c for c in (card_number or "") if c.isdigit())
    if not luhn_check(digits):
        return {"ok": False, "error": "Card number failed validation. Check the digits and try again."}
    if not cvv or not cvv.isdigit() or len(cvv) not in (3, 4):
        return {"ok": False, "error": "Enter a valid CVV."}
    try:
        if is_card_expired(int(exp_month), int(exp_year)):
            return {"ok": False, "error": "This card has expired."}
    except (TypeError, ValueError):
        return {"ok": False, "error": "Enter a valid expiry month/year."}
    if digits == DEMO_DECLINE_CARD:
        return {"ok": False, "error": "Your bank declined this card. Try another card."}
    return {"ok": True, "error": None, "scheme": detect_scheme(digits)}
