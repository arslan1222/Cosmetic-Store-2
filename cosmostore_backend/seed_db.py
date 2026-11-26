"""
Seeds the database with demo/presentation-ready data:
  - 1 admin, 2 vendors (with stores), 2 customers
  - 6 cosmetic categories
  - ~14 sample products across the two stores

Run:
    python seed_db.py
"""
from decimal import Decimal

from app import create_app
from app.extensions import db
from app.models import User, Store, Category, Product, RoleEnum, StoreStatusEnum
from app.utils import slugify

app = create_app()

CATEGORIES = ["Foundation", "Lipstick", "Concealer", "Blush", "Mascara", "Skincare"]

# (name, category, brand, price, description, discount_percent, stock_quantity, store_key)
PRODUCTS = [
    ("Radiant Glow Foundation", "Foundation", "Luminous", 2499, "Lightweight buildable coverage foundation.", 10, 50, "store1"),
    ("Velvet Red Lipstick", "Lipstick", "Luminous", 1299, "Long-lasting matte red lipstick.", 0, 80, "store1"),
    ("Second Skin Concealer", "Concealer", "Luminous", 1699, "Full-coverage concealer that blurs imperfections.", 0, 60, "store1"),
    ("Soft Petal Blush", "Blush", "Luminous", 1199, "Buildable powder blush in a natural rose shade.", 15, 40, "store1"),
    ("Volume Lash Mascara", "Mascara", "Luminous", 999, "Smudge-proof volumizing mascara.", 0, 100, "store1"),
    ("Hydra Glow Serum", "Skincare", "Luminous", 2899, "Hyaluronic acid serum for all-day hydration.", 0, 35, "store1"),
    ("Everyday Matte Foundation", "Foundation", "GlowUp", 1899, "Budget-friendly matte finish foundation.", 5, 70, "store2"),
    ("Coral Crush Lipstick", "Lipstick", "GlowUp", 899, "Creamy coral lipstick with a satin finish.", 0, 90, "store2"),
    ("Bright Eyes Concealer", "Concealer", "GlowUp", 1099, "Brightening under-eye concealer.", 0, 65, "store2"),
    ("Sunset Glow Blush", "Blush", "GlowUp", 799, "Warm-toned blush for an everyday glow.", 0, 55, "store2"),
    ("Bold Lash Mascara", "Mascara", "GlowUp", 749, "Bold volumizing everyday mascara.", 0, 120, "store2"),
    ("Rosewater Toner", "Skincare", "GlowUp", 1299, "Alcohol-free rosewater toner for daily use.", 20, 45, "store2"),
]


def seed():
    with app.app_context():
        db.drop_all()
        db.create_all()

        # ---- Admin ----
        admin = User(full_name="CosmoStore Admin", email="admin@cosmostore.pk", role=RoleEnum.ADMIN,
                     account_age_days=500, is_verified=True)
        admin.set_password("Admin@123")
        db.session.add(admin)

        # ---- Vendors ----
        vendor1 = User(full_name="Ayesha Malik", email="vendor1@cosmostore.pk", role=RoleEnum.VENDOR,
                        account_age_days=300, is_verified=True, city="Lahore")
        vendor1.set_password("Vendor@123")
        vendor2 = User(full_name="Bilal Ahmed", email="vendor2@cosmostore.pk", role=RoleEnum.VENDOR,
                        account_age_days=200, is_verified=True, city="Karachi")
        vendor2.set_password("Vendor@123")
        db.session.add_all([vendor1, vendor2])
        db.session.flush()

        store1 = Store(owner_id=vendor1.id, store_name="Luminous Beauty Store",
                        slug=slugify("Luminous Beauty Store"), status=StoreStatusEnum.APPROVED,
                        description="Premium cosmetics for radiant, glowing skin.")
        store2 = Store(owner_id=vendor2.id, store_name="GlowUp Cosmetics",
                        slug=slugify("GlowUp Cosmetics"), status=StoreStatusEnum.APPROVED,
                        description="Affordable everyday makeup essentials.")
        db.session.add_all([store1, store2])

        # ---- Customers ----
        cust1 = User(full_name="Sara Khan", email="customer1@example.com", role=RoleEnum.CUSTOMER,
                     account_age_days=120, is_verified=True, city="Gujranwala",
                     address="Street 12, Model Town")
        cust1.set_password("Customer@123")
        cust2 = User(full_name="Ali Raza", email="customer2@example.com", role=RoleEnum.CUSTOMER,
                     account_age_days=5, is_verified=True, city="Islamabad",
                     address="House 45, F-10")
        cust2.set_password("Customer@123")
        db.session.add_all([cust1, cust2])

        # ---- Categories ----
        category_map = {}
        for name in CATEGORIES:
            cat = Category(name=name, slug=slugify(name))
            db.session.add(cat)
            category_map[name] = cat
        db.session.flush()

        # ---- Products ----
        store_map = {"store1": store1, "store2": store2}
        for name, category_name, brand, price, description, discount, stock, store_key in PRODUCTS:
            db.session.add(Product(
                store_id=store_map[store_key].id,
                category_id=category_map[category_name].id,
                name=name,
                brand=brand,
                description=description,
                price=Decimal(str(price)),
                discount_percent=discount,
                stock_quantity=stock,
            ))

        db.session.commit()
        print("Database seeded successfully!")
        print("\nDemo credentials:")
        print("  Admin    -> admin@cosmostore.pk / Admin@123")
        print("  Vendor 1 -> vendor1@cosmostore.pk / Vendor@123 (Luminous Beauty Store)")
        print("  Vendor 2 -> vendor2@cosmostore.pk / Vendor@123 (GlowUp Cosmetics)")
        print("  Customer 1 -> customer1@example.com / Customer@123")
        print("  Customer 2 -> customer2@example.com / Customer@123")


if __name__ == "__main__":
    seed()
