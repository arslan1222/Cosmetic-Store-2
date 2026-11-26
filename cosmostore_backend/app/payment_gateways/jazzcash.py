"""
JazzCash integration -- Mobile Wallet REST API v2.0 (DoMWalletTransaction).

Real mode (JAZZCASH_MERCHANT_ID / PASSWORD / INTEGRITY_SALT set in .env):
builds the pp_* parameter set exactly as JazzCash's integration guide
specifies, signs it with HMAC-SHA256 over the alphabetically-sorted,
non-empty pp_* values (salt prepended, salt used as the HMAC key, uppercase
hex digest), and posts it to the sandbox/production DoMWalletTransaction
endpoint. A pp_ResponseCode of "000" means the customer's MPIN entry (JazzCash
pushes a USSD/app prompt to their phone when this call is made) succeeded and
the wallet was actually debited.

Get free sandbox credentials at https://sandbox.jazzcash.com.pk -- no real
business verification is required for sandbox access, only for going live.

Simulator mode (no credentials configured): since the whole point of the
real call is that JazzCash prompts the customer's phone for their MPIN, and
we have no such channel to fake convincingly, the simulator instead issues
its own OTP challenge and requires it to be entered correctly. This keeps
the vulnerability this module was built to close -- "any 10-digit number
silently succeeds" -- actually closed in the places this project will
usually be graded/demoed from (i.e. without real merchant credentials).
"""
import hashlib
import hmac
from datetime import datetime, timedelta

import requests
from flask import current_app

from .common import (
    is_valid_pk_mobile, new_transaction_ref, generate_otp, hash_otp,
    otp_expiry, constant_time_eq,
)


def is_configured():
    cfg = current_app.config
    return bool(cfg.get("JAZZCASH_MERCHANT_ID") and cfg.get("JAZZCASH_PASSWORD")
                and cfg.get("JAZZCASH_INTEGRITY_SALT"))


def _secure_hash(params: dict, salt: str) -> str:
    """pp_SecureHash per the JazzCash integration guide: sort non-empty
    pp_* fields alphabetically by key, join their values with '&', prepend
    the Integrity Salt, then HMAC-SHA256 the whole string using the salt as
    the key; the digest is uppercase hex."""
    items = sorted((k, v) for k, v in params.items() if k.startswith("pp_") and v not in (None, "") and k != "pp_SecureHash")
    value_string = "&".join(str(v) for _, v in items)
    message = f"{salt}&{value_string}"
    return hmac.new(salt.encode(), message.encode(), hashlib.sha256).hexdigest().upper()


def initiate(mobile_number: str, cnic_last6: str, amount_pkr: float, order_ref: str):
    """Starts a JazzCash Mobile Wallet charge. Real mode completes the
    charge synchronously (JazzCash's own MPIN prompt happens on the
    customer's phone during this call) and returns success/failure
    immediately -- no separate verify step. Simulator mode instead returns
    a pending transaction with an OTP challenge for `verify()` to check."""
    if not is_valid_pk_mobile(mobile_number):
        return {"ok": False, "error": "Enter a valid Pakistani mobile number in the format 03XXXXXXXXX."}
    if not cnic_last6 or not cnic_last6.isdigit() or len(cnic_last6) != 6:
        return {"ok": False, "error": "Enter the last 6 digits of the CNIC registered with this JazzCash account."}

    txn_ref = new_transaction_ref("JC")

    if is_configured():
        cfg = current_app.config
        now = datetime.utcnow()
        params = {
            "pp_Version": "2.0",
            "pp_TxnType": "MWALLET",
            "pp_Language": "EN",
            "pp_MerchantID": cfg["JAZZCASH_MERCHANT_ID"],
            "pp_Password": cfg["JAZZCASH_PASSWORD"],
            "pp_TxnRefNo": txn_ref,
            "pp_Amount": str(int(round(amount_pkr * 100))),  # JazzCash amounts are in paisas
            "pp_TxnCurrency": "PKR",
            "pp_TxnDateTime": now.strftime("%Y%m%d%H%M%S"),
            "pp_BillReference": order_ref,
            "pp_Description": "CosmoStore order payment",
            "pp_TxnExpiryDateTime": (now + timedelta(minutes=10)).strftime("%Y%m%d%H%M%S"),
            "pp_MobileNumber": mobile_number,
            "pp_CNIC": cnic_last6,
        }
        params["pp_SecureHash"] = _secure_hash(params, cfg["JAZZCASH_INTEGRITY_SALT"])

        try:
            resp = requests.post(
                f"{cfg['JAZZCASH_BASE_URL']}/ApplicationAPI/API/2.0/Purchase/DoMWalletTransaction",
                json=params, timeout=20,
            )
            body = resp.json()
        except Exception as e:
            return {"ok": False, "error": f"Could not reach JazzCash: {e}"}

        success = body.get("pp_ResponseCode") == "000"
        return {
            "ok": success,
            "is_live_gateway": True,
            "immediate": True,  # no separate verify step needed
            "transaction_ref": txn_ref,
            "raw": body,
            "error": None if success else body.get("pp_ResponseMessage", "JazzCash declined the transaction."),
        }

    # ---- Simulator fallback (no sandbox credentials configured) ----
    otp = generate_otp()
    return {
        "ok": True,
        "is_live_gateway": False,
        "immediate": False,
        "transaction_ref": txn_ref,
        "otp_hash": hash_otp(otp, txn_ref),
        "otp_expires_at": otp_expiry(current_app.config.get("PAYMENT_OTP_TTL_MINUTES", 5)),
        "debug_otp": otp,  # only ever shown back to the client in simulator mode
        "error": None,
    }


def verify(transaction_ref: str, otp: str, stored_otp_hash: str):
    """Only used in simulator mode (real-mode JazzCash MWALLET resolves
    synchronously in initiate())."""
    candidate = hash_otp(otp, transaction_ref)
    if not stored_otp_hash or not constant_time_eq(candidate, stored_otp_hash):
        return {"ok": False, "error": "Incorrect OTP."}
    return {"ok": True, "error": None}
