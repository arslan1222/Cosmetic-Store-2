"""
Synthetic fallback dataset in the PaySim schema -- DEMO USE ONLY.

    type, amount, oldbalanceOrg, newbalanceOrig, oldbalanceDest, newbalanceDest, isFraud

It reproduces the headline patterns of the real PaySim data (fraud only in
TRANSFER / CASH_OUT, often emptying the sender's account, ~0.13% fraud rate)
but, unlike a toy generator, adds overlap so classes are NOT trivially
separable: some fraud looks ordinary and some legitimate withdrawals look
suspicious. Even so it is synthetic: metrics from a model trained on it say
nothing about real-world accuracy. Train on the Kaggle file for that.
"""
import numpy as np
import pandas as pd

TYPES = ["PAYMENT", "TRANSFER", "CASH_OUT", "CASH_IN", "DEBIT"]
TYPE_P = [0.34, 0.08, 0.35, 0.22, 0.01]


def generate_dataset(n_rows: int = 300_000, fraud_rate: float = 0.0013, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    n_fraud = max(10, int(n_rows * fraud_rate))
    n_legit = n_rows - n_fraud

    # ---- legitimate (vectorised) ----
    t = rng.choice(TYPES, size=n_legit, p=TYPE_P)
    amount = np.minimum(rng.lognormal(8.5, 1.3, n_legit), 5e5).round(2)
    old_org = rng.uniform(0, 3e5, n_legit).round(2)
    spends = np.isin(t, ["TRANSFER", "CASH_OUT", "PAYMENT", "DEBIT"])
    enough = old_org >= amount
    new_org = np.where(spends, np.where(enough, old_org - amount, old_org), old_org + amount).round(2)
    old_dest = rng.uniform(0, 3e5, n_legit).round(2)
    new_dest = np.where(np.isin(t, ["TRANSFER", "CASH_IN"]), old_dest + amount, old_dest).round(2)
    legit = pd.DataFrame({"type": t, "amount": amount, "oldbalanceOrg": old_org, "newbalanceOrig": new_org,
                          "oldbalanceDest": old_dest, "newbalanceDest": new_dest, "isFraud": 0})

    # a few genuine "withdraw everything" transactions -> look like fraud but are not
    drain = (legit["type"].isin(["TRANSFER", "CASH_OUT"])) & (rng.random(n_legit) < 0.004)
    legit.loc[drain, "amount"] = legit.loc[drain, "oldbalanceOrg"]
    legit.loc[drain, "newbalanceOrig"] = 0.0

    # ---- fraud ----
    ft = rng.choice(["TRANSFER", "CASH_OUT"], size=n_fraud)
    famount = np.minimum(rng.lognormal(10.2, 1.2, n_fraud), 9e5).round(2)
    f_old = (famount * rng.uniform(1.0, 1.3, n_fraud)).round(2)
    f_new = np.zeros(n_fraud)
    f_od = rng.uniform(0, 8000, n_fraud).round(2)
    f_nd = np.where(ft == "TRANSFER", f_od + famount, 0.0).round(2)  # cash-out leaves dest at 0 in real PaySim
    fraud = pd.DataFrame({"type": ft, "amount": famount, "oldbalanceOrg": f_old, "newbalanceOrig": f_new,
                          "oldbalanceDest": f_od, "newbalanceDest": f_nd, "isFraud": 1})

    # ~25% of fraud is "quiet": smaller, account not emptied -> hard to tell from normal activity
    quiet = rng.random(n_fraud) < 0.25
    fraud.loc[quiet, "amount"] = rng.uniform(500, 30000, quiet.sum()).round(2)
    fraud.loc[quiet, "oldbalanceOrg"] = (fraud.loc[quiet, "amount"] * rng.uniform(1.5, 6, quiet.sum())).round(2)
    fraud.loc[quiet, "newbalanceOrig"] = (fraud.loc[quiet, "oldbalanceOrg"] - fraud.loc[quiet, "amount"]).round(2)

    df = pd.concat([legit, fraud], ignore_index=True)
    return df.sample(frac=1, random_state=seed).reset_index(drop=True)
