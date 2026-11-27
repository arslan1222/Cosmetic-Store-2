"""Saved items (wishlist) for customers."""
from flask import Blueprint, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models import WishlistItem, Product, RoleEnum, StoreStatusEnum
from app.utils import api_response, role_required

wishlist_bp = Blueprint("wishlist", __name__, url_prefix="/api/wishlist")


def _visible(product):
    """Only products that are still on sale (active, from an approved store)."""
    return bool(product and product.is_active and product.store.status == StoreStatusEnum.APPROVED)


@wishlist_bp.route("", methods=["GET"])
@login_required
@role_required(RoleEnum.CUSTOMER)
def list_wishlist():
    items = (
        WishlistItem.query.filter_by(user_id=current_user.id)
        .order_by(WishlistItem.created_at.desc())
        .all()
    )
    products = [i.product.to_dict() for i in items if _visible(i.product)]
    return api_response(True, data={"items": products, "product_ids": [p["id"] for p in products]})


@wishlist_bp.route("", methods=["POST"])
@login_required
@role_required(RoleEnum.CUSTOMER)
def add_to_wishlist():
    data = request.get_json(force=True, silent=True) or {}
    product = Product.query.get(data.get("product_id"))
    if not _visible(product):
        return api_response(False, "Product not found.", status=404)

    if not WishlistItem.query.filter_by(user_id=current_user.id, product_id=product.id).first():
        db.session.add(WishlistItem(user_id=current_user.id, product_id=product.id))
        db.session.commit()
    return api_response(True, "Saved to your wishlist.", status=201)


@wishlist_bp.route("/<int:product_id>", methods=["DELETE"])
@login_required
@role_required(RoleEnum.CUSTOMER)
def remove_from_wishlist(product_id):
    WishlistItem.query.filter_by(user_id=current_user.id, product_id=product_id).delete()
    db.session.commit()
    return api_response(True, "Removed from your wishlist.")
