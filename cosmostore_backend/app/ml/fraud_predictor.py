"""
Loads the trained fraud-detection model once per process and exposes a
simple predict_fraud(...) function used by the checkout flow.
"""
import os
import json
import threading

import joblib
import pandas as pd

from app.ml.train_model import FEATURE_COLUMNS, MODEL_DIR

_lock = threading.Lock()
_model = None
_scaler = None
_encoder = None
_metrics = None


def _paths():
    return (
        os.path.join(MODEL_DIR, "fraud_model.joblib"),
        os.path.join(MODEL_DIR, "scaler.joblib"),
        os.path.join(MODEL_DIR, "type_encoder.joblib"),
        os.path.join(MODEL_DIR, "metrics.json"),
    )


def is_model_trained() -> bool:
    model_path, scaler_path, encoder_path, _ = _paths()
    return os.path.exists(model_path) and os.path.exists(scaler_path) and os.path.exists(encoder_path)


def _load():
    global _model, _scaler, _encoder, _metrics
    with _lock:
        if _model is not None:
            return
        model_path, scaler_path, encoder_path, metrics_path = _paths()
        if not is_model_trained():
            raise RuntimeError(
                "Fraud model is not trained yet. Run:\n"
                "    python -m app.ml.train_model\n"
                "from the project root before starting the server."
            )
        _model = joblib.load(model_path)
        _scaler = joblib.load(scaler_path)
        _encoder = joblib.load(encoder_path)
        if os.path.exists(metrics_path):
            with open(metrics_path) as f:
                _metrics = json.load(f)


def get_metrics():
    if _metrics is None and os.path.exists(_paths()[3]):
        with open(_paths()[3]) as f:
            return json.load(f)
    return _metrics


def _safe_encode_type(transaction_type: str) -> int:
    try:
        return int(_encoder.transform([transaction_type])[0])
    except ValueError:
        # Unseen category at inference time -> map to the most common class (0)
        return 0


def predict_fraud(
    transaction_type: str,
    amount: float,
    old_balance_org: float,
    new_balance_org: float,
    old_balance_dest: float,
    new_balance_dest: float,
    account_age_days: int = 0,
    failed_login_attempts: int = 0,
    orders_last_24h: int = 0,
) -> dict:
    """
    Returns:
        {
          "fraud_probability": float 0..1,
          "is_flagged": bool,
          "model_version": str,
        }
    """
    _load()

    type_encoded = _safe_encode_type(transaction_type)
    balance_diff_org = old_balance_org - new_balance_org
    balance_diff_dest = new_balance_dest - old_balance_dest

    row = pd.DataFrame([[
        type_encoded, amount, old_balance_org, new_balance_org,
        old_balance_dest, new_balance_dest, balance_diff_org, balance_diff_dest,
        account_age_days, failed_login_attempts, orders_last_24h,
    ]], columns=FEATURE_COLUMNS)

    row_scaled = _scaler.transform(row)
    proba = float(_model.predict_proba(row_scaled)[0][1])

    from flask import current_app
    threshold = current_app.config.get("FRAUD_HOLD_THRESHOLD", 0.55) if current_app else 0.55

    return {
        "fraud_probability": proba,
        "is_flagged": proba >= threshold,
        "model_version": "rf_v1",
    }
