import enum
from datetime import datetime

from flask_login import UserMixin
from sqlalchemy.dialects.mysql import LONGBLOB

from app.extensions import db, bcrypt


# --------------------------------------------------------------------------
# Enums
# --------------------------------------------------------------------------
class RoleEnum(str, enum.Enum):
    CUSTOMER = "customer"
    VENDOR = "vendor"
    ADMIN = "admin"


class OrderStatusEnum(str, enum.Enum):
    PENDING = "pending"                # created, awaiting fraud check
    HELD_FOR_REVIEW = "held_for_review"  # flagged suspicious, admin must confirm/reject
    CONFIRMED = "confirmed"            # legitimate, processing
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"
    REJECTED = "rejected"              # admin rejected a flagged order


class PaymentMethodEnum(str, enum.Enum):
    EASYPAISA = "easypaisa"
    JAZZCASH = "jazzcash"
    CARD = "card"
    COD = "cod"


class StoreStatusEnum(str, enum.Enum):
    PENDING = "pending"        # vendor applied, waiting for admin review
    APPROVED = "approved"      # live: can list products, products are public
    REJECTED = "rejected"      # admin declined the application (reason stored)
    SUSPENDED = "suspended"    # previously approved, now switched off by admin


class PaymentTxnStatusEnum(str, enum.Enum):
    PENDING = "pending"      # initiated, awaiting OTP/confirmation
    SUCCESS = "success"      # gateway confirmed payment
    FAILED = "failed"        # gateway declined / OTP mismatch / expired
    CONSUMED = "consumed"    # success, and already attached to an order


# --------------------------------------------------------------------------
# User & Auth
# --------------------------------------------------------------------------
class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False, index=True)
    phone = db.Column(db.String(20), nullable=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.Enum(RoleEnum), default=RoleEnum.CUSTOMER, nullable=False)

    address = db.Column(db.String(255), nullable=True)
    city = db.Column(db.String(80), nullable=True)

    is_active_account = db.Column(db.Boolean, default=True)
    is_verified = db.Column(db.Boolean, default=False)

    # behavioural fields used as fraud-model features
    account_age_days = db.Column(db.Integer, default=0)
    failed_login_attempts = db.Column(db.Integer, default=0)
    total_orders = db.Column(db.Integer, default=0)
    total_flagged_orders = db.Column(db.Integer, default=0)

    # Admin-controlled fraud flag: every order from a watchlisted customer
    # is held for manual review, whatever the model says.
    is_watchlisted = db.Column(db.Boolean, default=False, nullable=False, server_default="0")

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    store = db.relationship("Store", back_populates="owner", uselist=False, foreign_keys="Store.owner_id")
    orders = db.relationship("Order", back_populates="customer", lazy="dynamic")
    cart_items = db.relationship("CartItem", back_populates="user", lazy="dynamic", cascade="all, delete-orphan")
    reviews = db.relationship("Review", back_populates="user", lazy="dynamic")
    notifications = db.relationship("Notification", back_populates="user", lazy="dynamic", cascade="all, delete-orphan")

    def set_password(self, raw_password: str):
        self.password_hash = bcrypt.generate_password_hash(raw_password).decode("utf-8")

    def check_password(self, raw_password: str) -> bool:
        return bcrypt.check_password_hash(self.password_hash, raw_password)

    def is_admin(self):
        return self.role == RoleEnum.ADMIN

    def is_vendor(self):
        return self.role == RoleEnum.VENDOR

    def to_dict(self, include_sensitive=False):
        data = {
            "id": self.id,
            "full_name": self.full_name,
            "email": self.email,
            "phone": self.phone,
            "role": self.role.value if isinstance(self.role, RoleEnum) else self.role,
            "address": self.address,
            "city": self.city,
            "is_verified": self.is_verified,
            "is_active_account": self.is_active_account,
            "total_orders": self.total_orders,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if self.role == RoleEnum.VENDOR:
            store = self.store
            data["store_status"] = store.status.value if store else None
        if include_sensitive:
            data.update({
                "failed_login_attempts": self.failed_login_attempts,
                "total_flagged_orders": self.total_flagged_orders,
                "account_age_days": self.account_age_days,
                "is_watchlisted": bool(self.is_watchlisted),
            })
        return data


# --------------------------------------------------------------------------
# Multi-vendor Store
# --------------------------------------------------------------------------
class Store(db.Model):
    __tablename__ = "stores"

    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), unique=True, nullable=False)

    store_name = db.Column(db.String(120), nullable=False)
    slug = db.Column(db.String(140), unique=True, nullable=False)
    description = db.Column(db.Text, nullable=True)
    logo_url = db.Column(db.String(255), nullable=True)
    banner_url = db.Column(db.String(255), nullable=True)

    status = db.Column(db.Enum(StoreStatusEnum), default=StoreStatusEnum.PENDING, nullable=False)
    commission_rate = db.Column(db.Float, default=10.0)  # % platform commission

    # Admin review trail for vendor applications
    rejection_reason = db.Column(db.Text, nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)
    reviewed_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    owner = db.relationship("User", back_populates="store", foreign_keys=[owner_id])
    products = db.relationship("Product", back_populates="store", lazy="dynamic", cascade="all, delete-orphan")

    def to_dict(self, include_owner=False):
        data = {
            "id": self.id,
            "owner_id": self.owner_id,
            "store_name": self.store_name,
            "slug": self.slug,
            "description": self.description,
            "logo_url": self.logo_url,
            "banner_url": self.banner_url,
            "status": self.status.value if isinstance(self.status, StoreStatusEnum) else self.status,
            "commission_rate": self.commission_rate,
            "product_count": self.products.count(),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        # Owner contact details and the review trail are for the owner and
        # admins only -- never include them in public store listings.
        if include_owner:
            data.update({
                "owner_name": self.owner.full_name if self.owner else None,
                "owner_email": self.owner.email if self.owner else None,
                "owner_phone": self.owner.phone if self.owner else None,
                "rejection_reason": self.rejection_reason,
                "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
            })
        return data


# --------------------------------------------------------------------------
# Catalog
# --------------------------------------------------------------------------
class Category(db.Model):
    __tablename__ = "categories"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), unique=True, nullable=False)
    slug = db.Column(db.String(90), unique=True, nullable=False)
    description = db.Column(db.String(255), nullable=True)

    products = db.relationship("Product", back_populates="category", lazy="dynamic")

    def to_dict(self):
        return {"id": self.id, "name": self.name, "slug": self.slug, "description": self.description}


