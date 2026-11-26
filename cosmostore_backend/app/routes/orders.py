import json
from datetime import datetime, timedelta

from flask import Blueprint, request, current_app
from flask_login import login_required, current_user

from app.extensions import db, mail
from app.models import (
    Order, OrderItem, CartItem, Product, FraudCheck, Notification,
    OrderStatusEnum, PaymentMethodEnum, RoleEnum, PaymentTransaction, PaymentTxnStatusEnum,
    StoreStatusEnum,
)
from app.ml.fraud_predictor import predict_fraud, is_model_trained
from app.ml.risk_rules import evaluate_rules, combine, effective_account_age_days
from app.notifications import notify_admins
from app.utils import api_response, generate_order_number, role_required
from flask_mail import Message

orders_bp = Blueprint("orders", __name__, url_prefix="/api/orders")

# Maps our checkout payment method to a PaySim-style transaction "type",
# which is the categorical feature the fraud model was trained on.
PAYMENT_TO_TXN_TYPE = {
    PaymentMethodEnum.CARD: "PAYMENT",
    PaymentMethodEnum.EASYPAISA: "TRANSFER",
    PaymentMethodEnum.JAZZCASH: "TRANSFER",
    PaymentMethodEnum.COD: "DEBIT",
}

# Maps a checkout payment method to the PaymentTransaction.gateway value
# written by app/routes/payments.py. COD has no row to look up.
PAYMENT_TO_GATEWAY = {
    PaymentMethodEnum.CARD: "card",
    PaymentMethodEnum.EASYPAISA: "easypaisa",
    PaymentMethodEnum.JAZZCASH: "jazzcash",
}

# Rounding tolerance when comparing a paid transaction's amount to the
# cart's grand total (covers float/Decimal rounding, nothing more).
AMOUNT_MATCH_TOLERANCE = 1.0

# Vendors only ever see orders that have cleared fraud screening. Held,
# pending and rejected orders are invisible to them, so a flagged order can
# never be packed or shipped before an admin has decided on it.
VENDOR_VISIBLE_STATUSES = (
    OrderStatusEnum.CONFIRMED,
    OrderStatusEnum.SHIPPED,
    OrderStatusEnum.DELIVERED,
    OrderStatusEnum.CANCELLED,
)


def _consume_verified_transaction(payment_method_enum, user_id, transaction_ref, grand_total):
    """Looks up a PaymentTransaction the gateway endpoints actually marked
    SUCCESS, confirms it belongs to this user, hasn't already been spent on
    another order, and matches the amount being charged right now. Returns
    (transaction_or_None, error_message_or_None). This is what stops
    checkout from completing on a payment that was never actually verified
    -- a transaction_ref has to exist, with a real SUCCESS status this
    server itself recorded, or checkout is refused outright."""
    if payment_method_enum == PaymentMethodEnum.COD:
        return None, None

    if not transaction_ref:
        return None, "Payment was not completed. Please complete payment before placing the order."

    gateway = PAYMENT_TO_GATEWAY[payment_method_enum]
    txn = PaymentTransaction.query.filter_by(
        transaction_ref=transaction_ref, user_id=user_id, gateway=gateway,
    ).first()

    if not txn:
        return None, "We couldn't find a matching payment for this order."
    if txn.status != PaymentTxnStatusEnum.SUCCESS:
        return None, "This payment was not successfully verified."
    if txn.order_id is not None:
        return None, "This payment has already been used for another order."
    if abs(float(txn.amount) - grand_total) > AMOUNT_MATCH_TOLERANCE:
        return None, "The verified payment amount doesn't match your cart total. Please pay again."

    return txn, None


def _simulate_balances(user, amount):
    """
    The Kaggle PaySim dataset models mobile-money-style wallet balances
    (oldbalanceOrg/newbalanceOrig for the payer, oldbalanceDest/newbalanceDest
    for the receiver). A cosmetics storefront doesn't track literal wallet
    balances, so we derive plausible ones from the customer's real order
    history/account age, keeping the same signal the model was trained on:
    genuine, established accounts carry balances comfortably above the
    transaction amount, while new/thin accounts look "tight" relative to it.
    """
    established_factor = min(5.0, 1.0 + effective_account_age_days(user) / 90.0)
    old_balance_org = round(max(amount * 1.05, amount * established_factor), 2)
    new_balance_org = round(max(0.0, old_balance_org - amount), 2)

    # Vendor/platform-side "destination" balance - approximate with a
    # stable baseline since we don't operate real merchant wallets.
    old_balance_dest = round(amount * 3.0, 2)
    new_balance_dest = round(old_balance_dest + amount, 2)

    return old_balance_org, new_balance_org, old_balance_dest, new_balance_dest


def _orders_last_24h(user_id):
    since = datetime.utcnow() - timedelta(hours=24)
    return Order.query.filter(Order.customer_id == user_id, Order.created_at >= since).count()


