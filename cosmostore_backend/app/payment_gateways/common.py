"""
Shared helpers used by every payment gateway module (jazzcash.py,
easypaisa.py, card_stripe.py). Kept gateway-agnostic on purpose so the
checkout/payments routes never have to special-case a specific provider's
quirks outside of its own module.
"""
import hashlib
import random
import re
import secrets
import uuid
from datetime import datetime, timedelta

# Pakistani mobile numbers: 03XXXXXXXXX (11 digits, starts with 03)
PK_MOBILE_RE = re.compile(r"^03\d{9}$")

# Rough but real network-prefix map, just for a friendlier error message
PK_NETWORK_PREFIXES = {
    "Jazz/Warid": ("0300", "0301", "0302", "0303", "0304", "0305", "0306", "0307", "0308", "0309", "0320", "0321", "0322", "0323", "0324", "0325"),
    "Zong": ("0310", "0311", "0312", "0313", "0314", "0315", "0316", "0317", "0318", "0319"),
    "Ufone": ("0330", "0331", "0332", "0333", "0334", "0335", "0336", "0337"),
    "Telenor": ("0340", "0341", "0342", "0343", "0344", "0345", "0346", "0347", "0348", "0349"),
}


def is_valid_pk_mobile(number: str) -> bool:
    return bool(number) and bool(PK_MOBILE_RE.match(number.strip()))


def luhn_check(card_number: str) -> bool:
    """Standard Luhn/mod-10 checksum -- catches typos and made-up numbers."""
    digits = [c for c in card_number if c.isdigit()]
    if len(digits) < 12:
        return False
    digits = [int(d) for d in digits]
    checksum = 0
    parity = len(digits) % 2
    for i, d in enumerate(digits):
        if i % 2 == parity:
            d *= 2
            if d > 9:
                d -= 9
        checksum += d
    return checksum % 10 == 0


def is_card_expired(exp_month: int, exp_year: int) -> bool:
    now = datetime.utcnow()
    if exp_year < now.year:
        return True
    if exp_year == now.year and exp_month < now.month:
        return True
    return False


def new_transaction_ref(prefix: str) -> str:
    stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    return f"{prefix}{stamp}{uuid.uuid4().hex[:6].upper()}"


def generate_otp() -> str:
    return f"{random.randint(0, 9999):04d}"


def hash_otp(otp: str, transaction_ref: str) -> str:
    # Salted with the transaction ref so OTP hashes aren't comparable across
    # transactions even when two happen to pick the same 4-digit code.
    return hashlib.sha256(f"{transaction_ref}:{otp}".encode()).hexdigest()


def otp_expiry(minutes: int = 5):
    return datetime.utcnow() + timedelta(minutes=minutes)


def constant_time_eq(a: str, b: str) -> bool:
    return secrets.compare_digest(a, b)