class Product(db.Model):
    __tablename__ = "products"

    id = db.Column(db.Integer, primary_key=True)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=False)

    name = db.Column(db.String(150), nullable=False)
    brand = db.Column(db.String(100), nullable=True)
    description = db.Column(db.Text, nullable=True)
    ingredients = db.Column(db.Text, nullable=True)   # shown on the product page
    how_to_use = db.Column(db.Text, nullable=True)    # usage instructions
    price = db.Column(db.Numeric(10, 2), nullable=False)      # PKR
    discount_percent = db.Column(db.Float, default=0.0)
    stock_quantity = db.Column(db.Integer, default=0)
    image_url = db.Column(db.String(255), nullable=True)

    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    store = db.relationship("Store", back_populates="products")
    category = db.relationship("Category", back_populates="products")
    reviews = db.relationship("Review", back_populates="product", lazy="dynamic", cascade="all, delete-orphan")
    order_items = db.relationship("OrderItem", back_populates="product", lazy="dynamic")
    images = db.relationship(
        "ProductImage", back_populates="product", order_by="ProductImage.sort_order",
        cascade="all, delete-orphan",
    )

    @property
    def final_price(self):
        price = float(self.price)
        if self.discount_percent:
            return round(price * (1 - self.discount_percent / 100), 2)
        return price

    @property
    def avg_rating(self):
        ratings = [r.rating for r in self.reviews]
        return round(sum(ratings) / len(ratings), 1) if ratings else 0

    def to_dict(self):
        gallery = [img.to_dict() for img in self.images]
        return {
            "id": self.id,
            "store_id": self.store_id,
            "store_name": self.store.store_name if self.store else None,
            "category_id": self.category_id,
            "category_name": self.category.name if self.category else None,
            "name": self.name,
            "brand": self.brand,
            "description": self.description,
            "ingredients": self.ingredients,
            "how_to_use": self.how_to_use,
            "price": float(self.price),
            "discount_percent": self.discount_percent,
            "final_price": self.final_price,
            "stock_quantity": self.stock_quantity,
            "image_url": self.image_url,
            "images": gallery,
            "is_active": self.is_active,
            "avg_rating": self.avg_rating,
            "review_count": self.reviews.count(),
        }


class ProductImage(db.Model):
    """A single photo in a product's gallery. The Product.image_url field
    always mirrors the first (cover) image so existing single-image UI
    (cards, listings) keeps working unchanged."""
    __tablename__ = "product_images"

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    image_url = db.Column(db.String(255), nullable=False)
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    product = db.relationship("Product", back_populates="images")

    def to_dict(self):
        return {"id": self.id, "image_url": self.image_url, "sort_order": self.sort_order}


