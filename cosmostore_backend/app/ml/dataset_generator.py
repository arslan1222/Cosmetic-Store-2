"""
Generates a synthetic transaction dataset that mirrors the schema of the
Kaggle "Online Payment Fraud Detection" dataset (PaySim-based):

    step, type, amount, nameOrig, oldbalanceOrg, newbalanceOrig,
    nameDest, oldbalanceDest, newbalanceDest, isFraud, isFlaggedFraud

USE THIS ONLY AS A FALLBACK. For the real FYP submission, download the
actual dataset from:
https://www.kaggle.com/datasets/jainilcoder/online-payment-fraud-detection
and place it at app/ml/data/online_payment_fraud.csv - train_model.py will
automatically prefer that file if it exists, and only fall back to this
generator if it's missing (e.g. for local dev/demo without Kaggle access).

The generator reproduces the well-known statistical patterns of the real
dataset so a model trained on it behaves sensibly for demo purposes:
  - Fraud is heavily concentrated in TRANSFER and CASH_OUT transaction types
  - Fraudulent transactions often empty the origin balance completely
  - Fraud rate is very low overall (~0.1%), mirroring real-world imbalance
"""
import os
import numpy as np
import pandas as pd

RANDOM_SEED = 42
TRANSACTION_TYPES = ["PAYMENT", "TRANSFER", "CASH_OUT", "CASH_IN", "DEBIT"]
# Realistic-ish type distribution seen in the original PaySim dataset
TYPE_WEIGHTS = [0.34, 0.08, 0.35, 0.22, 0.01]


def generate_dataset(n_rows: int = 200_000, fraud_rate: float = 0.0013, seed: int = RANDOM_SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    n_fraud = max(1, int(n_rows * fraud_rate))
    n_legit = n_rows - n_fraud

    rows = []

    # ---------------- Legitimate transactions ----------------
    types_legit = rng.choice(TRANSACTION_TYPES, size=n_legit, p=TYPE_WEIGHTS)
    for i in range(n_legit):
        ttype = types_legit[i]
        amount = float(np.round(rng.lognormal(mean=8.5, sigma=1.3), 2))
        amount = min(amount, 500000)

        old_org = float(np.round(rng.uniform(0, 300000), 2))
        # legit users usually have enough balance and it decreases sensibly
        if ttype in ("TRANSFER", "CASH_OUT", "PAYMENT", "DEBIT"):
            new_org = max(0.0, round(old_org - amount, 2)) if old_org >= amount else old_org
        else:  # CASH_IN
            new_org = round(old_org + amount, 2)

        old_dest = float(np.round(rng.uniform(0, 300000), 2))
        new_dest = round(old_dest + amount, 2) if ttype in ("TRANSFER", "CASH_IN") else old_dest

        rows.append({
            "step": int(rng.integers(1, 744)),
            "type": ttype,
            "amount": amount,
            "oldbalanceOrg": old_org,
            "newbalanceOrig": new_org,
            "oldbalanceDest": old_dest,
            "newbalanceDest": new_dest,
            "account_age_days": int(rng.integers(30, 2000)),
            "failed_login_attempts": int(rng.choice([0, 0, 0, 0, 1, 2], p=[0.55, 0.2, 0.1, 0.1, 0.03, 0.02])),
            "orders_last_24h": int(rng.choice([0, 1, 1, 2, 3], p=[0.4, 0.3, 0.15, 0.1, 0.05])),
            "isFraud": 0,
        })

    # ---------------- Fraudulent transactions ----------------
    # Real-world pattern: fraud concentrates in TRANSFER / CASH_OUT and
    # frequently drains the account (newbalanceOrig -> 0), uses fresh
    # accounts, and shows unusually high amounts relative to normal traffic.
    fraud_types = rng.choice(["TRANSFER", "CASH_OUT"], size=n_fraud, p=[0.5, 0.5])
    for i in range(n_fraud):
        ttype = fraud_types[i]
        amount = float(np.round(rng.lognormal(mean=10.5, sigma=1.1), 2))
        amount = min(amount, 900000)

        old_org = float(np.round(rng.uniform(amount * 0.9, amount * 1.3), 2))
        new_org = 0.0  # classic fraud signature: account drained

        old_dest = float(np.round(rng.uniform(0, 5000), 2))  # dest often near-empty/new
        new_dest = round(old_dest + amount, 2)

        rows.append({
            "step": int(rng.integers(1, 744)),
            "type": ttype,
            "amount": amount,
            "oldbalanceOrg": old_org,
            "newbalanceOrig": new_org,
            "oldbalanceDest": old_dest,
            "newbalanceDest": new_dest,
            "account_age_days": int(rng.integers(0, 30)),          # new/hijacked accounts
            "failed_login_attempts": int(rng.choice([1, 2, 3, 4, 5], p=[0.2, 0.25, 0.25, 0.2, 0.1])),
            "orders_last_24h": int(rng.choice([3, 4, 5, 6, 8], p=[0.2, 0.25, 0.25, 0.2, 0.1])),
            "isFraud": 1,
        })

    df = pd.DataFrame(rows)
    df = df.sample(frac=1, random_state=seed).reset_index(drop=True)  # shuffle
    return df


def save_dataset(path: str, n_rows: int = 200_000):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    df = generate_dataset(n_rows=n_rows)
    df.to_csv(path, index=False)
    print(f"Synthetic dataset saved to {path} ({len(df)} rows, "
          f"{df['isFraud'].sum()} fraud / {df['isFraud'].mean()*100:.3f}%)")
    return df


if __name__ == "__main__":
    here = os.path.dirname(__file__)
    out_path = os.path.join(here, "data", "synthetic_online_payment_fraud.csv")
    save_dataset(out_path, n_rows=200_000)
