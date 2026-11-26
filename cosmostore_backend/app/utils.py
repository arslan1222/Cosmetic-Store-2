import re
import uuid
from functools import wraps

from flask import jsonify
from flask_login import current_user

from app.models import RoleEnum


def api_response(success=True, message="", data=None, status=200):
    payload = {"success": success, "message": message}
    if data is not None:
        payload["data"] = data
    return jsonify(payload), status


def role_required(*roles):
    """Restrict an endpoint to one or more roles, e.g. @role_required(RoleEnum.ADMIN)"""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if not current_user.is_authenticated:
                return api_response(False, "Authentication required.", status=401)
            role_values = [r.value if isinstance(r, RoleEnum) else r for r in roles]
            current_role = current_user.role.value if isinstance(current_user.role, RoleEnum) else current_user.role
            if current_role not in role_values:
                return api_response(False, "You do not have permission to perform this action.", status=403)
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text or uuid.uuid4().hex[:8]


def generate_order_number() -> str:
    return "CS-" + uuid.uuid4().hex[:10].upper()


EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def is_valid_email(email: str) -> bool:
    return bool(EMAIL_REGEX.match(email or ""))