class Review(db.Model):
    __tablename__ = "reviews"

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    rating = db.Column(db.Integer, nullable=False)  # 1-5
    comment = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    product = db.relationship("Product", back_populates="reviews")
    user = db.relationship("User", back_populates="reviews")

    def to_dict(self):
        return {
            "id": self.id,
            "product_id": self.product_id,
            "user_id": self.user_id,
            "user_name": self.user.full_name if self.user else "Anonymous",
            "rating": self.rating,
            "comment": self.comment,
            "created_at": self.created_at.isoformat(),
        }


# --------------------------------------------------------------------------
# Cart
# --------------------------------------------------------------------------
class WishlistItem(db.Model):
    """A product a customer has saved for later ("saved items" in the proposal)."""
    __tablename__ = "wishlist_items"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    product = db.relationship("Product")

    __table_args__ = (db.UniqueConstraint("user_id", "product_id", name="uq_user_product_wishlist"),)


class CartItem(db.Model):
    __tablename__ = "cart_items"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    quantity = db.Column(db.Integer, default=1, nullable=False)
    added_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User", back_populates="cart_items")
    product = db.relationship("Product")

    __table_args__ = (db.UniqueConstraint("user_id", "product_id", name="uq_user_product_cart"),)

    def to_dict(self):
        return {
            "id": self.id,
            "product": self.product.to_dict() if self.product else None,
            "quantity": self.quantity,
            "subtotal": round(self.product.final_price * self.quantity, 2) if self.product else 0,
        }


# --------------------------------------------------------------------------
# Orders / Transactions / Fraud
# --------------------------------------------------------------------------
class Order(db.Model):
    __tablename__ = "orders"

    id = db.Column(db.Integer, primary_key=True)
    order_number = db.Column(db.String(30), unique=True, nullable=False)
    customer_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    subtotal = db.Column(db.Numeric(10, 2), nullable=False)
    discount_total = db.Column(db.Numeric(10, 2), default=0)
    tax_total = db.Column(db.Numeric(10, 2), default=0)
    shipping_fee = db.Column(db.Numeric(10, 2), default=0)
    grand_total = db.Column(db.Numeric(10, 2), nullable=False)

    payment_method = db.Column(db.Enum(PaymentMethodEnum), nullable=False)
    status = db.Column(db.Enum(OrderStatusEnum), default=OrderStatusEnum.PENDING, nullable=False)

    shipping_address = db.Column(db.String(255), nullable=False)
    shipping_city = db.Column(db.String(80), nullable=False)

    is_guest_checkout = db.Column(db.Boolean, default=False)
    guest_email = db.Column(db.String(150), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    customer = db.relationship("User", back_populates="orders")
    items = db.relationship("OrderItem", back_populates="order", lazy="joined", cascade="all, delete-orphan")
    fraud_check = db.relationship("FraudCheck", back_populates="order", uselist=False, cascade="all, delete-orphan")

    def to_dict(self, include_items=True, include_fraud=False):
        """include_fraud must only be True for admin responses: the model's
        score and the rule hits are internal and would help a fraudster
        tune their next attempt."""
        data = {
            "id": self.id,
            "order_number": self.order_number,
            "customer_id": self.customer_id,
            "customer_name": self.customer.full_name if self.customer else self.guest_email,
            "subtotal": float(self.subtotal),
            "discount_total": float(self.discount_total or 0),
            "tax_total": float(self.tax_total or 0),
            "shipping_fee": float(self.shipping_fee or 0),
            "grand_total": float(self.grand_total),
            "payment_method": self.payment_method.value,
            "status": self.status.value,
            "shipping_address": self.shipping_address,
            "shipping_city": self.shipping_city,
            "created_at": self.created_at.isoformat(),
        }
        if include_items:
            data["items"] = [i.to_dict() for i in self.items]
        if include_fraud and self.fraud_check:
            data["fraud_check"] = self.fraud_check.to_dict()
        return data


class OrderItem(db.Model):
    __tablename__ = "order_items"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), nullable=False)

    product_name = db.Column(db.String(150), nullable=False)  # snapshot
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)  # snapshot
    quantity = db.Column(db.Integer, nullable=False)

    order = db.relationship("Order", back_populates="items")
    product = db.relationship("Product", back_populates="order_items")

    def to_dict(self):
        return {
            "id": self.id,
            "product_id": self.product_id,
            "store_id": self.store_id,
            "product_name": self.product_name,
            "unit_price": float(self.unit_price),
            "quantity": self.quantity,
            "line_total": round(float(self.unit_price) * self.quantity, 2),
        }


