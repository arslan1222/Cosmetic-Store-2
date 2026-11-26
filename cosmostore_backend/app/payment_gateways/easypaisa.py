"""
Easypaisa integration -- Open API, Mobile Account (MA) flow.

Real mode (EASYPAISA_STORE_ID / USERNAME / PASSWORD / HASH_KEY set):
Easypaisa's MA flow is two steps -- initiate debits nothing and causes
Easypaisa's own system to text an OTP to the customer's Easypaisa-registered
number; verify submits that OTP together with the original order reference
to actually complete the debit. Requests are authenticated with HTTP Basic
Auth (store username/password) and signed with an HMAC-SHA256 request hash
keyed with the merchant's Hash Key, mirroring the shape documented for
Easypaisa's Open API integrations.

These credentials are issued directly by Easypaisa during merchant
onboarding -- there's no public self-serve sandbox signup the way JazzCash
has one, so until onboarding completes this project runs in simulator mode
for Easypaisa by default, which is expected and fine for a student project.

Simulator mode: issues its own OTP challenge (shown back to the client,
since there's no real SMS channel without credentials) and requires it to
be entered correctly -- so, same as the JazzCash simulator, a made-up
number can't silently succeed.
"""
import hashlib
import hmac
from datetime import datetime

import requests
from flask import current_app

from .common import (
    is_valid_pk_mobile, new_transaction_ref, generate_otp, hash_otp,
    otp_expiry, constant_time_eq,
)


def is_configured():
    cfg = current_app.config
    return bool(cfg.get("EASYPAISA_STORE_ID") and cfg.get("EASYPAISA_USERNAME")
                and cfg.get("EASYPAISA_PASSWORD") and cfg.get("EASYPAISA_HASH_KEY"))


def _request_hash(payload: dict, hash_key: str) -> str:
    items = sorted(payload.items())
    value_string = "&".join(f"{k}={v}" for k, v in items if v not in (None, ""))
    return hmac.new(hash_key.encode(), value_string.encode(), hashlib.sha256).hexdigest()


def initiate(mobile_number: str, amount_pkr: float, order_ref: str):
    if not is_valid_pk_mobile(mobile_number):
        return {"ok": False, "error": "Enter a valid Pakistani mobile number in the format 03XXXXXXXXX."}

    txn_ref = new_transaction_ref("EP")

    if is_configured():
        cfg = current_app.config
        payload = {
            "storeId": cfg["EASYPAISA_STORE_ID"],
            "amount": f"{amount_pkr:.2f}",
            "accountNum": mobile_number,
            "orderRefNum": order_ref,
            "transactionRefNum": txn_ref,
            "transactionDateTime": datetime.utcnow().strftime("%Y%m%d%H%M%S"),
        }
        payload["merchantHashedReq"] = _request_hash(payload, cfg["EASYPAISA_HASH_KEY"])

        try:
            resp = requests.post(
                f"{cfg['EASYPAISA_BASE_URL']}/easypay-service/rest/v4/initiate-ma-transaction",
                json=payload,
                auth=(cfg["EASYPAISA_USERNAME"], cfg["EASYPAISA_PASSWORD"]),
                timeout=20,
            )
            body = resp.json()
        except Exception as e:
            return {"ok": False, "error": f"Could not reach Easypaisa: {e}"}

        # Easypaisa sends the OTP to the customer's phone directly; we only
        # learn whether the initiate call itself was accepted here.
        accepted = str(body.get("responseCode", "")) in ("0", "0000")
        return {
            "ok": accepted,
            "is_live_gateway": True,
            "immediate": False,
            "transaction_ref": txn_ref,
            "raw": body,
            "error": None if accepted else body.get("responseDesc", "Easypaisa rejected the request."),
        }

    # ---- Simulator fallback (no merchant credentials configured) ----
    otp = generate_otp()
    return {
        "ok": True,
        "is_live_gateway": False,
        "immediate": False,
        "transaction_ref": txn_ref,
        "otp_hash": hash_otp(otp, txn_ref),
        "otp_expires_at": otp_expiry(current_app.config.get("PAYMENT_OTP_TTL_MINUTES", 5)),
        "debug_otp": otp,
        "error": None,
    }


def verify(transaction_ref: str, otp: str, order_ref: str, amount_pkr: float, stored_otp_hash: str = None):
    """Real mode submits the OTP to Easypaisa for the actual debit.
    Simulator mode checks it against the locally-issued challenge."""
    if is_configured():
        cfg = current_app.config
        payload = {
            "storeId": cfg["EASYPAISA_STORE_ID"],
            "accountNum": otp,  # Easypaisa's confirm step takes the OTP in this field for MA
            "amount": f"{amount_pkr:.2f}",
            "orderRefNum": order_ref,
            "transactionRefNum": transaction_ref,
        }
        payload["merchantHashedReq"] = _request_hash(payload, cfg["EASYPAISA_HASH_KEY"])
        try:
            resp = requests.post(
                f"{cfg['EASYPAISA_BASE_URL']}/easypay-service/rest/v4/confirm-ma-transaction",
                json=payload,
                auth=(cfg["EASYPAISA_USERNAME"], cfg["EASYPAISA_PASSWORD"]),
                timeout=20,
            )
            body = resp.json()
        except Exception as e:
            return {"ok": False, "error": f"Could not reach Easypaisa: {e}"}

        success = str(body.get("responseCode", "")) in ("0", "0000")
        return {"ok": success, "raw": body,
                "error": None if success else body.get("responseDesc", "Easypaisa declined the OTP.")}

    candidate = hash_otp(otp, transaction_ref)
    if not stored_otp_hash or not constant_time_eq(candidate, stored_otp_hash):
        return {"ok": False, "error": "Incorrect OTP."}
    return {"ok": True, "error": None}
