import os

from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix
from dotenv import load_dotenv

from app.config import config_map
from app.extensions import (
    db,
    login_manager,
    bcrypt,
    mail,
    cors,
)


# ==================================================
# LOAD ENVIRONMENT VARIABLES
# ==================================================

load_dotenv()


def create_app(config_name=None):

    app = Flask(__name__)

    # ==================================================
    # CONFIGURATION
    # ==================================================

    # Render sets RENDER=true automatically, so production settings apply
    # there even if FLASK_ENV was never added to the dashboard.
    on_render = os.environ.get("RENDER", "").lower() == "true"

    config_name = config_name or os.environ.get(
        "FLASK_ENV",
        "production" if on_render else "development"
    )

    if on_render:
        config_name = "production"

    app.config.from_object(
        config_map.get(
            config_name,
            config_map["default"]
        )
    )

    # ==================================================
    # PROXY (Render terminates HTTPS and forwards requests)
    # ==================================================

    # Without this, Flask sees the proxy's IP/http scheme instead of the
    # real client, which breaks secure cookies and Flask-Login sessions.
    app.wsgi_app = ProxyFix(
        app.wsgi_app,
        x_for=1,
        x_proto=1,
        x_host=1,
    )

    # ==================================================
    # SESSION CONFIGURATION
    # ==================================================

    # Frontend and backend live on different *.onrender.com subdomains,
    # which browsers treat as cross-site. The session cookie must be
    # SameSite=None + Secure or it is never sent with API requests.
    is_prod = config_name == "production" or on_render

    cookie_samesite = "None" if is_prod else "Lax"

    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = cookie_samesite
    app.config["SESSION_COOKIE_SECURE"] = is_prod

    app.config["REMEMBER_COOKIE_HTTPONLY"] = True
    app.config["REMEMBER_COOKIE_SAMESITE"] = cookie_samesite
    app.config["REMEMBER_COOKIE_SECURE"] = is_prod

    # ==================================================
    # DIRECTORIES
    # ==================================================

    os.makedirs(
        app.config["UPLOAD_FOLDER"],
        exist_ok=True
    )

    os.makedirs(
        app.config["ML_MODEL_DIR"],
        exist_ok=True
    )

    # ==================================================
    # EXTENSIONS
    # ==================================================

    db.init_app(app)

    login_manager.init_app(app)

    bcrypt.init_app(app)

    mail.init_app(app)

    # ==================================================
    # CORS
    # ==================================================

    cors_origins = app.config.get("CORS_ORIGINS", [])

    # CORS_ORIGINS may arrive from the environment as a comma-separated string.
    if isinstance(cors_origins, str):
        cors_origins = [
            origin.strip().rstrip("/")
            for origin in cors_origins.split(",")
            if origin.strip()
        ]

    cors.init_app(
        app,
        resources={
            r"/api/*": {
                "origins": cors_origins,
                "supports_credentials": True,
                "allow_headers": ["Content-Type", "Authorization"],
                "methods": [
                    "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"
                ],
            }
        },
    )

    # ==================================================
    # FLASK-LOGIN
    # ==================================================

    # Never redirect API requests to /login.
    # Return JSON 401 instead.
    @login_manager.unauthorized_handler
    def unauthorized():

        return {
            "success": False,
            "message": "Authentication required."
        }, 401

    # ==================================================
    # USER LOADER
    # ==================================================

    from app.models import User

    @login_manager.user_loader
    def load_user(user_id):

        try:
            return db.session.get(
                User,
                int(user_id)
            )
        except (TypeError, ValueError):
            return None

    # ==================================================
    # BLUEPRINTS
    # ==================================================

    from app.routes.auth import auth_bp
    from app.routes.products import products_bp
    from app.routes.cart import cart_bp
    from app.routes.orders import orders_bp
    from app.routes.admin import admin_bp
    from app.routes.payments import payments_bp
    from app.routes.media import media_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(products_bp)
    app.register_blueprint(cart_bp)
    app.register_blueprint(orders_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(payments_bp)
    app.register_blueprint(media_bp)

    # ==================================================
    # HEALTH
    # ==================================================

    @app.route("/api/health", methods=["GET"])
    def health():

        from app.ml.fraud_predictor import is_model_trained

        return {
            "success": True,
            "status": "ok",
            "service": "CosmoStore API",
            "fraud_model_trained": is_model_trained(),
        }

    # ==================================================
    # 404 ERROR
    # ==================================================

    @app.errorhandler(404)
    def not_found(e):

        return {
            "success": False,
            "message": "Resource not found."
        }, 404

    # ==================================================
    # 500 ERROR
    # ==================================================

    @app.errorhandler(500)
    def server_error(e):

        app.logger.exception(
            "Internal server error"
        )

        return {
            "success": False,
            "message": "Internal server error."
        }, 500

    # ==================================================
    # CREATE TABLES
    # ==================================================

    # run.py only calls create_all() under __main__, which gunicorn never
    # executes, so tables must be created here for Render deployments.
    with app.app_context():
        try:
            db.create_all()
        except Exception:
            app.logger.exception("db.create_all() failed")

        # Adds columns/enum values introduced after the first deploy.
        try:
            from app.schema_upgrade import upgrade_schema
            upgrade_schema(db, app.logger)
        except Exception:
            app.logger.exception("schema upgrade failed")

    return app
