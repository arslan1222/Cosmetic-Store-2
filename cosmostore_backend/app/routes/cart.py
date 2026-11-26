from flask import Blueprint, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models import CartItem, Product, RoleEnum, StoreStatusEnum
from app.utils import api_response, role_required


cart_bp = Blueprint("cart", __name__, url_prefix="/api/cart")


# ============================================================
# GET CART
# ============================================================

@cart_bp.route("", methods=["GET"])
@login_required
@role_required(RoleEnum.CUSTOMER)
def get_cart():
    items = current_user.cart_items.all()

    subtotal = sum(
        item.product.final_price * item.quantity
        for item in items
    )

    return api_response(
        True,
        data={
            "items": [item.to_dict() for item in items],
            "item_count": sum(item.quantity for item in items),
            "subtotal": round(subtotal, 2),
        },
    )


# ============================================================
# ADD TO CART
# ============================================================

@cart_bp.route("/add", methods=["POST"])
@login_required
@role_required(RoleEnum.CUSTOMER)
def add_to_cart():

    data = request.get_json(force=True, silent=True) or {}

    product_id = data.get("product_id")
    quantity = int(data.get("quantity", 1))

    product = Product.query.get(product_id)

    if (
        not product
        or not product.is_active
        or product.store.status != StoreStatusEnum.APPROVED
    ):
        return api_response(
            False,
            "Product not found.",
            status=404,
        )

    if quantity < 1:
        return api_response(
            False,
            "Quantity must be at least 1.",
            status=400,
        )

    if product.stock_quantity < quantity:
        return api_response(
            False,
            f"Only {product.stock_quantity} item(s) in stock.",
            status=400,
        )

    item = CartItem.query.filter_by(
        user_id=current_user.id,
        product_id=product_id,
    ).first()

    if item:

        # Check total quantity after adding
        new_quantity = item.quantity + quantity

        if new_quantity > product.stock_quantity:
            return api_response(
                False,
                f"Only {product.stock_quantity} item(s) in stock.",
                status=400,
            )

        item.quantity = new_quantity

    else:

        item = CartItem(
            user_id=current_user.id,
            product_id=product_id,
            quantity=quantity,
        )

        db.session.add(item)

    db.session.commit()

    return api_response(
        True,
        "Item added to cart.",
        data=item.to_dict(),
    )


# ============================================================
# UPDATE CART ITEM
# ============================================================

@cart_bp.route("/update/<int:item_id>", methods=["PUT"])
@login_required
@role_required(RoleEnum.CUSTOMER)
def update_cart_item(item_id):

    item = CartItem.query.filter_by(
        id=item_id,
        user_id=current_user.id,
    ).first()

    if not item:
        return api_response(
            False,
            "Cart item not found.",
            status=404,
        )

    data = request.get_json(force=True, silent=True) or {}

    quantity = int(
        data.get("quantity", item.quantity)
    )

    if quantity < 1:
        return api_response(
            False,
            "Quantity must be at least 1.",
            status=400,
        )

    if item.product.stock_quantity < quantity:
        return api_response(
            False,
            f"Only {item.product.stock_quantity} item(s) in stock.",
            status=400,
        )

    item.quantity = quantity

    db.session.commit()

    return api_response(
        True,
        "Cart updated.",
        data=item.to_dict(),
    )


# ============================================================
# REMOVE CART ITEM
# ============================================================

@cart_bp.route("/remove/<int:item_id>", methods=["DELETE"])
@login_required
@role_required(RoleEnum.CUSTOMER)
def remove_cart_item(item_id):

    item = CartItem.query.filter_by(
        id=item_id,
        user_id=current_user.id,
    ).first()

    if not item:
        return api_response(
            False,
            "Cart item not found.",
            status=404,
        )

    db.session.delete(item)

    db.session.commit()

    return api_response(
        True,
        "Item removed from cart.",
    )


# ============================================================
# CLEAR CART
# ============================================================

@cart_bp.route("/clear", methods=["DELETE"])
@login_required
@role_required(RoleEnum.CUSTOMER)
def clear_cart():

    current_user.cart_items.delete()

    db.session.commit()

    return api_response(
        True,
        "Cart cleared.",
    )