from flask import current_app

from .common import luhn_check, is_card_expired, new_transaction_ref


def is_configured():
    return bool(current_app.config.get("STRIPE_SECRET_KEY"))


def publishable_key():
    return current_app.config.get("STRIPE_PUBLISHABLE_KEY") or None


def create_payment_intent(amount_pkr: float, order_ref: str):
    """Real mode: ask Stripe to create a PaymentIntent and hand the
    client_secret to the frontend, which confirms it with Stripe Elements.
    Simulator mode: nothing to create yet -- card details are validated
    directly in confirm_simulated()."""
    if not is_configured():
        return {"ok": True, "is_live_gateway": False, "transaction_ref": new_transaction_ref("CARD")}

    import stripe
    stripe.api_key = current_app.config["STRIPE_SECRET_KEY"]
    try:
        intent = stripe.PaymentIntent.create(
            amount=int(round(amount_pkr * 100)),
            currency="usd",  # Stripe doesn't settle in PKR; amount is illustrative in test mode
            metadata={"order_ref": order_ref},
            automatic_payment_methods={"enabled": True},
        )
    except Exception as e:
        return {"ok": False, "error": f"Stripe error: {e}"}

    return {
        "ok": True,
        "is_live_gateway": True,
        "transaction_ref": intent.id,
        "client_secret": intent.client_secret,
    }


def confirm_payment_intent(payment_intent_id: str):
    """Real mode: ask Stripe whether the PaymentIntent the frontend just
    confirmed actually succeeded. Never trust the frontend's own claim."""
    import stripe
    stripe.api_key = current_app.config["STRIPE_SECRET_KEY"]
    try:
        intent = stripe.PaymentIntent.retrieve(payment_intent_id)
    except Exception as e:
        return {"ok": False, "error": f"Stripe error: {e}"}

    success = intent.status == "succeeded"
    return {"ok": success, "error": None if success else f"Payment status: {intent.status}"}


def confirm_simulated(card_number: str, exp_month: int, exp_year: int, cvv: str):
    """Simulator-mode card validation -- deterministic, not random."""
    digits_only = (card_number or "").replace(" ", "").replace("-", "")
    if not luhn_check(digits_only):
        return {"ok": False, "error": "Card number failed validation. Check the digits and try again."}
    if not cvv or not cvv.isdigit() or len(cvv) not in (3, 4):
        return {"ok": False, "error": "Enter a valid CVV."}
    try:
        if is_card_expired(int(exp_month), int(exp_year)):
            return {"ok": False, "error": "This card has expired."}
    except (TypeError, ValueError):
        return {"ok": False, "error": "Enter a valid expiry month/year."}
    return {"ok": True, "error": None}
