"""
Trains the Fraud Detection model for CosmoStore.

Dataset (as in the FYP proposal)
--------------------------------
Kaggle "Online Payment Fraud Detection" (PaySim), ~6.3 million rows:
    https://www.kaggle.com/datasets/jainilcoder/online-payment-fraud-detection
Download it and save it as:
    cosmostore_backend/app/ml/data/online_payment_fraud.csv
Columns used: type, amount, oldbalanceOrg, newbalanceOrig, oldbalanceDest,
newbalanceDest, isFraud.  Deliberately NOT used:
    nameOrig / nameDest  -> account identifiers, would let the model memorise accounts
    isFlaggedFraud       -> the output of PaySim's own simple rule, i.e. a label leak
    step                 -> simulation clock, not a property of a real checkout

If the CSV is missing, a small SYNTHETIC dataset is generated so the project
still runs. A model trained on it is marked `is_demo_model: true` in
metrics.json and the admin dashboard shows a warning. Do not quote its
numbers in the report -- retrain on the real file first.

Method
------
1. Stratified 80/20 split of the FULL dataset (fraud is ~0.13%, so stratify).
2. The held-out 20% keeps the natural class balance -> the reported metrics are
   what the model would achieve on realistic traffic.
3. Only the TRAINING part is under-sampled (all fraud rows + N legit rows per
   fraud row) so training stays fast on a laptop.
4. A Decision Tree and a Random Forest are both trained and compared on the same
   test set (the proposal names both). The Random Forest is the deployed model.
5. Behavioural signals (account age, failed logins, order velocity) are NOT fed
   to the model -- PaySim has no such columns, and inventing them from the
   label would be circular. They are handled by the explainable rule layer
   (risk_rules.py), which runs next to the model at checkout.

Run (from cosmostore_backend/):
    python -m app.ml.train_model
    python -m app.ml.train_model --csv path/to/file.csv --legit-per-fraud 20
"""
import argparse
import json
import os
import time
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score, average_precision_score, classification_report, confusion_matrix,
    f1_score, precision_score, recall_score, roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.tree import DecisionTreeClassifier

HERE = os.path.dirname(__file__)
DATA_DIR = os.path.join(HERE, "data")
REAL_CSV = os.path.join(DATA_DIR, "online_payment_fraud.csv")
MODEL_DIR = os.path.join(HERE, "saved_model")

RAW_COLUMNS = ["type", "amount", "oldbalanceOrg", "newbalanceOrig", "oldbalanceDest", "newbalanceDest", "isFraud"]

FEATURE_COLUMNS = [
    "type_encoded", "amount",
    "oldbalanceOrg", "newbalanceOrig", "oldbalanceDest", "newbalanceDest",
    "balance_diff_org", "balance_diff_dest",
    # Bookkeeping errors: in a clean transaction the balances add up exactly.
    # These are the strongest known signals in PaySim.
    "error_balance_org", "error_balance_dest",
]

REPORT_THRESHOLDS = (0.30, 0.50, 0.55, 0.70, 0.90)


def engineer_features(df: pd.DataFrame, encoder: LabelEncoder) -> pd.DataFrame:
    """Single source of truth for feature construction -- used by training AND by
    the live predictor, so the two can never drift apart."""
    out = pd.DataFrame(index=df.index)
    out["type_encoded"] = encoder.transform(df["type"])
    out["amount"] = df["amount"]
    out["oldbalanceOrg"] = df["oldbalanceOrg"]
    out["newbalanceOrig"] = df["newbalanceOrig"]
    out["oldbalanceDest"] = df["oldbalanceDest"]
    out["newbalanceDest"] = df["newbalanceDest"]
    out["balance_diff_org"] = df["oldbalanceOrg"] - df["newbalanceOrig"]
    out["balance_diff_dest"] = df["newbalanceDest"] - df["oldbalanceDest"]
    out["error_balance_org"] = df["newbalanceOrig"] + df["amount"] - df["oldbalanceOrg"]
    out["error_balance_dest"] = df["oldbalanceDest"] + df["amount"] - df["newbalanceDest"]
    return out[FEATURE_COLUMNS]


def load_dataset(csv_path: str = None):
    """Returns (dataframe, provenance dict)."""
    path = csv_path or REAL_CSV
    if os.path.exists(path):
        print(f"Loading REAL dataset from {path} ...")
        dtypes = {c: "float32" for c in RAW_COLUMNS if c not in ("type", "isFraud")}
        dtypes["isFraud"] = "int8"
        df = pd.read_csv(path, usecols=RAW_COLUMNS, dtype=dtypes)
        return df, {"name": "kaggle-paysim", "path": os.path.abspath(path), "is_demo": False}

    print("Real dataset not found -> generating a SYNTHETIC demo dataset.")
    print(f"(Put the Kaggle CSV at {REAL_CSV} to train a real model.)")
    from app.ml.dataset_generator import generate_dataset
    df = generate_dataset(n_rows=300_000)  # kept in memory only; nothing large is written to disk
    return df[RAW_COLUMNS], {"name": "synthetic-demo", "path": "(generated in memory)", "is_demo": True}


