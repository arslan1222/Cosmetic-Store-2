import io
import os
import uuid
from datetime import datetime
from decimal import Decimal, InvalidOperation
from functools import wraps

import pandas as pd
from flask import Blueprint, request, current_app, send_file
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename

from app.extensions import db
from app.models import Product, ProductImage, Category, Store, RoleEnum, Review, StoreStatusEnum
from app.notifications import notify_admins
from app.utils import api_response, role_required, slugify
from app.storage import save_image, delete_image

products_bp = Blueprint("products", __name__, url_prefix="/api")

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif"}
ALLOWED_BULK_EXTENSIONS = {"xlsx", "xls"}

BULK_UPLOAD_COLUMNS = [
    "name", "brand", "category", "price", "discount_percent",
    "stock_quantity", "description",
]


def _allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _allowed_bulk_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_BULK_EXTENSIONS


# ---------------------------------------------------------------- Categories
@products_bp.route("/categories", methods=["GET"])
def list_categories():
    categories = Category.query.order_by(Category.name).all()
    return api_response(True, data=[c.to_dict() for c in categories])


@products_bp.route("/categories", methods=["POST"])
@login_required
@role_required(RoleEnum.ADMIN)
def create_category():
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return api_response(False, "Category name is required.", status=400)
    if Category.query.filter_by(name=name).first():
        return api_response(False, "Category already exists.", status=409)

    category = Category(name=name, slug=slugify(name), description=data.get("description"))
    db.session.add(category)
    db.session.commit()
    return api_response(True, "Category created.", data=category.to_dict(), status=201)


@products_bp.route("/categories/<int:category_id>", methods=["DELETE"])
@login_required
@role_required(RoleEnum.ADMIN)
def delete_category(category_id):
    category = Category.query.get_or_404(category_id)
    db.session.delete(category)
    db.session.commit()
    return api_response(True, "Category deleted.")


# ------------------------------------------------------------------ Products
@products_bp.route("/products", methods=["GET"])
def list_products():
    # Products from stores that are pending, rejected or suspended never show up publicly.
    query = Product.query.filter(
        Product.is_active.is_(True),
        Product.store.has(Store.status == StoreStatusEnum.APPROVED),
    )

    category_id = request.args.get("category_id", type=int)
    store_id = request.args.get("store_id", type=int)
    brand = request.args.get("brand")
    search = request.args.get("q")
    min_price = request.args.get("min_price", type=float)
    max_price = request.args.get("max_price", type=float)
    sort = request.args.get("sort", "newest")
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 20, type=int), 100)

    if category_id:
        query = query.filter_by(category_id=category_id)
    if store_id:
        query = query.filter_by(store_id=store_id)
    if brand:
        query = query.filter(Product.brand.ilike(f"%{brand}%"))
    if search:
        query = query.filter(Product.name.ilike(f"%{search}%"))
    if min_price is not None:
        query = query.filter(Product.price >= min_price)
    if max_price is not None:
        query = query.filter(Product.price <= max_price)

    if sort == "price_asc":
        query = query.order_by(Product.price.asc())
    elif sort == "price_desc":
        query = query.order_by(Product.price.desc())
    else:
        query = query.order_by(Product.created_at.desc())

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    return api_response(True, data={
        "items": [p.to_dict() for p in pagination.items],
        "total": pagination.total,
        "page": page,
        "pages": pagination.pages,
    })


@products_bp.route("/products/<int:product_id>", methods=["GET"])
def get_product(product_id):
    product = Product.query.get_or_404(product_id)
    if not _store_visible(product.store):
        return api_response(False, "Resource not found.", status=404)
    payload = product.to_dict()
    payload["reviews"] = [r.to_dict() for r in product.reviews.order_by(Review.created_at.desc()).limit(20)]
    return api_response(True, data=payload)


def _get_vendor_store():
    store = Store.query.filter_by(owner_id=current_user.id).first()
    return store


_STORE_BLOCK_MESSAGES = {
    "pending": "Your store is still waiting for admin approval. You can add products once it is approved.",
    "rejected": "Your vendor application was not approved. Update your store details and resubmit it for review.",
    "suspended": "Your store is currently suspended. Please contact support.",
}


