"""Tiny, idempotent schema upgrade.

The app creates tables with db.create_all(), which never alters tables that
already exist. This module adds the columns introduced by the vendor-approval
and fraud-flag features to an existing database (e.g. the Railway MySQL one)
without needing Alembic. Every step checks first, so running it on every
start-up is safe.
"""
from sqlalchemy import inspect, text

COLUMN_ADDITIONS = [
    ("users", "is_watchlisted", "BOOLEAN NOT NULL DEFAULT 0"),
    ("stores", "rejection_reason", "TEXT NULL"),
    ("stores", "reviewed_at", "DATETIME NULL"),
    ("stores", "reviewed_by", "INTEGER NULL"),
    ("fraud_checks", "risk_factors", "TEXT NULL"),
    ("fraud_checks", "risk_level", "VARCHAR(10) NULL"),
    ("fraud_checks", "flag_source", "VARCHAR(20) NULL"),
]

STORE_STATUS_ENUM = "ENUM('PENDING','APPROVED','REJECTED','SUSPENDED') NOT NULL"


def upgrade_schema(db, logger):
    engine = db.engine
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    for table, column, ddl in COLUMN_ADDITIONS:
        if table not in tables:
            continue
        existing = {c["name"] for c in inspector.get_columns(table)}
        if column in existing:
            continue
        try:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
            logger.info("schema_upgrade: added %s.%s", table, column)
        except Exception:
            # Another worker may have added it a moment ago.
            logger.exception("schema_upgrade: could not add %s.%s", table, column)

    # MySQL stores the Python enum as a native ENUM, so the new REJECTED value
    # has to be added to the column definition too.
    if engine.dialect.name == "mysql" and "stores" in tables:
        try:
            with engine.begin() as conn:
                row = conn.execute(text("SHOW COLUMNS FROM stores LIKE 'status'")).fetchone()
                col_type = row[1] if row else ""
                if isinstance(col_type, bytes):
                    col_type = col_type.decode()
                if col_type and "REJECTED" not in col_type.upper():
                    conn.execute(text(f"ALTER TABLE stores MODIFY COLUMN status {STORE_STATUS_ENUM}"))
                    logger.info("schema_upgrade: added REJECTED to stores.status")
        except Exception:
            logger.exception("schema_upgrade: could not extend stores.status enum")
