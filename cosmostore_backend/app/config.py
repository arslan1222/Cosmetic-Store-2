import os
from datetime import timedelta


basedir = os.path.abspath(
    os.path.dirname(
        os.path.dirname(__file__)
    )
)


class Config:

    # ==================================================
    # GENERAL
    # ==================================================

    SECRET_KEY = os.environ.get(
        "SECRET_KEY",
        "cosmostore-dev-secret-change-in-production"
    )


    # ==================================================
    # DATABASE
    # ==================================================

    # DB_USER = os.environ.get(
    #     "DB_USER",
    #     "root"
    # )

    # DB_PASSWORD = os.environ.get(
    #     "DB_PASSWORD",
    #     ""
    # )

    # DB_HOST = os.environ.get(
    #     "DB_HOST",
    #     "localhost"
    # )

    # DB_PORT = os.environ.get(
    #     "DB_PORT",
    #     "3306"
    # )

    # DB_NAME = os.environ.get(
    #     "DB_NAME",
    #     "sys"
    # )

    # SQLALCHEMY_DATABASE_URI = os.environ.get(
    #     "DATABASE_URL",
    #     f"mysql+pymysql://"
    #     f"{DB_USER}:{DB_PASSWORD}"
    #     f"@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    # )

    # SQLALCHEMY_TRACK_MODIFICATIONS = False

    
    # ==================================================
    # DATABASE
    # ==================================================

    from sqlalchemy.engine import make_url

    MYSQL_PUBLIC_URL = os.environ.get("MYSQL_PUBLIC_URL")
    DATABASE_URL = os.environ.get("DATABASE_URL")

    if MYSQL_PUBLIC_URL:
        database_url = make_url(MYSQL_PUBLIC_URL)
        SQLALCHEMY_DATABASE_URI = database_url.set(
            drivername="mysql+pymysql"
        ).render_as_string(hide_password=False)

    elif DATABASE_URL:
        database_url = make_url(DATABASE_URL)

        if database_url.drivername in ("mysql", "mariadb"):
            database_url = database_url.set(
                drivername="mysql+pymysql"
            )

        SQLALCHEMY_DATABASE_URI = database_url.render_as_string(
            hide_password=False
        )

    else:
        DB_USER = os.environ.get("DB_USER", "root")
        DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
        DB_HOST = os.environ.get("DB_HOST", "localhost")
        DB_PORT = os.environ.get("DB_PORT", "3306")
        DB_NAME = os.environ.get("DB_NAME", "cosmostore_db2")

        SQLALCHEMY_DATABASE_URI = (
            f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}"
            f"@{DB_HOST}:{DB_PORT}/{DB_NAME}"
        )

    SQLALCHEMY_TRACK_MODIFICATIONS = False

    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 280,
        "pool_timeout": 30,
        "connect_args": {
            "connect_timeout": 15
        }
    }



    # ==================================================
    # UPLOADS
    # ==================================================

    UPLOAD_FOLDER = os.path.join(
        basedir,
        "app",
        "static",
        "uploads"
    )

    MAX_CONTENT_LENGTH = 8 * 1024 * 1024


    # ==================================================
    # SESSION / AUTHENTICATION
    # ==================================================

    PERMANENT_SESSION_LIFETIME = timedelta(
        days=7
    )

    REMEMBER_COOKIE_DURATION = timedelta(
        days=7
    )

    # Browser session cookie
    SESSION_COOKIE_HTTPONLY = True

    # React localhost + Flask localhost
    SESSION_COOKIE_SAMESITE = "Lax"

    # Development uses HTTP
    SESSION_COOKIE_SECURE = False

    # Remember-me cookie
    REMEMBER_COOKIE_HTTPONLY = True
    REMEMBER_COOKIE_SAMESITE = "Lax"
    REMEMBER_COOKIE_SECURE = False


    # ==================================================
    # MAIL
    # ==================================================

    MAIL_SERVER = os.environ.get(
        "MAIL_SERVER",
        "smtp.gmail.com"
    )

    MAIL_PORT = int(
        os.environ.get(
            "MAIL_PORT",
            587
        )
    )

    MAIL_USE_TLS = True

    MAIL_USERNAME = os.environ.get(
        "MAIL_USERNAME",
        ""
    )

    MAIL_PASSWORD = os.environ.get(
        "MAIL_PASSWORD",
        ""
    )

    MAIL_DEFAULT_SENDER = os.environ.get(
        "MAIL_DEFAULT_SENDER",
        "CosmoStore <no-reply@cosmostore.local>"
    )

    MAIL_SUPPRESS_SEND = (
        os.environ.get(
            "MAIL_SUPPRESS_SEND",
            "1"
        ) == "1"
    )


    # ==================================================
    # ML FRAUD DETECTION
    # ==================================================

    ML_MODEL_DIR = os.path.join(
        basedir,
        "app",
        "ml",
        "saved_model"
    )

    ML_MODEL_PATH = os.path.join(
        ML_MODEL_DIR,
        "fraud_model.joblib"
    )

    ML_SCALER_PATH = os.path.join(
        ML_MODEL_DIR,
        "scaler.joblib"
    )

    ML_ENCODER_PATH = os.path.join(
        ML_MODEL_DIR,
        "type_encoder.joblib"
    )

    ML_METRICS_PATH = os.path.join(
        ML_MODEL_DIR,
        "metrics.json"
    )

    FRAUD_HOLD_THRESHOLD = float(
        os.environ.get(
            "FRAUD_HOLD_THRESHOLD",
            0.55
        )
    )


    # ==================================================
    # PAYMENT GATEWAYS
    # ==================================================
    # Every gateway below runs in one of two modes, decided automatically
    # by whether its credentials are set:
    #   - Real sandbox/production mode: credentials present -> the backend
    #     makes a genuine signed HTTP call to the gateway's own API.
    #   - Simulator mode: credentials absent -> a deterministic, validated
    #     stand-in (OTP challenge / Luhn check) runs instead, so the project
    #     still demos end-to-end without a live merchant account. This is
    #     NOT "always succeed" -- a clearly fake mobile number or card still
    #     fails, and OTPs must actually be entered correctly.

    # ---- JazzCash (Mobile Wallet REST API v2.0) ----
    # Get free sandbox credentials at https://sandbox.jazzcash.com.pk
    JAZZCASH_MERCHANT_ID = os.environ.get("JAZZCASH_MERCHANT_ID", "")
    JAZZCASH_PASSWORD = os.environ.get("JAZZCASH_PASSWORD", "")
    JAZZCASH_INTEGRITY_SALT = os.environ.get("JAZZCASH_INTEGRITY_SALT", "")
    JAZZCASH_BASE_URL = os.environ.get(
        "JAZZCASH_BASE_URL",
        "https://sandbox.jazzcash.com.pk" if os.environ.get("JAZZCASH_ENV", "sandbox") != "production"
        else "https://payments.jazzcash.com.pk",
    )

    # ---- Easypaisa (Open API - Mobile Account) ----
    # Issued to you after Easypaisa merchant onboarding.
    EASYPAISA_STORE_ID = os.environ.get("EASYPAISA_STORE_ID", "")
    EASYPAISA_HASH_KEY = os.environ.get("EASYPAISA_HASH_KEY", "")
    EASYPAISA_USERNAME = os.environ.get("EASYPAISA_USERNAME", "")
    EASYPAISA_PASSWORD = os.environ.get("EASYPAISA_PASSWORD", "")
    EASYPAISA_BASE_URL = os.environ.get(
        "EASYPAISA_BASE_URL",
        "https://easypay.easypaisa.com.pk" if os.environ.get("EASYPAISA_ENV", "sandbox") != "production"
        else "https://easypay.easypaisa.com.pk",
    )

    # ---- Card payments (Stripe) ----
    # Pakistan isn't yet a Stripe-supported country for receiving payouts,
    # so this demonstrates genuine, working card-processing mechanics
    # (real API, real PCI-safe card entry, real test-mode charges) for the
    # FYP; a production rollout in Pakistan would sit behind a local
    # acquiring bank / PCI-DSS processor instead. Free test keys:
    # https://dashboard.stripe.com/register
    STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
    STRIPE_PUBLISHABLE_KEY = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")

    PAYMENT_OTP_TTL_MINUTES = 5


    # ==================================================
    # CORS
    # ==================================================

    CORS_ORIGINS = [
        origin.strip()
        for origin in os.environ.get(
            "CORS_ORIGINS",
            "http://localhost:3000,http://localhost:5173"
        ).split(",")
        if origin.strip()
    ]


# ==================================================
# DEVELOPMENT
# ==================================================

class DevelopmentConfig(Config):
    DEBUG = True


# ==================================================
# PRODUCTION
# ==================================================

class ProductionConfig(Config):
    DEBUG = False

    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "None"

    REMEMBER_COOKIE_SECURE = True
    REMEMBER_COOKIE_HTTPONLY = True
    REMEMBER_COOKIE_SAMESITE = "None"


# ==================================================
# TESTING
# ==================================================

class TestingConfig(Config):
    TESTING = True

    SQLALCHEMY_DATABASE_URI = (
        "sqlite:///:memory:"
    )

    MAIL_SUPPRESS_SEND = True


# ==================================================
# CONFIGURATION MAP
# ==================================================

config_map = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
    "default": DevelopmentConfig,
}
