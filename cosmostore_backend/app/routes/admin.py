from datetime import datetime, timedelta

from flask import Blueprint, request
from flask_login import login_required, current_user
from sqlalchemy import func

from app.extensions import db, mail
from app.models import (
    User, Product, Order, OrderItem, Store, FraudCheck, Category,
    RoleEnum, OrderStatusEnum, StoreStatusEnum, Notification,
)
from app.ml.fraud_predictor import get_metrics
from app.ml.risk_rules import effective_account_age_days
from app.notifications import notify, send_email_safe
from app.utils import api_response, role_required
from flask_mail import Message

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


# --------------------------------------------------------------------- Users
@admin_bp.route("/users", methods=["GET"])
@login_required
@role_required(RoleEnum.ADMIN)
def list_users():
    role = request.args.get("role")
    query = User.query
    if role:
        query = query.filter_by(role=role)
    users = query.order_by(User.created_at.desc()).all()
    return api_response(True, data=[u.to_dict(include_sensitive=True) for u in users])


@admin_bp.route("/users/<int:user_id>/toggle-active", methods=["PUT"])
@login_required
@role_required(RoleEnum.ADMIN)
def toggle_user_active(user_id):
    user = User.query.get_or_404(user_id)
    user.is_active_account = not user.is_active_account
    db.session.commit()
    status = "activated" if user.is_active_account else "deactivated"
    return api_response(True, f"User {status}.", data=user.to_dict())


@admin_bp.route("/users/<int:user_id>/watchlist", methods=["PUT"])
@login_required
@role_required(RoleEnum.ADMIN)
def set_user_watchlist(user_id):
    """Put a customer on (or take them off) the fraud watchlist. While listed,
    every order they place is held for manual review."""
    user = User.query.get_or_404(user_id)
    if user.role != RoleEnum.CUSTOMER:
        return api_response(False, "Only customers can be watchlisted.", status=400)

    data = request.get_json(force=True, silent=True) or {}
    user.is_watchlisted = bool(data["watchlisted"]) if "watchlisted" in data else not user.is_watchlisted
    db.session.commit()

    state = "added to" if user.is_watchlisted else "removed from"
    return api_response(True, f"Customer {state} the fraud watchlist.", data=user.to_dict(include_sensitive=True))


# ------------------------------------------------------------------ Vendors
@admin_bp.route("/stores", methods=["GET"])
@login_required
@role_required(RoleEnum.ADMIN)
def list_all_stores():
    status = request.args.get("status")
    query = Store.query
    if status:
        if status not in [s.value for s in StoreStatusEnum]:
            return api_response(False, "Invalid status filter.", status=400)
        query = query.filter_by(status=StoreStatusEnum(status))
    # Pending applications first (oldest first, so nobody waits forever), then the rest
    stores = query.all()
    pending = sorted((x for x in stores if x.status == StoreStatusEnum.PENDING), key=lambda x: x.created_at)
    others = sorted((x for x in stores if x.status != StoreStatusEnum.PENDING), key=lambda x: x.created_at, reverse=True)
    stores = pending + others
    return api_response(True, data=[s.to_dict(include_owner=True) for s in stores])


@admin_bp.route("/stores/<int:store_id>/status", methods=["PUT"])
@login_required
@role_required(RoleEnum.ADMIN)
def set_store_status(store_id):
    store = Store.query.get_or_404(store_id)
    data = request.get_json(force=True, silent=True) or {}
    new_status = data.get("status")
    reason = (data.get("reason") or "").strip()

    if new_status not in [s.value for s in StoreStatusEnum]:
        return api_response(False, "Invalid status.", status=400)
    if new_status == StoreStatusEnum.PENDING.value:
        return api_response(False, "A store can't be moved back to pending by an admin.", status=400)
    if new_status == StoreStatusEnum.REJECTED.value and not reason:
        return api_response(False, "Please give the vendor a reason for rejecting the application.", status=400)

    store.status = StoreStatusEnum(new_status)
    store.reviewed_by = current_user.id
    store.reviewed_at = datetime.utcnow()
    # Reason is kept for rejection and suspension; cleared once approved.
    if new_status == StoreStatusEnum.APPROVED.value:
        store.rejection_reason = None
    else:
        store.rejection_reason = reason or None

    if new_status == StoreStatusEnum.APPROVED.value:
        title = "Your store was approved"
        message = (
            f"Great news! '{store.store_name}' is approved and live. "
            f"You can now add products from your vendor dashboard."
        )
    elif new_status == StoreStatusEnum.REJECTED.value:
        title = "Vendor application not approved"
        message = (
            f"Your application for '{store.store_name}' was not approved. Reason: {reason} "
            f"You can update your details and resubmit from your vendor dashboard."
        )
    else:
        title = "Store suspended"
        message = f"Your store '{store.store_name}' has been suspended." + (f" Reason: {reason}" if reason else "")

    notify(store.owner_id, title, message)
    db.session.commit()

    if store.owner and store.owner.email:
        send_email_safe(f"CosmoStore - {title}", store.owner.email, f"Hi {store.owner.full_name},\n\n{message}\n\nCosmoStore")

    return api_response(True, "Store status updated.", data=store.to_dict(include_owner=True))


