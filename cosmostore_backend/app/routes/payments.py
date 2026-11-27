"""
Payment gateway endpoints: JazzCash, Easypaisa, and Pakistani debit/credit cards (Safepay).

Every route here creates or updates a PaymentTransaction row, which is the
backend's own record of whether money actually moved. Checkout
(app/routes/orders.py) requires a SUCCESS transaction owned by the current
user with a matching amount before it will place a non-COD order -- it does
not trust anything the frontend merely claims. See app/payment_gateways/
for what "real" vs "simulator" mode means for each gateway.
"""
import json

from flask import Blueprint, request, current_app, redirect
from flask_login import login_required, current_user

from app.extensions import db
from app.models import PaymentTransaction, PaymentTxnStatusEnum
from app.utils import api_response
from app.payment_gateways import jazzcash, easypaisa, card_pk

payments_bp = Blueprint("payments", __name__, url_prefix="/api/payments")


@payments_bp.route("/pricing", methods=["GET"])
def pricing_rules():
    """Public: the tax and shipping rules, so every screen shows the same totals the server will charge."""
    cfg = current_app.config
    return api_response(True, data={
        "tax_rate": float(cfg.get("SALES_TAX_RATE", 0.0)),
        "free_shipping_threshold": float(cfg.get("FREE_SHIPPING_THRESHOLD", 5000)),
        "shipping_fee": float(cfg.get("SHIPPING_FEE", 150)),
    })


@payments_bp.route("/config", methods=["GET"])
@login_required
def payment_config():
    """Tells the frontend which gateways are running against a real merchant
    account vs the local demo, plus the pricing rules it needs to show totals."""
    return api_response(True, data={
        "jazzcash_live": jazzcash.is_configured(),
        "easypaisa_live": easypaisa.is_configured(),
        "card_live": card_pk.is_configured(),
        "card_provider": "Safepay",
        "card_environment": card_pk.environment() if card_pk.is_configured() else "demo",
        "tax_rate": float(current_app.config.get("SALES_TAX_RATE", 0.0)),
        "free_shipping_threshold": float(current_app.config.get("FREE_SHIPPING_THRESHOLD", 5000)),
        "shipping_fee": float(current_app.config.get("SHIPPING_FEE", 150)),
    })


def _get_amount(data):
    try:
        amount = float(data.get("amount"))
        if amount <= 0:
            return None
        return round(amount, 2)
    except (TypeError, ValueError):
        return None


# --------------------------------------------------------------- JazzCash
@payments_bp.route("/jazzcash/initiate", methods=["POST"])
@login_required
def jazzcash_initiate():
    data = request.get_json(force=True, silent=True) or {}
    amount = _get_amount(data)
    mobile_number = (data.get("mobile_number") or "").strip()
    cnic_last6 = (data.get("cnic_last6") or "").strip()
    if amount is None:
        return api_response(False, "A valid amount is required.", status=400)

    result = jazzcash.initiate(mobile_number, cnic_last6, amount, order_ref=f"CS-{current_user.id}")
    if not result.get("ok") and "transaction_ref" not in result:
        return api_response(False, result.get("error", "JazzCash request failed."), status=400)

    txn = PaymentTransaction(
        user_id=current_user.id,
        gateway="jazzcash",
        transaction_ref=result["transaction_ref"],
        amount=amount,
        is_live_gateway=result.get("is_live_gateway", False),
        otp_hash=result.get("otp_hash"),
        otp_expires_at=result.get("otp_expires_at"),
    )

    if result.get("immediate"):
        # Real-mode MWALLET resolves synchronously -- no OTP step.
        txn.status = PaymentTxnStatusEnum.SUCCESS if result["ok"] else PaymentTxnStatusEnum.FAILED
        db.session.add(txn)
        db.session.commit()
        if not result["ok"]:
            return api_response(False, result.get("error", "JazzCash declined the transaction."), status=400)
        return api_response(True, "Payment confirmed via JazzCash.", data=txn.to_dict())

    db.session.add(txn)
    db.session.commit()
    return api_response(
        True,
        "An OTP/MPIN prompt has been sent." if result.get("is_live_gateway")
        else "Simulator mode: enter the OTP shown below to confirm payment.",
        data=txn.to_dict(reveal_debug_otp=result.get("debug_otp")),
    )


