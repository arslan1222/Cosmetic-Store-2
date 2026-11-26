from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_bcrypt import Bcrypt
from flask_mail import Mail
from flask_cors import CORS


# ==================================================
# DATABASE
# ==================================================

db = SQLAlchemy()


# ==================================================
# FLASK-LOGIN
# ==================================================

login_manager = LoginManager()

# IMPORTANT:
# Do NOT set login_view = "auth.login"
#
# /api/auth/login is a POST API endpoint.
# Redirecting an unauthenticated GET request to it
# causes:
#
# GET /api/auth/login?next=...
# 405 METHOD NOT ALLOWED
#
# We handle unauthorized API requests in
# app/__init__.py instead.

login_manager.session_protection = "strong"


# ==================================================
# BCRYPT
# ==================================================

bcrypt = Bcrypt()


# ==================================================
# MAIL
# ==================================================

mail = Mail()


# ==================================================
# CORS
# ==================================================

cors = CORS()