class PaymentTransaction(db.Model):
    """
    A record of one attempt to pay through an external gateway
    (JazzCash / Easypaisa / card-via-Safepay), created at 'initiate' and
    updated at 'verify'. Checkout requires a transaction row here with
    status SUCCESS, owned by the current user, with a matching amount,
    not already attached to an order (order_id is NULL) -- this is what
    stops checkout from completing on a fabricated/garbage payment
    reference, since the backend -- not the browser -- is the source of
    truth for whether money actually moved.
    """
    __tablename__ = "payment_transactions"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=True)

    gateway = db.Column(db.String(20), nullable=False)  # jazzcash | easypaisa | card
    transaction_ref = db.Column(db.String(64), unique=True, nullable=False)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    status = db.Column(db.Enum(PaymentTxnStatusEnum), default=PaymentTxnStatusEnum.PENDING, nullable=False)

    # Real-mode gateways hit this; simulator mode (no merchant credentials
    # configured) sets this to False and uses an OTP/validation stand-in
    # instead, so the demo still works without a live merchant account.
    is_live_gateway = db.Column(db.Boolean, default=False)

    # OTP challenge used by the Easypaisa flow and by the no-credentials
    # simulator fallback for JazzCash/Easypaisa. Never the raw OTP in prod.
    otp_hash = db.Column(db.String(128), nullable=True)
    otp_expires_at = db.Column(db.DateTime, nullable=True)
    attempt_count = db.Column(db.Integer, default=0)

    meta_json = db.Column(db.Text, nullable=True)  # raw gateway request/response, for audit

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship("User")
    order = db.relationship("Order")

    def to_dict(self, reveal_debug_otp=None):
        data = {
            "transaction_ref": self.transaction_ref,
            "gateway": self.gateway,
            "amount": float(self.amount),
            "status": self.status.value,
            "is_live_gateway": self.is_live_gateway,
        }
        if reveal_debug_otp:
            # Only ever surfaced in simulator mode, where there is no real
            # SMS/push channel to deliver the OTP through.
            data["debug_otp"] = reveal_debug_otp
        return data


class FraudCheck(db.Model):
    """Stores the ML model's verdict for a given order/transaction."""
    __tablename__ = "fraud_checks"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), unique=True, nullable=False)

    # raw features sent to the model (kept for audit/retraining)
    transaction_type = db.Column(db.String(30), nullable=False)  # CASH_OUT, PAYMENT, TRANSFER, DEBIT, CASH_IN
    amount = db.Column(db.Float, nullable=False)
    old_balance_org = db.Column(db.Float, default=0)
    new_balance_org = db.Column(db.Float, default=0)
    old_balance_dest = db.Column(db.Float, default=0)
    new_balance_dest = db.Column(db.Float, default=0)
    account_age_days = db.Column(db.Integer, default=0)
    failed_login_attempts = db.Column(db.Integer, default=0)
    orders_last_24h = db.Column(db.Integer, default=0)

    fraud_probability = db.Column(db.Float, nullable=False)   # 0..1
    is_flagged = db.Column(db.Boolean, default=False)
    model_version = db.Column(db.String(40), default="v1")

    # Explainability: which rules/signals contributed, and where the flag came from
    risk_factors = db.Column(db.Text, nullable=True)   # JSON list of {code, label, severity}
    risk_level = db.Column(db.String(10), nullable=True)   # low / medium / high
    flag_source = db.Column(db.String(20), nullable=True)  # model / rules / model+rules

    admin_decision = db.Column(db.String(20), nullable=True)  # 'approved' / 'rejected' / None (pending)
    reviewed_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    order = db.relationship("Order", back_populates="fraud_check")

    def to_dict(self):
        return {
            "id": self.id,
            "order_id": self.order_id,
            "transaction_type": self.transaction_type,
            "amount": self.amount,
            "fraud_probability": round(self.fraud_probability, 4),
            "is_flagged": self.is_flagged,
            "model_version": self.model_version,
            "admin_decision": self.admin_decision,
            "risk_level": self.risk_level,
            "flag_source": self.flag_source,
            "risk_factors": self.factors(),
            "created_at": self.created_at.isoformat(),
        }

    def factors(self):
        import json
        try:
            return json.loads(self.risk_factors) if self.risk_factors else []
        except (TypeError, ValueError):
            return []


class Notification(db.Model):
    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    title = db.Column(db.String(150), nullable=False)
    message = db.Column(db.String(500), nullable=False)
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User", back_populates="notifications")

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "message": self.message,
            "is_read": self.is_read,
            "created_at": self.created_at.isoformat(),
        }


class StoredImage(db.Model):
    """Image bytes kept in the database so uploads survive Render's
    ephemeral disk. Served by GET /api/media/<filename>."""
    __tablename__ = "stored_images"

    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), unique=True, nullable=False, index=True)
    mimetype = db.Column(db.String(100), nullable=False, default="image/jpeg")
    data = db.Column(db.LargeBinary().with_variant(LONGBLOB, "mysql"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