def approved_vendor_required(fn):
    """Vendors can only change the catalogue once an admin has approved their store."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if current_user.is_authenticated and current_user.role == RoleEnum.VENDOR:
            store = _get_vendor_store()
            if store and store.status != StoreStatusEnum.APPROVED:
                return api_response(
                    False,
                    _STORE_BLOCK_MESSAGES.get(store.status.value, "Your store is not approved."),
                    status=403,
                )
        return fn(*args, **kwargs)
    return wrapper


def _store_visible(store):
    """Approved stores are public; others are visible only to their owner and admins."""
    if store.status == StoreStatusEnum.APPROVED:
        return True
    if current_user.is_authenticated:
        return current_user.role == RoleEnum.ADMIN or store.owner_id == current_user.id
    return False


@products_bp.route("/products", methods=["POST"])
@login_required
@role_required(RoleEnum.VENDOR, RoleEnum.ADMIN)
@approved_vendor_required
def create_product():
    store = _get_vendor_store()
    if current_user.role == RoleEnum.VENDOR and not store:
        return api_response(False, "You must create a store before adding products.", status=400)

    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()
    category_id = data.get("category_id")
    price = data.get("price")
    store_id = data.get("store_id") if current_user.role == RoleEnum.ADMIN else store.id

    if not name or not category_id or price is None or not store_id:
        return api_response(False, "name, category_id, price and store_id are required.", status=400)

    try:
        price_val = Decimal(str(price))
    except InvalidOperation:
        return api_response(False, "price must be numeric.", status=400)

    category = Category.query.get(category_id)
    if not category:
        return api_response(False, "Invalid category_id.", status=400)

    product = Product(
        store_id=store_id,
        category_id=category_id,
        name=name,
        brand=data.get("brand"),
        description=data.get("description"),
        price=price_val,
        discount_percent=data.get("discount_percent", 0),
        stock_quantity=data.get("stock_quantity", 0),
        image_url=data.get("image_url"),
    )
    db.session.add(product)
    db.session.commit()
    return api_response(True, "Product created.", data=product.to_dict(), status=201)


@products_bp.route("/products/<int:product_id>", methods=["PUT"])
@login_required
@role_required(RoleEnum.VENDOR, RoleEnum.ADMIN)
@approved_vendor_required
def update_product(product_id):
    product = Product.query.get_or_404(product_id)

    if current_user.role == RoleEnum.VENDOR:
        store = _get_vendor_store()
        if not store or product.store_id != store.id:
            return api_response(False, "You can only edit your own products.", status=403)

    data = request.get_json(force=True, silent=True) or {}
    for field in ("name", "brand", "description", "stock_quantity", "discount_percent", "image_url", "is_active"):
        if field in data:
            setattr(product, field, data[field])
    if "price" in data:
        try:
            product.price = Decimal(str(data["price"]))
        except InvalidOperation:
            return api_response(False, "price must be numeric.", status=400)
    if "category_id" in data:
        if not Category.query.get(data["category_id"]):
            return api_response(False, "Invalid category_id.", status=400)
        product.category_id = data["category_id"]

    db.session.commit()
    return api_response(True, "Product updated.", data=product.to_dict())


@products_bp.route("/products/<int:product_id>", methods=["DELETE"])
@login_required
@role_required(RoleEnum.VENDOR, RoleEnum.ADMIN)
@approved_vendor_required
def delete_product(product_id):
    product = Product.query.get_or_404(product_id)
    if current_user.role == RoleEnum.VENDOR:
        store = _get_vendor_store()
        if not store or product.store_id != store.id:
            return api_response(False, "You can only delete your own products.", status=403)
    db.session.delete(product)
    db.session.commit()
    return api_response(True, "Product deleted.")


def _authorize_vendor_product(product):
    """Admins can touch any product; vendors only their own store's products."""
    if current_user.role == RoleEnum.VENDOR:
        store = _get_vendor_store()
        if not store or product.store_id != store.id:
            return False
    return True


