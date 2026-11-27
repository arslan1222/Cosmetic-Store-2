"""
Loads the trained fraud model once per process and exposes predict_fraud(...),
used by the checkout flow.

The model scores the *payment-shaped* features it was trained on (type, amount,
sender/receiver balances and the bookkeeping errors derived from them). The
behavioural signals -- account age, failed logins, order velocity -- are judged
by the explainable rule layer in risk_rules.py, which runs next to this model.
"""
import json
import os
import threading

import joblib
import pandas as pd

from app.ml.train_model import FEATURE_COLUMNS, MODEL_DIR, engineer_features

_lock = threading.Lock()
_model = None
_encoder = None


def _paths():
    return (
        os.path.join(MODEL_DIR, "fraud_model.joblib"),
        os.path.join(MODEL_DIR, "type_encoder.joblib"),
        os.path.join(MODEL_DIR, "metrics.json"),
    )


def get_metrics():
    path = _paths()[2]
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return None


def is_model_trained() -> bool:
    """True only if a model exists AND was trained with the current feature set.
    A model left over from an older version is reported as not trained, so
    checkout falls back to rules-only screening instead of crashing."""
    model_path, encoder_path, _ = _paths()
    if not (os.path.exists(model_path) and os.path.exists(encoder_path)):
        return False
    metrics = get_metrics()
    return bool(metrics) and metrics.get("feature_columns") == FEATURE_COLUMNS


def _load():
    global _model, _encoder
    with _lock:
        if _model is not None:
            return
        if not is_model_trained():
            raise RuntimeError(
                "Fraud model is missing or out of date. Train it with:\n"
                "    python -m app.ml.train_model\n"
                "from the cosmostore_backend folder."
            )
        model_path, encoder_path, _ = _paths()
        _model = joblib.load(model_path)
        _encoder = joblib.load(encoder_path)


def model_version() -> str:
    m = get_metrics() or {}
    return f"rf-{m.get('dataset', 'unknown')}"


def predict_fraud(
    transaction_type: str,
    amount: float,
    old_balance_org: float,
    new_balance_org: float,
    old_balance_dest: float,
    new_balance_dest: float,
    **_ignored,  # behavioural args are handled by risk_rules, accepted for compatibility
) -> dict:
    """Returns {"fraud_probability": 0..1, "is_flagged": bool, "model_version": str}."""
    _load()

    if transaction_type not in set(_encoder.classes_):
        transaction_type = "PAYMENT"  # unseen type -> the most ordinary one, never crash checkout

    raw = pd.DataFrame([{
        "type": transaction_type,
        "amount": amount,
        "oldbalanceOrg": old_balance_org,
        "newbalanceOrig": new_balance_org,
        "oldbalanceDest": old_balance_dest,
        "newbalanceDest": new_balance_dest,
    }])
    features = engineer_features(raw, _encoder)
    proba = float(_model.predict_proba(features)[0][1])

    from flask import current_app
    threshold = current_app.config.get("FRAUD_HOLD_THRESHOLD", 0.55)

    return {
        "fraud_probability": proba,
        "is_flagged": proba >= threshold,
        "model_version": model_version(),
    }