def _notify(user_id, title, message):
    db.session.add(Notification(user_id=user_id, title=title, message=message))


def _send_email_safe(subject, recipient, body):
    try:
        msg = Message(subject=subject, recipients=[recipient], body=body)
        mail.send(msg)
    except Exception:
        # Never let email failures break the checkout flow in dev/demo mode
        pass


@orders_bp.route("/checkout", methods=["POST"])
@login_required
@role_required(RoleEnum.CUSTOMER)
def checkout():
    data = request.get_json(force=True, silent=True) or {}
    payment_method = data.get("payment_method")
    transaction_ref = data.get("transaction_ref")
    shipping_address = data.get("shipping_address") or current_user.address
    shipping_city = data.get("shipping_city") or current_user.city

    if payment_method not in [p.value for p in PaymentMethodEnum]:
        return api_response(False, "Invalid payment_method.", status=400)
    if not shipping_address or not shipping_city:
        return api_response(False, "shipping_address and shipping_city are required.", status=400)

    cart_items = current_user.cart_items.all()
    if not cart_items:
        return api_response(False, "Your cart is empty.", status=400)

    # ---- Validate stock & compute totals ----
    subtotal = 0.0
    for ci in cart_items:
        product = ci.product
        if (
            not product
            or not product.is_active
            or product.store.status != StoreStatusEnum.APPROVED
        ):
            return api_response(False, f"A product in your cart is no longer available.", status=400)
        if product.stock_quantity < ci.quantity:
            return api_response(False, f"Insufficient stock for '{product.name}'.", status=400)
        subtotal += product.final_price * ci.quantity

    shipping_fee = 0.0 if subtotal >= 5000 else 150.0
    tax_total = round(subtotal * 0.0, 2)  # no sales tax modeled by default
    grand_total = round(subtotal + shipping_fee + tax_total, 2)

    # ---- Payment verification (closes the "any made-up number works" hole) ----
    # Cart/stock checks above only decide whether the order COULD be
    # fulfilled; this decides whether it was actually PAID FOR. A
    # transaction_ref has to point at a row this server itself marked
    # SUCCESS -- via /api/payments/<gateway>/initiate+verify -- or checkout
    # is refused here, before any Order row is written.
    payment_txn, payment_error = _consume_verified_transaction(
        PaymentMethodEnum(payment_method), current_user.id, transaction_ref, grand_total,
    )
    if payment_error:
        return api_response(False, payment_error, status=402)

    order = Order(
        order_number=generate_order_number(),
        customer_id=current_user.id,
        subtotal=round(subtotal, 2),
        discount_total=0,
        tax_total=tax_total,
        shipping_fee=shipping_fee,
        grand_total=grand_total,
        payment_method=PaymentMethodEnum(payment_method),
        status=OrderStatusEnum.PENDING,
        shipping_address=shipping_address,
        shipping_city=shipping_city,
    )
    db.session.add(order)
    db.session.flush()  # get order.id before commit

    if payment_txn:
        payment_txn.order_id = order.id
        payment_txn.status = PaymentTxnStatusEnum.CONSUMED

    for ci in cart_items:
        product = ci.product
        db.session.add(OrderItem(
            order_id=order.id,
            product_id=product.id,
            store_id=product.store_id,
            product_name=product.name,
            unit_price=product.final_price,
            quantity=ci.quantity,
        ))
        product.stock_quantity -= ci.quantity

    # ---- Fraud Detection Module: ML model + explainable rules ----
    txn_type = PAYMENT_TO_TXN_TYPE[PaymentMethodEnum(payment_method)]
    account_age = effective_account_age_days(current_user)
    old_org, new_org, old_dest, new_dest = _simulate_balances(current_user, grand_total)
    orders_24h = _orders_last_24h(current_user.id)
    threshold = current_app.config.get("FRAUD_HOLD_THRESHOLD", 0.55)

    ml_ran = False
    if payment_method == PaymentMethodEnum.COD.value:
        # Cash on delivery has no balance/transfer signal for the model; the
        # rules below still screen it.
        ml_result = {"fraud_probability": 0.0, "is_flagged": False, "model_version": "rules-only (cod)"}
    elif is_model_trained():
        ml_result = predict_fraud(
            transaction_type=txn_type,
            amount=grand_total,
            old_balance_org=old_org,
            new_balance_org=new_org,
            old_balance_dest=old_dest,
            new_balance_dest=new_dest,
            account_age_days=account_age,
            failed_login_attempts=current_user.failed_login_attempts or 0,
            orders_last_24h=orders_24h,
        )
        ml_ran = True
    else:
        # Model not trained yet (fresh clone): rules still run, so screening
        # is degraded rather than switched off.
        ml_result = {"fraud_probability": 0.0, "is_flagged": False, "model_version": "untrained"}

    rule_factors = evaluate_rules(
        current_user, grand_total, payment_method, orders_24h, account_age, current_app.config,
    )
    verdict = combine(
        ml_result["fraud_probability"], ml_result["is_flagged"], ml_ran, rule_factors, threshold,
    )
    is_flagged = verdict["is_flagged"]

    fraud_check = FraudCheck(
        order_id=order.id,
        transaction_type=txn_type,
        amount=grand_total,
        old_balance_org=old_org,
        new_balance_org=new_org,
        old_balance_dest=old_dest,
        new_balance_dest=new_dest,
        account_age_days=account_age,
        failed_login_attempts=current_user.failed_login_attempts or 0,
        orders_last_24h=orders_24h,
        fraud_probability=ml_result["fraud_probability"],
        is_flagged=is_flagged,
        model_version=ml_result["model_version"],
        risk_factors=json.dumps(verdict["factors"]),
        risk_level=verdict["risk_level"],
        flag_source=verdict["flag_source"],
    )
    db.session.add(fraud_check)

    current_user.total_orders = (current_user.total_orders or 0) + 1

    if is_flagged:
        order.status = OrderStatusEnum.HELD_FOR_REVIEW
        current_user.total_flagged_orders = (current_user.total_flagged_orders or 0) + 1
        _notify(
            current_user.id,
            "Order under review",
            f"Your order {order.order_number} is being reviewed for security purposes. "
            f"We'll confirm it shortly.",
        )
        notify_admins(
            "Order held for fraud review",
            f"{order.order_number} (PKR {grand_total:,.0f}) from {current_user.full_name} was held "
            f"- {verdict['risk_level']} risk. Open Admin > Fraud review center.",
        )
    else:
        order.status = OrderStatusEnum.CONFIRMED
        _notify(
            current_user.id,
            "Order confirmed",
            f"Your order {order.order_number} of PKR {grand_total:,.2f} has been confirmed!",
        )

    current_user.cart_items.delete()
    db.session.commit()

    _send_email_safe(
        subject=f"CosmoStore - Order {order.order_number}",
        recipient=current_user.email,
        body=(
            f"Hi {current_user.full_name},\n\n"
            f"Your order {order.order_number} (PKR {grand_total:,.2f}) status: {order.status.value}.\n"
            f"Thank you for shopping with CosmoStore."
        ),
    )

    return api_response(
        True,
        "Order placed." if not is_flagged else "Order received and is under security review.",
        data=order.to_dict(),
        status=201,
    )


