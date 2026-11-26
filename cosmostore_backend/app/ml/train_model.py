"""
Trains the Fraud Detection model for CosmoStore.

Dataset:
  Preferred: app/ml/data/online_payment_fraud.csv
             (the real Kaggle "Online Payment Fraud Detection" dataset,
              https://www.kaggle.com/datasets/jainilcoder/online-payment-fraud-detection,
              ~6.3M rows: step, type, amount, nameOrig, oldbalanceOrg,
              newbalanceOrig, nameDest, oldbalanceDest, newbalanceDest,
              isFraud, isFlaggedFraud)
  Fallback:  a synthetic dataset generated locally with the same schema and
             statistical fraud patterns (see dataset_generator.py), used only
             when the real CSV is not present (e.g. no internet/Kaggle access).

Run:
    python -m app.ml.train_model
"""
import os
import json
import time

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, confusion_matrix, classification_report,
)

HERE = os.path.dirname(__file__)
DATA_DIR = os.path.join(HERE, "data")
REAL_CSV = os.path.join(DATA_DIR, "online_payment_fraud.csv")
SYNTHETIC_CSV = os.path.join(DATA_DIR, "synthetic_online_payment_fraud.csv")
MODEL_DIR = os.path.join(HERE, "saved_model")

FEATURE_COLUMNS = [
    "type_encoded", "amount", "oldbalanceOrg", "newbalanceOrig",
    "oldbalanceDest", "newbalanceDest", "balance_diff_org", "balance_diff_dest",
    "account_age_days", "failed_login_attempts", "orders_last_24h",
]


def load_raw_dataframe() -> pd.DataFrame:
    if os.path.exists(REAL_CSV):
        print(f"Loading REAL Kaggle dataset from {REAL_CSV} ...")
        df = pd.read_csv(REAL_CSV)
        # The Kaggle dataset doesn't ship behavioural columns used by our
        # e-commerce checkout (account age, failed logins, order velocity).
        # We simulate realistic values correlated with isFraud so the model
        # learns to use them the same way it will see them at inference time.
        rng = np.random.default_rng(42)
        n = len(df)
        if "account_age_days" not in df.columns:
            df["account_age_days"] = np.where(
                df["isFraud"] == 1,
                rng.integers(0, 30, size=n),
                rng.integers(30, 2000, size=n),
            )
        if "failed_login_attempts" not in df.columns:
            df["failed_login_attempts"] = np.where(
                df["isFraud"] == 1,
                rng.choice([1, 2, 3, 4, 5], size=n),
                rng.choice([0, 0, 0, 1, 2], size=n),
            )
        if "orders_last_24h" not in df.columns:
            df["orders_last_24h"] = np.where(
                df["isFraud"] == 1,
                rng.choice([3, 4, 5, 6, 8], size=n),
                rng.choice([0, 1, 1, 2, 3], size=n),
            )
    else:
        print("Real Kaggle CSV not found -> generating synthetic dataset instead.")
        print(f"(Place the real file at {REAL_CSV} to train on actual Kaggle data.)")
        from app.ml.dataset_generator import generate_dataset
        os.makedirs(DATA_DIR, exist_ok=True)
        df = generate_dataset(n_rows=200_000)
        df.to_csv(SYNTHETIC_CSV, index=False)

    return df


def build_features(df: pd.DataFrame, encoder: LabelEncoder = None, fit_encoder: bool = True):
    df = df.copy()

    if encoder is None:
        encoder = LabelEncoder()
    if fit_encoder:
        df["type_encoded"] = encoder.fit_transform(df["type"])
    else:
        df["type_encoded"] = encoder.transform(df["type"])

    df["balance_diff_org"] = df["oldbalanceOrg"] - df["newbalanceOrig"]
    df["balance_diff_dest"] = df["newbalanceDest"] - df["oldbalanceDest"]

    for col in ["account_age_days", "failed_login_attempts", "orders_last_24h"]:
        if col not in df.columns:
            df[col] = 0

    X = df[FEATURE_COLUMNS]
    y = df["isFraud"] if "isFraud" in df.columns else None
    return X, y, encoder


def train():
    os.makedirs(MODEL_DIR, exist_ok=True)
    start = time.time()

    df = load_raw_dataframe()
    print(f"Dataset loaded: {len(df):,} rows, fraud rate = {df['isFraud'].mean()*100:.4f}%")

    X, y, encoder = build_features(df, fit_encoder=True)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    print("Training RandomForestClassifier ...")
    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=16,
        min_samples_leaf=2,
        class_weight="balanced_subsample",  # fraud is a rare class
        n_jobs=-1,
        random_state=42,
    )
    model.fit(X_train_scaled, y_train)

    y_pred = model.predict(X_test_scaled)
    y_proba = model.predict_proba(X_test_scaled)[:, 1]

    metrics = {
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(y_test, y_pred, zero_division=0),
        "recall": recall_score(y_test, y_pred, zero_division=0),
        "f1_score": f1_score(y_test, y_pred, zero_division=0),
        "roc_auc": roc_auc_score(y_test, y_proba),
        "confusion_matrix": confusion_matrix(y_test, y_pred).tolist(),
        "trained_rows": len(df),
        "training_seconds": round(time.time() - start, 2),
        "feature_columns": FEATURE_COLUMNS,
    }

    print("\n=== Evaluation on held-out test set ===")
    print(classification_report(y_test, y_pred, target_names=["Legitimate", "Fraud"], zero_division=0))
    print("Confusion matrix:\n", metrics["confusion_matrix"])
    print(f"ROC-AUC: {metrics['roc_auc']:.4f}")

    joblib.dump(model, os.path.join(MODEL_DIR, "fraud_model.joblib"))
    joblib.dump(scaler, os.path.join(MODEL_DIR, "scaler.joblib"))
    joblib.dump(encoder, os.path.join(MODEL_DIR, "type_encoder.joblib"))
    with open(os.path.join(MODEL_DIR, "metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2)

    # Feature importance plot (used in FYP report / admin dashboard)
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        importances = model.feature_importances_
        order = np.argsort(importances)[::-1]
        plt.figure(figsize=(9, 5))
        plt.bar(range(len(FEATURE_COLUMNS)), importances[order])
        plt.xticks(range(len(FEATURE_COLUMNS)), [FEATURE_COLUMNS[i] for i in order], rotation=45, ha="right")
        plt.title("Fraud Model - Feature Importance (RandomForest)")
        plt.tight_layout()
        plt.savefig(os.path.join(MODEL_DIR, "feature_importance.png"))
        plt.close()
        print("Saved feature_importance.png")
    except Exception as e:
        print(f"(Skipping feature importance plot: {e})")

    print(f"\nModel + scaler + encoder saved to {MODEL_DIR}")
    print(f"Total time: {metrics['training_seconds']}s")
    return metrics


if __name__ == "__main__":
    train()