@payments_bp.route("/jazzcash/verify", methods=["POST"])
@login_required
def jazzcash_verify():
    data = request.get_json(force=True, silent=True) or {}
    txn_ref = data.get("transaction_ref")
    otp = (data.get("otp") or "").strip()

    txn = PaymentTransaction.query.filter_by(
        transaction_ref=txn_ref, user_id=current_user.id, gateway="jazzcash",
    ).first()
    if not txn or txn.status != PaymentTxnStatusEnum.PENDING:
        return api_response(False, "No pending JazzCash transaction found for this reference.", status=400)

    txn.attempt_count = (txn.attempt_count or 0) + 1
    if txn.attempt_count > 5:
        txn.status = PaymentTxnStatusEnum.FAILED
        db.session.commit()
        return api_response(False, "Too many attempts. Please start a new payment.", status=400)

    result = jazzcash.verify(txn_ref, otp, txn.otp_hash)
    if not result["ok"]:
        db.session.commit()  # persist attempt_count increment
        return api_response(False, result["error"], status=400)

    txn.status = PaymentTxnStatusEnum.SUCCESS
    db.session.commit()
    return api_response(True, "Payment confirmed via JazzCash.", data=txn.to_dict())


# -------------------------------------------------------------- Easypaisa
@payments_bp.route("/easypaisa/initiate", methods=["POST"])
@login_required
def easypaisa_initiate():
    data = request.get_json(force=True, silent=True) or {}
    amount = _get_amount(data)
    mobile_number = (data.get("mobile_number") or "").strip()
    if amount is None:
        return api_response(False, "A valid amount is required.", status=400)

    order_ref = f"CS-{current_user.id}"
    result = easypaisa.initiate(mobile_number, amount, order_ref)
    if not result.get("ok"):
        return api_response(False, result.get("error", "Easypaisa request failed."), status=400)

    txn = PaymentTransaction(
        user_id=current_user.id,
        gateway="easypaisa",
        transaction_ref=result["transaction_ref"],
        amount=amount,
        is_live_gateway=result.get("is_live_gateway", False),
        otp_hash=result.get("otp_hash"),
        otp_expires_at=result.get("otp_expires_at"),
    )
    db.session.add(txn)
    db.session.commit()

    return api_response(
        True,
        "Easypaisa sent an OTP to this number." if result.get("is_live_gateway")
        else "Simulator mode: enter the OTP shown below to confirm payment.",
        data=txn.to_dict(reveal_debug_otp=result.get("debug_otp")),
    )


@payments_bp.route("/easypaisa/verify", methods=["POST"])
@login_required
def easypaisa_verify():
    data = request.get_json(force=True, silent=True) or {}
    txn_ref = data.get("transaction_ref")
    otp = (data.get("otp") or "").strip()

    txn = PaymentTransaction.query.filter_by(
        transaction_ref=txn_ref, user_id=current_user.id, gateway="easypaisa",
    ).first()
    if not txn or txn.status != PaymentTxnStatusEnum.PENDING:
        return api_response(False, "No pending Easypaisa transaction found for this reference.", status=400)

    txn.attempt_count = (txn.attempt_count or 0) + 1
    if txn.attempt_count > 5:
        txn.status = PaymentTxnStatusEnum.FAILED
        db.session.commit()
        return api_response(False, "Too many attempts. Please start a new payment.", status=400)

    result = easypaisa.verify(txn_ref, otp, order_ref=f"CS-{current_user.id}",
                               amount_pkr=float(txn.amount), stored_otp_hash=txn.otp_hash)
    if not result["ok"]:
        db.session.commit()
        return api_response(False, result["error"], status=400)

    txn.status = PaymentTxnStatusEnum.SUCCESS
    db.session.commit()
    return api_response(True, "Payment confirmed via Easypaisa.", data=txn.to_dict())


# ------------------------------------------------------------------- Card
# Pakistani card payments via Safepay (see app/payment_gateways/card_pk.py).
# Live mode  : hosted checkout -> browser returns to /card/return (signed) and
#              Safepay also calls /card/webhook. Card digits never reach us.
# Demo mode  : no SAFEPAY_* keys -> /card/confirm validates a demo card locally.

def _frontend_url():
    return (current_app.config.get("FRONTEND_URL") or "http://localhost:5173").rstrip("/")


def _backend_url():
    return (current_app.config.get("BACKEND_PUBLIC_URL") or request.host_url).rstrip("/")


def _card_txn_by_tracker(tracker):
    if not tracker:
        return None
    return PaymentTransaction.query.filter_by(
        transaction_ref=tracker, gateway="card", is_live_gateway=True,
    ).first()


def _mark_card_paid(txn, reference=None):
    """Idempotent: a repeat callback for an already-paid transaction is a no-op."""
    if txn.status == PaymentTxnStatusEnum.PENDING:
        txn.status = PaymentTxnStatusEnum.SUCCESS
        if reference:
            txn.meta_json = json.dumps({"safepay_reference": reference})
    return txn.status == PaymentTxnStatusEnum.SUCCESS