# ----------------------------------------------------------------- Products
@admin_bp.route("/products", methods=["GET"])
@login_required
@role_required(RoleEnum.ADMIN)
def admin_list_products():
    products = Product.query.order_by(Product.created_at.desc()).all()
    return api_response(True, data=[p.to_dict() for p in products])


# ------------------------------------------------------------------- Orders
@admin_bp.route("/orders", methods=["GET"])
@login_required
@role_required(RoleEnum.ADMIN)
def admin_list_orders():
    status = request.args.get("status")
    query = Order.query
    if status:
        query = query.filter_by(status=status)
    orders = query.order_by(Order.created_at.desc()).all()
    return api_response(True, data=[o.to_dict(include_fraud=True) for o in orders])


@admin_bp.route("/orders/<int:order_id>/status", methods=["PUT"])
@login_required
@role_required(RoleEnum.ADMIN)
def update_order_status(order_id):
    order = Order.query.get_or_404(order_id)
    data = request.get_json(force=True, silent=True) or {}
    new_status = data.get("status")
    if new_status not in [s.value for s in OrderStatusEnum]:
        return api_response(False, "Invalid status.", status=400)
    new_status = OrderStatusEnum(new_status)

    if new_status == order.status:
        return api_response(True, "Order status unchanged.", data=order.to_dict(include_fraud=True))

    # Fraud screening decisions must go through the review center so they are
    # recorded (who decided, when) and stock/notifications stay consistent.
    if order.status == OrderStatusEnum.HELD_FOR_REVIEW:
        return api_response(
            False,
            "This order is held for fraud review. Approve or reject it in the Fraud review center.",
            status=409,
        )
    if new_status == OrderStatusEnum.HELD_FOR_REVIEW:
        return api_response(False, "Orders are held automatically by fraud screening.", status=400)

    closed = (OrderStatusEnum.CANCELLED, OrderStatusEnum.REJECTED)
    if order.status in closed:
        return api_response(False, f"A {order.status.value} order can't be reopened.", status=409)
    if new_status in closed:
        # Stock was reserved at checkout; give it back.
        for item in order.items:
            if item.product:
                item.product.stock_quantity += item.quantity

    order.status = new_status
    db.session.commit()

    db.session.add(Notification(
        user_id=order.customer_id,
        title="Order status update",
        message=f"Your order {order.order_number} is now '{new_status.value}'.",
    ))
    db.session.commit()
    return api_response(True, "Order status updated.", data=order.to_dict(include_fraud=True))


# ------------------------------------------------------- Fraud review center
def _customer_context(order):
    """What an admin needs to judge a held order: who is this customer, really?"""
    c = order.customer
    if not c:
        return None
    return {
        "id": c.id,
        "email": c.email,
        "phone": c.phone,
        "account_age_days": effective_account_age_days(c),
        "total_orders": c.total_orders or 0,
        "total_flagged_orders": c.total_flagged_orders or 0,
        "is_watchlisted": bool(c.is_watchlisted),
    }


@admin_bp.route("/fraud/flagged-orders", methods=["GET"])
@login_required
@role_required(RoleEnum.ADMIN)
def flagged_orders():
    orders = (
        Order.query.filter_by(status=OrderStatusEnum.HELD_FOR_REVIEW)
        .order_by(Order.created_at.desc())
        .all()
    )
    payload = []
    for o in orders:
        d = o.to_dict(include_fraud=True)
        d["customer"] = _customer_context(o)
        payload.append(d)
    return api_response(True, data=payload)


