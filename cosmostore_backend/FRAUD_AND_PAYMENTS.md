# CosmoStore backend: fraud detection and card payments

## 1. Train the fraud model on the real dataset

The repo ships a **demo model** trained on synthetic data (the admin dashboard says so). Train the real one:

1. Download the Kaggle *Online Payment Fraud Detection* (PaySim) CSV
   (https://www.kaggle.com/datasets/jainilcoder/online-payment-fraud-detection).
2. Save it as `cosmostore_backend/app/ml/data/online_payment_fraud.csv`
3. From `cosmostore_backend/`:  `python -m app.ml.train_model`
   (needs ~4 GB RAM; takes a few minutes. Use `--legit-per-fraud 10` on a small machine.)
4. Check the verdicts it gives on typical orders:  `python scripts/probe_fraud_model.py`
5. Pick `FRAUD_HOLD_THRESHOLD` from the table on Admin > Model metrics, commit the new files in
   `app/ml/saved_model/`, redeploy.

The model sees only genuine PaySim columns (type, amount, balances and the balance-bookkeeping errors).
Behavioural signals (account age, order velocity, failed logins, watchlist) are judged by the rule layer
(`app/ml/risk_rules.py`), and every flagged order stores the reasons for the admin to read.
Honest limitation for the report: a shop has no wallet balances, so checkout feeds the model a
spending-capacity *proxy* derived from the customer's history (`_simulate_balances` in `routes/orders.py`).

## 2. Pakistani card payments (Safepay)

No keys = **demo mode** (a labelled demo card form; nothing is charged). To use a real sandbox:

1. Create a Safepay merchant account and take the sandbox keys from the dashboard.
2. Set these on the backend (Render > Environment):

| Variable | Value |
|---|---|
| `SAFEPAY_API_KEY` | your Safepay API key |
| `SAFEPAY_SECRET_KEY` | your Safepay shared secret (verifies the signed redirect) |
| `SAFEPAY_WEBHOOK_SECRET` | webhook secret (optional second confirmation) |
| `SAFEPAY_ENV` | `sandbox` (use `production` when live) |
| `BACKEND_PUBLIC_URL` | e.g. `https://cosmetic-store-2.onrender.com` |
| `FRONTEND_URL` | your frontend URL |

3. In Safepay's dashboard add a webhook to `<BACKEND_PUBLIC_URL>/api/payments/card/webhook`.

Cards are entered on Safepay's own page; this server never sees card numbers.
Confirm in the sandbox that the signature format matches your account's API version before going live.

## 3. Other settings (environment variables)

`SALES_TAX_RATE` (e.g. `0.18`), `FREE_SHIPPING_THRESHOLD`, `SHIPPING_FEE`, `FRAUD_HOLD_THRESHOLD`, and the rule limits
`FRAUD_HIGH_VALUE_PKR`, `FRAUD_VELOCITY_ORDERS_24H`, `FRAUD_REPEAT_FLAG_LIMIT`, ... (see `app/config.py`).

New tables/columns are added automatically at start-up (`app/schema_upgrade.py`).