@payments_bp.route("/card/initiate", methods=["POST"])
@login_required
def card_initiate():
    data = request.get_json(force=True, silent=True) or {}
    amount = _get_amount(data)
    if amount is None:
        return api_response(False, "A valid amount is required.", status=400)

    result = card_pk.create_checkout(
        amount,
        order_ref=f"CS-{current_user.id}",
        return_url=f"{_backend_url()}/api/payments/card/return",
        cancel_url=f"{_backend_url()}/api/payments/card/cancel",
    )
    if not result.get("ok"):
        return api_response(False, result.get("error", "Could not start card payment."), status=400)

    txn = PaymentTransaction(
        user_id=current_user.id,
        gateway="card",
        transaction_ref=result["transaction_ref"],
        amount=amount,
        is_live_gateway=result.get("is_live_gateway", False),
    )
    db.session.add(txn)
    db.session.commit()

    payload = txn.to_dict()
    if result.get("checkout_url"):
        payload["checkout_url"] = result["checkout_url"]
    return api_response(True, "Card payment initiated.", data=payload)


@payments_bp.route("/card/return", methods=["GET", "POST"])
def card_return():
    """Safepay sends the customer's browser back here after paying.

    Deliberately NOT login-protected: this is a cross-site redirect (and
    possibly a POST), so the session cookie may not be sent. Authenticity
    comes from the HMAC signature over the tracker instead, and the tracker
    must match a transaction we created.
    """
    tracker = request.values.get("tracker")
    signature = request.values.get("sig")
    reference = request.values.get("reference")
    back = f"{_frontend_url()}/checkout"

    txn = _card_txn_by_tracker(tracker)
    if not txn or not card_pk.verify_return_signature(tracker, signature):
        return redirect(f"{back}?card=error")

    _mark_card_paid(txn, reference)
    db.session.commit()
    return redirect(f"{back}?card=success&ref={tracker}")


@payments_bp.route("/card/cancel", methods=["GET", "POST"])
def card_cancel():
    tracker = request.values.get("tracker")
    txn = _card_txn_by_tracker(tracker)
    if txn and txn.status == PaymentTxnStatusEnum.PENDING:
        txn.status = PaymentTxnStatusEnum.FAILED
        db.session.commit()
    return redirect(f"{_frontend_url()}/checkout?card=cancelled")


@payments_bp.route("/card/webhook", methods=["POST"])
def card_webhook():
    """Server-to-server confirmation from Safepay (signed with the webhook secret)."""
    raw = request.get_data()
    if not card_pk.verify_webhook_signature(raw, request.headers.get("X-SFPY-SIGNATURE", "")):
        return api_response(False, "Invalid signature.", status=401)

    event = request.get_json(force=True, silent=True) or {}
    notification = event.get("notification") or event.get("data") or {}
    tracker = notification.get("tracker") or event.get("tracker")
    txn = _card_txn_by_tracker(tracker)
    if not txn:
        return api_response(True, "Ignored: unknown tracker.")  # 200 so Safepay doesn't retry forever

    event_type = str(event.get("type", ""))
    if event_type.startswith("payment:created") or event_type.endswith("succeeded"):
        _mark_card_paid(txn, notification.get("reference"))
        db.session.commit()
    return api_response(True, "Webhook processed.")


@payments_bp.route("/card/status/<ref>", methods=["GET"])
@login_required
def card_status(ref):
    """Lets the checkout page confirm, after the redirect back, that *the server*
    recorded this payment as successful for the logged-in user."""
    txn = PaymentTransaction.query.filter_by(transaction_ref=ref, user_id=current_user.id, gateway="card").first()
    if not txn:
        return api_response(False, "Payment not found.", status=404)
    return api_response(True, data=txn.to_dict())


@payments_bp.route("/card/confirm", methods=["POST"])
@login_required
def card_confirm():
    """DEMO mode only: validates a demo card. Live payments are confirmed by
    the signed return/webhook above, never by anything the browser sends."""
    data = request.get_json(force=True, silent=True) or {}
    txn_ref = data.get("transaction_ref")

    txn = PaymentTransaction.query.filter_by(
        transaction_ref=txn_ref, user_id=current_user.id, gateway="card",
    ).first()
    if not txn or txn.status != PaymentTxnStatusEnum.PENDING:
        return api_response(False, "No pending card transaction found for this reference.", status=400)
    if txn.is_live_gateway:
        return api_response(False, "This payment is completed on the card gateway's secure page.", status=400)

    result = card_pk.confirm_simulated(
        card_number=data.get("card_number", ""),
        exp_month=data.get("exp_month"),
        exp_year=data.get("exp_year"),
        cvv=data.get("cvv", ""),
    )

    if not result["ok"]:
        txn.attempt_count = (txn.attempt_count or 0) + 1
        if txn.attempt_count > 5:
            txn.status = PaymentTxnStatusEnum.FAILED
        db.session.commit()
        return api_response(False, result["error"], status=400)

    txn.status = PaymentTxnStatusEnum.SUCCESS
    db.session.commit()
    return api_response(True, "Card accepted (demo mode, no money was charged).", data=txn.to_dict())