@admin_bp.route("/fraud/orders/<int:order_id>/decision", methods=["PUT"])
@login_required
@role_required(RoleEnum.ADMIN)
def fraud_decision(order_id):
    order = Order.query.get_or_404(order_id)
    if not order.fraud_check:
        return api_response(False, "No fraud check found for this order.", status=404)

    data = request.get_json(force=True, silent=True) or {}
    decision = data.get("decision")  # 'approved' or 'rejected'
    if decision not in ("approved", "rejected"):
        return api_response(False, "decision must be 'approved' or 'rejected'.", status=400)
    if order.status != OrderStatusEnum.HELD_FOR_REVIEW:
        return api_response(False, "This order is not waiting for a fraud decision.", status=409)

    order.fraud_check.admin_decision = decision
    order.fraud_check.reviewed_by = current_user.id
    order.fraud_check.reviewed_at = datetime.utcnow()

    if decision == "approved":
        # The flag turned out to be a false alarm, so it shouldn't count
        # against this customer in the repeat-flag rule.
        if order.customer:
            order.customer.total_flagged_orders = max(0, (order.customer.total_flagged_orders or 0) - 1)
        order.status = OrderStatusEnum.CONFIRMED
        msg = f"Good news! Your order {order.order_number} passed review and is now confirmed."
    else:
        order.status = OrderStatusEnum.REJECTED
        # restock items
        for item in order.items:
            if item.product:
                item.product.stock_quantity += item.quantity
        msg = f"Your order {order.order_number} could not be verified and has been rejected. Contact support."

    db.session.add(Notification(user_id=order.customer_id, title="Fraud review decision", message=msg))
    db.session.commit()

    return api_response(True, f"Order {decision}.", data=order.to_dict(include_fraud=True))


@admin_bp.route("/fraud/model-metrics", methods=["GET"])
@login_required
@role_required(RoleEnum.ADMIN)
def fraud_model_metrics():
    metrics = get_metrics()
    if not metrics:
        return api_response(False, "Fraud model has not been trained yet.", status=404)
    return api_response(True, data=metrics)


@admin_bp.route("/fraud/checks", methods=["GET"])
@login_required
@role_required(RoleEnum.ADMIN)
def all_fraud_checks():
    checks = FraudCheck.query.order_by(FraudCheck.created_at.desc()).limit(200).all()
    return api_response(True, data=[c.to_dict() for c in checks])


# ---------------------------------------------------------------- Analytics
@admin_bp.route("/analytics/summary", methods=["GET"])
@login_required
@role_required(RoleEnum.ADMIN)
def analytics_summary():
    total_users = User.query.filter_by(role=RoleEnum.CUSTOMER).count()
    total_vendors = User.query.filter_by(role=RoleEnum.VENDOR).count()
    total_products = Product.query.count()
    total_orders = Order.query.count()

    total_sales = db.session.query(func.coalesce(func.sum(Order.grand_total), 0)).filter(
        Order.status.in_([OrderStatusEnum.CONFIRMED, OrderStatusEnum.SHIPPED, OrderStatusEnum.DELIVERED])
    ).scalar()

    flagged_count = Order.query.filter_by(status=OrderStatusEnum.HELD_FOR_REVIEW).count()
    pending_vendors = Store.query.filter_by(status=StoreStatusEnum.PENDING).count()
    watchlisted = User.query.filter_by(is_watchlisted=True).count()
    rejected_count = Order.query.filter_by(status=OrderStatusEnum.REJECTED).count()
    total_fraud_checks = FraudCheck.query.count()

    last_30_days = datetime.utcnow() - timedelta(days=30)
    daily_sales = (
        db.session.query(
            func.date(Order.created_at).label("day"),
            func.sum(Order.grand_total).label("total"),
        )
        .filter(Order.created_at >= last_30_days)
        .group_by(func.date(Order.created_at))
        .order_by(func.date(Order.created_at))
        .all()
    )

    orders_by_status = (
        db.session.query(Order.status, func.count(Order.id)).group_by(Order.status).all()
    )

    return api_response(True, data={
        "total_customers": total_users,
        "total_vendors": total_vendors,
        "total_products": total_products,
        "total_orders": total_orders,
        "total_sales": float(total_sales or 0),
        "flagged_orders": flagged_count,
        "pending_vendor_applications": pending_vendors,
        "watchlisted_customers": watchlisted,
        "rejected_orders": rejected_count,
        "total_fraud_checks": total_fraud_checks,
        "fraud_rate_percent": round((flagged_count / total_orders * 100), 2) if total_orders else 0,
        "daily_sales_last_30_days": [{"day": str(d), "total": float(t or 0)} for d, t in daily_sales],
        "orders_by_status": {s.value: c for s, c in orders_by_status},
    })


@admin_bp.route("/categories/<int:category_id>", methods=["PUT"])
@login_required
@role_required(RoleEnum.ADMIN)
def admin_update_category(category_id):
    category = Category.query.get_or_404(category_id)
    data = request.get_json(force=True, silent=True) or {}
    for field in ("name", "description"):
        if field in data:
            setattr(category, field, data[field])
    db.session.commit()
    return api_response(True, "Category updated.", data=category.to_dict())
