"""
Payment gateway endpoints: JazzCash, Easypaisa, and card (Stripe).

Every route here creates or updates a PaymentTransaction row, which is the
backend's own record of whether money actually moved. Checkout
(app/routes/orders.py) requires a SUCCESS transaction owned by the current
user with a matching amount before it will place a non-COD order -- it does
not trust anything the frontend merely claims. See app/payment_gateways/
for what "real" vs "simulator" mode means for each gateway.
"""
from flask import Blueprint, request, current_app
from flask_login import login_required, current_user

from app.extensions import db
from app.models import PaymentTransaction, PaymentTxnStatusEnum
from app.utils import api_response
from app.payment_gateways import jazzcash, easypaisa, card_stripe

payments_bp = Blueprint("payments", __name__, url_prefix="/api/payments")


@payments_bp.route("/config", methods=["GET"])
@login_required
def payment_config():
    """Tells the frontend which gateways are running against a real
    merchant account vs the local simulator, and hands over the Stripe
    publishable key (safe for the browser) for card entry."""
    return api_response(True, data={
        "jazzcash_live": jazzcash.is_configured(),
        "easypaisa_live": easypaisa.is_configured(),
        "card_live": card_stripe.is_configured(),
        "stripe_publishable_key": card_stripe.publishable_key(),
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
@payments_bp.route("/card/initiate", methods=["POST"])
@login_required
def card_initiate():
    """Real mode: creates a Stripe PaymentIntent; the frontend confirms it
    client-side with Stripe Elements (card digits never reach this server).
    Simulator mode: just reserves a transaction reference -- the card is
    validated in /card/confirm instead."""
    data = request.get_json(force=True, silent=True) or {}
    amount = _get_amount(data)
    if amount is None:
        return api_response(False, "A valid amount is required.", status=400)

    result = card_stripe.create_payment_intent(amount, order_ref=f"CS-{current_user.id}")
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
    if result.get("client_secret"):
        payload["client_secret"] = result["client_secret"]
    return api_response(True, "Card payment initiated.", data=payload)


@payments_bp.route("/card/confirm", methods=["POST"])
@login_required
def card_confirm():
    data = request.get_json(force=True, silent=True) or {}
    txn_ref = data.get("transaction_ref")

    txn = PaymentTransaction.query.filter_by(
        transaction_ref=txn_ref, user_id=current_user.id, gateway="card",
    ).first()
    if not txn or txn.status != PaymentTxnStatusEnum.PENDING:
        return api_response(False, "No pending card transaction found for this reference.", status=400)

    if txn.is_live_gateway:
        # Stripe: never trust the frontend's own claim of success -- ask Stripe.
        result = card_stripe.confirm_payment_intent(txn.transaction_ref)
    else:
        result = card_stripe.confirm_simulated(
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
    return api_response(True, "Card charged successfully.", data=txn.to_dict())