@products_bp.route("/products/<int:product_id>/image", methods=["POST"])
@login_required
@role_required(RoleEnum.VENDOR, RoleEnum.ADMIN)
@approved_vendor_required
def upload_product_image(product_id):
    """Vendor product image upload. Accepts either a single 'image' file or
    multiple files under 'images' (multipart form), so a vendor can add a
    full photo gallery for a product in one request. Every uploaded file is
    saved to disk and served back via Product.images / Product.image_url so
    it renders on the storefront."""
    product = Product.query.get_or_404(product_id)
    if not _authorize_vendor_product(product):
        return api_response(False, "You can only manage images for your own products.", status=403)

    files = request.files.getlist("images") or request.files.getlist("image")
    if not files or all(f.filename == "" for f in files):
        return api_response(False, "No image file(s) provided.", status=400)

    upload_dir = current_app.config["UPLOAD_FOLDER"]

    saved = []
    for file in files:
        if not file or file.filename == "":
            continue
        if not _allowed_file(file.filename):
            return api_response(False, f"'{file.filename}' is not a supported image type.", status=400)

        unique_name = f"product_{product_id}_{uuid.uuid4().hex[:8]}_{secure_filename(file.filename)}"
        try:
            image_url = save_image(file, upload_dir, unique_name)
        except Exception:
            current_app.logger.exception("Image upload failed")
            db.session.rollback()
            return api_response(False, "Image upload failed. Please try again.", status=500)

        next_order = (db.session.query(db.func.coalesce(db.func.max(ProductImage.sort_order), -1))
                      .filter_by(product_id=product.id).scalar()) + 1
        img = ProductImage(product_id=product.id, image_url=image_url, sort_order=next_order)
        db.session.add(img)
        saved.append(img)

    db.session.flush()
    # Cover image (Product.image_url) always mirrors the first gallery photo
    # so listings/cards that only read image_url keep working unchanged.
    if not product.image_url and saved:
        product.image_url = saved[0].image_url

    db.session.commit()
    return api_response(
        True,
        f"{len(saved)} image(s) uploaded.",
        data={"image_url": product.image_url, "images": [i.to_dict() for i in product.images]},
        status=201,
    )


@products_bp.route("/products/<int:product_id>/image/<int:image_id>", methods=["DELETE"])
@login_required
@role_required(RoleEnum.VENDOR, RoleEnum.ADMIN)
@approved_vendor_required
def delete_product_image(product_id, image_id):
    product = Product.query.get_or_404(product_id)
    if not _authorize_vendor_product(product):
        return api_response(False, "You can only manage images for your own products.", status=403)

    image = ProductImage.query.filter_by(id=image_id, product_id=product_id).first_or_404()

    # Remove the stored file (best-effort; a missing file shouldn't block the DB delete)
    delete_image(image.image_url, current_app.config["UPLOAD_FOLDER"])

    was_cover = product.image_url == image.image_url
    db.session.delete(image)
    db.session.flush()

    if was_cover:
        remaining = ProductImage.query.filter_by(product_id=product_id).order_by(ProductImage.sort_order).first()
        product.image_url = remaining.image_url if remaining else None

    db.session.commit()
    return api_response(True, "Image deleted.", data={"image_url": product.image_url,
                                                        "images": [i.to_dict() for i in product.images]})


