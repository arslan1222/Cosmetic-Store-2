"""Small helpers for in-app notifications and best-effort email."""
from flask_mail import Message

from app.extensions import db, mail
from app.models import Notification, User, RoleEnum


def notify(user_id, title, message):
    db.session.add(Notification(user_id=user_id, title=title, message=message))


def notify_admins(title, message):
    """One in-app notification per active admin. Caller commits."""
    admins = User.query.filter_by(role=RoleEnum.ADMIN, is_active_account=True).all()
    for admin in admins:
        notify(admin.id, title, message)


def send_email_safe(subject, recipient, body):
    """Email must never break the request that triggered it."""
    try:
        mail.send(Message(subject=subject, recipients=[recipient], body=body))
    except Exception:
        pass