def _evaluate(model, X_test, y_test) -> dict:
    proba = model.predict_proba(X_test)[:, 1]
    pred = (model.predict_proba(X_test)[:, 1] >= 0.5).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_test, pred, labels=[0, 1]).ravel()
    by_threshold = {}
    for t in REPORT_THRESHOLDS:
        p = (proba >= t).astype(int)
        by_threshold[f"{t:.2f}"] = {
            "precision": float(precision_score(y_test, p, zero_division=0)),
            "recall": float(recall_score(y_test, p, zero_division=0)),
            "flagged": int(p.sum()),
        }
    return {
        "accuracy": float(accuracy_score(y_test, pred)),
        "precision": float(precision_score(y_test, pred, zero_division=0)),
        "recall": float(recall_score(y_test, pred, zero_division=0)),
        "f1_score": float(f1_score(y_test, pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_test, proba)),
        # Average precision (area under the precision-recall curve) is the honest
        # headline number for data this imbalanced; accuracy alone is ~99.9% for a
        # model that never flags anything.
        "pr_auc": float(average_precision_score(y_test, proba)),
        "confusion_matrix": [[int(tn), int(fp)], [int(fn), int(tp)]],
        "by_threshold": by_threshold,
    }


def train(csv_path: str = None, legit_per_fraud: int = 20, seed: int = 42):
    os.makedirs(MODEL_DIR, exist_ok=True)
    start = time.time()

    df, provenance = load_dataset(csv_path)
    n_rows, n_fraud = len(df), int(df["isFraud"].sum())
    print(f"Dataset: {n_rows:,} rows, {n_fraud:,} fraud ({n_fraud / n_rows * 100:.4f}%)")

    encoder = LabelEncoder().fit(df["type"])
    X = engineer_features(df, encoder)
    y = df["isFraud"].astype(int)
    del df

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=seed, stratify=y
    )

    # Under-sample the legitimate class in TRAINING only.
    rng = np.random.default_rng(seed)
    fraud_idx = np.flatnonzero(y_train.values == 1)
    legit_idx = np.flatnonzero(y_train.values == 0)
    keep_legit = min(len(legit_idx), max(1, len(fraud_idx)) * legit_per_fraud)
    chosen = np.concatenate([fraud_idx, rng.choice(legit_idx, size=keep_legit, replace=False)])
    rng.shuffle(chosen)
    X_fit, y_fit = X_train.iloc[chosen], y_train.iloc[chosen]
    print(f"Training on {len(X_fit):,} rows ({len(fraud_idx):,} fraud + {keep_legit:,} legit); "
          f"testing on {len(X_test):,} untouched rows ({int(y_test.sum()):,} fraud).")

    print("Training DecisionTreeClassifier (baseline) ...")
    tree = DecisionTreeClassifier(max_depth=12, min_samples_leaf=5, random_state=seed).fit(X_fit, y_fit)
    print("Training RandomForestClassifier (deployed) ...")
    forest = RandomForestClassifier(
        n_estimators=200, max_depth=18, min_samples_leaf=3, n_jobs=-1, random_state=seed,
    ).fit(X_fit, y_fit)

    comparison = {"decision_tree": _evaluate(tree, X_test, y_test),
                  "random_forest": _evaluate(forest, X_test, y_test)}
    metrics = dict(comparison["random_forest"])
    metrics.update({
        "deployed_model": "RandomForestClassifier",
        "model_comparison": comparison,
        "dataset": provenance["name"],
        "is_demo_model": provenance["is_demo"],
        "dataset_rows": int(n_rows),
        "dataset_fraud_rows": n_fraud,
        "train_rows": int(len(X_fit)),
        "test_rows": int(len(X_test)),
        "test_fraud_rows": int(y_test.sum()),
        "legit_per_fraud_in_training": legit_per_fraud,
        "feature_columns": FEATURE_COLUMNS,
        "trained_rows": int(n_rows),  # kept for older admin pages
        "training_seconds": round(time.time() - start, 2),
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "sklearn_version": sklearn.__version__,
    })

    print("\n=== Held-out test set (natural class balance) ===")
    for name, m in comparison.items():
        cm = m["confusion_matrix"]
        print(f"{name:14} precision={m['precision']:.4f} recall={m['recall']:.4f} "
              f"f1={m['f1_score']:.4f} roc_auc={m['roc_auc']:.4f} pr_auc={m['pr_auc']:.4f} "
              f"| TN={cm[0][0]:,} FP={cm[0][1]:,} FN={cm[1][0]:,} TP={cm[1][1]:,}")
    if provenance["is_demo"]:
        print("\n!! DEMO MODEL: trained on synthetic data. Do not report these numbers. !!")

    joblib.dump(forest, os.path.join(MODEL_DIR, "fraud_model.joblib"), compress=3)
    joblib.dump(encoder, os.path.join(MODEL_DIR, "type_encoder.joblib"))
    with open(os.path.join(MODEL_DIR, "metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2)
    # The old pipeline also saved a feature scaler; trees don't need one.
    stale = os.path.join(MODEL_DIR, "scaler.joblib")
    if os.path.exists(stale):
        os.remove(stale)

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        imp = forest.feature_importances_
        order = np.argsort(imp)[::-1]
        plt.figure(figsize=(9, 5))
        plt.bar(range(len(FEATURE_COLUMNS)), imp[order])
        plt.xticks(range(len(FEATURE_COLUMNS)), [FEATURE_COLUMNS[i] for i in order], rotation=45, ha="right")
        plt.title("Fraud model - feature importance (Random Forest)")
        plt.tight_layout()
        plt.savefig(os.path.join(MODEL_DIR, "feature_importance.png"))
        plt.close()
    except Exception as e:  # plotting is optional
        print(f"(skipped feature importance plot: {e})")

    print(f"\nSaved model, encoder and metrics to {MODEL_DIR}  ({metrics['training_seconds']}s)")
    return metrics


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Train the CosmoStore fraud model")
    ap.add_argument("--csv", help="path to the Kaggle PaySim CSV (default: app/ml/data/online_payment_fraud.csv)")
    ap.add_argument("--legit-per-fraud", type=int, default=20,
                    help="legitimate training rows kept per fraud row (default 20)")
    args = ap.parse_args()
    train(args.csv, args.legit_per_fraud)