@orders_bp.route("", methods=["GET"])
@login_required
def list_my_orders():
    orders = current_user.orders.order_by(Order.created_at.desc()).all()
    return api_response(True, data=[o.to_dict(include_items=False) for o in orders])


@orders_bp.route("/<int:order_id>", methods=["GET"])
@login_required
def get_order(order_id):
    order = Order.query.get_or_404(order_id)
    is_owner = order.customer_id == current_user.id
    is_vendor_of_item = (
        current_user.role == RoleEnum.VENDOR
        and order.status in VENDOR_VISIBLE_STATUSES
        and any(i.store_id == (current_user.store.id if current_user.store else -1) for i in order.items)
    )
    is_admin = current_user.role == RoleEnum.ADMIN
    if not (is_owner or is_vendor_of_item or is_admin):
        return api_response(False, "Not authorized to view this order.", status=403)
    return api_response(True, data=order.to_dict(include_fraud=is_admin))


@orders_bp.route("/<int:order_id>/cancel", methods=["PUT"])
@login_required
def cancel_order(order_id):
    order = Order.query.filter_by(id=order_id, customer_id=current_user.id).first()
    if not order:
        return api_response(False, "Order not found.", status=404)
    if order.status not in (OrderStatusEnum.PENDING, OrderStatusEnum.HELD_FOR_REVIEW, OrderStatusEnum.CONFIRMED):
        return api_response(False, f"Order cannot be cancelled from status '{order.status.value}'.", status=400)

    for item in order.items:
        if item.product:
            item.product.stock_quantity += item.quantity

    order.status = OrderStatusEnum.CANCELLED
    db.session.commit()
    return api_response(True, "Order cancelled.", data=order.to_dict())


# ------------------------------------------------------------- Vendor order view
@orders_bp.route("/vendor/orders", methods=["GET"])
@login_required
@role_required(RoleEnum.VENDOR)
def vendor_orders():
    store = current_user.store
    if not store:
        return api_response(False, "You do not have a store yet.", status=404)

    items = OrderItem.query.filter_by(store_id=store.id).order_by(OrderItem.id.desc()).all()
    seen_orders = {}
    for item in items:
        seen_orders.setdefault(item.order_id, item.order)

    orders = sorted(
        (o for o in seen_orders.values() if o.status in VENDOR_VISIBLE_STATUSES),
        key=lambda o: o.created_at,
        reverse=True,
    )

    payload = []
    for o in orders:
        d = o.to_dict()
        # Show a vendor only their own line items, not other stores' products
        d["items"] = [i.to_dict() for i in o.items if i.store_id == store.id]
        payload.append(d)
    return api_response(True, data=payload)
