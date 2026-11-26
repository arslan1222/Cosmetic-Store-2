"""
Explainable rule layer that runs next to the ML fraud model.

Why it exists
-------------
* The model only sees amount/balance/behaviour numbers and gives a single
  probability -- an admin reviewing a held order can't tell *why* it was held.
  Every rule here returns a human-readable factor that is stored with the
  order and shown in the review centre.
* Cash-on-delivery orders have no meaningful balance features, so the model
  is skipped for them. Rules still apply, so COD is no longer an unscreened
  blind spot.
* A customer an admin put on the watchlist is always held, whatever the
  model says.

All thresholds can be overridden from Flask config / environment.
"""
from datetime import datetime

DEFAULTS = {
    "FRAUD_HIGH_VALUE_PKR": 25000.0,        # single order this large is notable
    "FRAUD_NEW_ACCOUNT_DAYS": 3,            # "new account" window
    "FRAUD_NEW_ACCOUNT_AMOUNT_PKR": 15000.0,
    "FRAUD_COD_AMOUNT_PKR": 10000.0,        # large COD from a young account
    "FRAUD_COD_ACCOUNT_DAYS": 7,
    "FRAUD_VELOCITY_ORDERS_24H": 3,         # this many orders in 24h (incl. this one)
    "FRAUD_REPEAT_FLAG_LIMIT": 2,           # prior flagged orders before it counts
    "FRAUD_FAILED_LOGINS": 3,
}


def _cfg(config, key):
    value = config.get(key) if config is not None else None
    return DEFAULTS[key] if value is None else type(DEFAULTS[key])(value)


def effective_account_age_days(user):
    """Real age of the account.

    users.account_age_days is only set once at registration and never
    updated, so for real customers it stays 0 forever. Derive the age from
    created_at and keep whichever is larger (seeded demo users carry an
    explicit age).
    """
    stored = user.account_age_days or 0
    if user.created_at:
        stored = max(stored, (datetime.utcnow() - user.created_at).days)
    return stored


def _factor(code, label, severity):
    return {"code": code, "label": label, "severity": severity}


def evaluate_rules(user, amount, payment_method, orders_last_24h, account_age_days, config=None):
    """Returns a list of {code, label, severity} for every rule that fired."""
    f = []

    if user.is_watchlisted:
        f.append(_factor("WATCHLISTED", "Customer is on the admin fraud watchlist", "high"))

    limit = _cfg(config, "FRAUD_REPEAT_FLAG_LIMIT")
    if (user.total_flagged_orders or 0) >= limit:
        f.append(_factor(
            "REPEAT_FLAGS",
            f"{user.total_flagged_orders} earlier orders from this customer were flagged",
            "high",
        ))

    velocity = _cfg(config, "FRAUD_VELOCITY_ORDERS_24H")
    if orders_last_24h >= velocity:
        f.append(_factor("VELOCITY", f"{orders_last_24h} orders placed in the last 24 hours", "high"))

    new_days = _cfg(config, "FRAUD_NEW_ACCOUNT_DAYS")
    if account_age_days < new_days and amount >= _cfg(config, "FRAUD_NEW_ACCOUNT_AMOUNT_PKR"):
        f.append(_factor(
            "NEW_ACCOUNT_HIGH_VALUE",
            f"Account is {account_age_days} day(s) old and the order is PKR {amount:,.0f}",
            "medium",
        ))

    if amount >= _cfg(config, "FRAUD_HIGH_VALUE_PKR"):
        f.append(_factor("HIGH_VALUE", f"High order value (PKR {amount:,.0f})", "medium"))

    if (
        payment_method == "cod"
        and amount >= _cfg(config, "FRAUD_COD_AMOUNT_PKR")
        and account_age_days < _cfg(config, "FRAUD_COD_ACCOUNT_DAYS")
    ):
        f.append(_factor(
            "COD_YOUNG_ACCOUNT",
            "Large cash-on-delivery order from a young account",
            "medium",
        ))

    if (user.failed_login_attempts or 0) >= _cfg(config, "FRAUD_FAILED_LOGINS"):
        f.append(_factor(
            "FAILED_LOGINS",
            f"{user.failed_login_attempts} failed login attempts before this order",
            "medium",
        ))

    return f


def combine(ml_probability, ml_flagged, ml_ran, factors, threshold):
    """Merge model + rules into the final verdict.

    The order is held when the model flags it, OR any high-severity rule
    fired, OR two or more medium rules fired together. A single medium rule
    (e.g. just a big order from an established customer) is shown to the
    admin as context but does not hold the order on its own.
    """
    factors = list(factors)

    if ml_ran and ml_flagged:
        factors.insert(0, _factor(
            "MODEL_HIGH_PROBABILITY",
            f"Fraud model probability {ml_probability * 100:.0f}% (hold threshold {threshold * 100:.0f}%)",
            "high",
        ))
    elif ml_ran and ml_probability >= 0.30:
        factors.append(_factor(
            "MODEL_ELEVATED",
            f"Fraud model probability is elevated ({ml_probability * 100:.0f}%) but below the hold threshold",
            "low",
        ))

    high = sum(1 for x in factors if x["severity"] == "high")
    medium = sum(1 for x in factors if x["severity"] == "medium")

    # Rules alone hold an order on any high-severity rule, or two mediums.
    rule_high = sum(
        1 for x in factors if x["severity"] == "high" and x["code"] != "MODEL_HIGH_PROBABILITY"
    )
    rules_flagged = rule_high >= 1 or medium >= 2
    model_flagged = bool(ml_ran and ml_flagged)

    is_flagged = model_flagged or rules_flagged

    if model_flagged and rules_flagged:
        source = "model+rules"
    elif model_flagged:
        source = "model"
    elif rules_flagged:
        source = "rules"
    else:
        source = None

    if is_flagged:
        # A held order is at least medium; strong or multiple signals make it high.
        level = "high" if (ml_probability >= 0.80 or high >= 2) else "medium"
    else:
        level = "medium" if (ml_probability >= 0.30 or medium >= 1) else "low"

    return {
        "is_flagged": is_flagged,
        "risk_level": level,
        "flag_source": source,
        "factors": factors,
    }