# --------------------------------------------------------- Bulk Excel upload
@products_bp.route("/products/bulk-upload/template", methods=["GET"])
@login_required
@role_required(RoleEnum.VENDOR, RoleEnum.ADMIN)
def bulk_upload_template():
    """Downloadable .xlsx template vendors fill in to add many products at
    once. Includes a sample row plus a reference sheet of valid category
    names, so vendors don't have to guess category_id values."""
    categories = Category.query.order_by(Category.name).all()

    sample = pd.DataFrame([{
        "name": "Radiant Glow Foundation",
        "brand": "Luminous",
        "category": categories[0].name if categories else "Foundation",
        "price": 2499,
        "discount_percent": 10,
        "stock_quantity": 50,
        "description": "Lightweight buildable coverage foundation.",
    }], columns=BULK_UPLOAD_COLUMNS)

    categories_df = pd.DataFrame({"valid_category_names": [c.name for c in categories]})

    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        sample.to_excel(writer, index=False, sheet_name="products")
        categories_df.to_excel(writer, index=False, sheet_name="categories_reference")
    buffer.seek(0)

    return send_file(
        buffer,
        as_attachment=True,
        download_name="cosmostore_bulk_product_template.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@products_bp.route("/products/bulk-upload", methods=["POST"])
@login_required
@role_required(RoleEnum.VENDOR, RoleEnum.ADMIN)
@approved_vendor_required
def bulk_upload_products():
    """Vendor uploads a single .xlsx file to create many products in one go.
    Expected columns (case-insensitive): name, brand, category, price,
    discount_percent, stock_quantity, description. Each row is validated
    independently so one bad row doesn't block the rest of the file; a
    per-row report of what was created vs. rejected is returned."""
    store = _get_vendor_store()
    if current_user.role == RoleEnum.VENDOR and not store:
        return api_response(False, "You must create a store before bulk-uploading products.", status=400)

    if "file" not in request.files or request.files["file"].filename == "":
        return api_response(False, "No file provided. Upload an .xlsx file under the 'file' field.", status=400)

    file = request.files["file"]
    if not _allowed_bulk_file(file.filename):
        return api_response(False, "Only .xlsx or .xls files are supported.", status=400)

    store_id = request.form.get("store_id", type=int) if current_user.role == RoleEnum.ADMIN else store.id

    try:
        df = pd.read_excel(file, sheet_name=0)
    except Exception as e:
        return api_response(False, f"Could not read the Excel file: {e}", status=400)

    df.columns = [str(c).strip().lower() for c in df.columns]
    missing_cols = [c for c in ("name", "category", "price") if c not in df.columns]
    if missing_cols:
        return api_response(
            False,
            f"Missing required column(s): {', '.join(missing_cols)}. "
            f"Download the template for the expected format.",
            status=400,
        )

    categories_by_name = {c.name.strip().lower(): c for c in Category.query.all()}

    created, errors = [], []
    for idx, row in df.iterrows():
        excel_row_num = idx + 2  # +1 for header row, +1 for 1-based indexing
        name = str(row.get("name") or "").strip()
        category_raw = str(row.get("category") or "").strip()
        price_raw = row.get("price")

        if not name or name.lower() == "nan":
            errors.append({"row": excel_row_num, "reason": "Missing product name."})
            continue
        if not category_raw or category_raw.lower() == "nan":
            errors.append({"row": excel_row_num, "reason": f"'{name}': missing category."})
            continue

        category = categories_by_name.get(category_raw.lower())
        if not category:
            errors.append({
                "row": excel_row_num,
                "reason": f"'{name}': unknown category '{category_raw}'.",
            })
            continue

        try:
            price_val = Decimal(str(price_raw))
            if price_val <= 0:
                raise InvalidOperation
        except (InvalidOperation, TypeError, ValueError):
            errors.append({"row": excel_row_num, "reason": f"'{name}': price must be a positive number."})
            continue

        try:
            discount = float(row.get("discount_percent") or 0)
        except (TypeError, ValueError):
            discount = 0.0
        try:
            stock = int(row.get("stock_quantity") or 0)
        except (TypeError, ValueError):
            stock = 0

        brand = row.get("brand")
        brand = None if brand is None or str(brand).lower() == "nan" else str(brand).strip()
        description = row.get("description")
        description = None if description is None or str(description).lower() == "nan" else str(description).strip()

        product = Product(
            store_id=store_id,
            category_id=category.id,
            name=name,
            brand=brand,
            description=description,
            price=price_val,
            discount_percent=max(0.0, min(90.0, discount)),
            stock_quantity=max(0, stock),
        )
        db.session.add(product)
        created.append(product)

    db.session.commit()

    return api_response(
        True if created else False,
        f"{len(created)} product(s) created, {len(errors)} row(s) skipped.",
        data={
            "created_count": len(created),
            "error_count": len(errors),
            "created_products": [p.to_dict() for p in created],
            "errors": errors,
        },
        status=201 if created else 400,
    )


# --------------------------------------------------------------------- Reviews
@products_bp.route("/products/<int:product_id>/reviews", methods=["POST"])
@login_required
def add_review(product_id):
    product = Product.query.get_or_404(product_id)
    data = request.get_json(force=True, silent=True) or {}
    rating = data.get("rating")
    if rating is None or not (1 <= int(rating) <= 5):
        return api_response(False, "rating must be between 1 and 5.", status=400)

    review = Review(product_id=product.id, user_id=current_user.id, rating=int(rating), comment=data.get("comment"))
    db.session.add(review)
    db.session.commit()
    return api_response(True, "Review added.", data=review.to_dict(), status=201)


# ----------------------------------------------------------------- Vendor stores
@products_bp.route("/stores", methods=["GET"])
def list_stores():
    stores = Store.query.filter_by(status="approved").all()
    return api_response(True, data=[s.to_dict() for s in stores])


@products_bp.route("/stores", methods=["POST"])
@login_required
@role_required(RoleEnum.VENDOR)
def create_store():
    if Store.query.filter_by(owner_id=current_user.id).first():
        return api_response(False, "You already have a store.", status=409)

    data = request.get_json(force=True, silent=True) or {}
    store_name = (data.get("store_name") or "").strip()
    if not store_name:
        return api_response(False, "store_name is required.", status=400)

    slug = slugify(store_name)
    if Store.query.filter_by(slug=slug).first():
        slug = f"{slug}-{current_user.id}"

    store = Store(
        owner_id=current_user.id,
        store_name=store_name,
        slug=slug,
        description=data.get("description"),
        logo_url=data.get("logo_url"),
        banner_url=data.get("banner_url"),
    )
    db.session.add(store)
    notify_admins(
        "New vendor application",
        f"{current_user.full_name} submitted the store '{store_name}'. Review it in Admin > Vendors.",
    )
    db.session.commit()
    return api_response(True, "Store created. Awaiting admin approval.", data=store.to_dict(), status=201)


@products_bp.route("/stores/<int:store_id>", methods=["GET"])
def get_store(store_id):
    store = Store.query.get_or_404(store_id)
    if not _store_visible(store):
        return api_response(False, "Resource not found.", status=404)
    payload = store.to_dict()
    payload["products"] = [p.to_dict() for p in store.products.filter_by(is_active=True).all()]
    return api_response(True, data=payload)


@products_bp.route("/stores/my-store", methods=["GET"])
@login_required
@role_required(RoleEnum.VENDOR)
def my_store():
    store = _get_vendor_store()
    if not store:
        return api_response(False, "You have not created a store yet.", status=404)
    payload = store.to_dict(include_owner=True)
    payload["products"] = [p.to_dict() for p in store.products.all()]
    return api_response(True, data=payload)


@products_bp.route("/stores/my-store/resubmit", methods=["POST"])
@login_required
@role_required(RoleEnum.VENDOR)
def resubmit_store():
    """A vendor whose application was rejected fixes their details and sends it back for review."""
    store = _get_vendor_store()
    if not store:
        return api_response(False, "You have not created a store yet.", status=404)
    if store.status != StoreStatusEnum.REJECTED:
        return api_response(False, "Only rejected applications can be resubmitted.", status=400)

    store.status = StoreStatusEnum.PENDING
    store.rejection_reason = None
    store.reviewed_at = None
    store.reviewed_by = None
    notify_admins(
        "Vendor application resubmitted",
        f"{current_user.full_name} resubmitted '{store.store_name}' for review.",
    )
    db.session.commit()
    return api_response(True, "Application resubmitted for review.", data=store.to_dict(include_owner=True))


@products_bp.route("/stores/<int:store_id>", methods=["PUT"])
@login_required
@role_required(RoleEnum.VENDOR, RoleEnum.ADMIN)
def update_store(store_id):
    store = Store.query.get_or_404(store_id)
    if current_user.role == RoleEnum.VENDOR and store.owner_id != current_user.id:
        return api_response(False, "You can only edit your own store.", status=403)

    data = request.get_json(force=True, silent=True) or {}
    for field in ("store_name", "description", "logo_url", "banner_url"):
        if field in data:
            setattr(store, field, data[field])
    if current_user.role == RoleEnum.ADMIN and "status" in data:
        store.status = data["status"]
    if current_user.role == RoleEnum.ADMIN and "commission_rate" in data:
        store.commission_rate = data["commission_rate"]

    db.session.commit()
    return api_response(True, "Store updated.", data=store.to_dict())
