"""
Prints how the CURRENT trained model + rule layer judge a set of typical orders.
Run it after every retraining (especially after training on the real Kaggle
file) to see whether the verdicts make sense, and to pick FRAUD_HOLD_THRESHOLD:

    cd cosmostore_backend
    python scripts/probe_fraud_model.py

Uses a throw-away SQLite file; your real database is not touched.
"""
import os, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import os, itertools
_db = os.path.join(tempfile.mkdtemp(), "probe.db")
os.environ["DATABASE_URL"] = "sqlite:///" + _db
from app.config import Config; Config.SQLALCHEMY_ENGINE_OPTIONS={}
from app import create_app
from app.extensions import db
from app.models import *
from app.routes.orders import _simulate_balances, PAYMENT_TO_TXN_TYPE
from app.ml.fraud_predictor import predict_fraud
from app.ml.risk_rules import evaluate_rules, combine
app=create_app("development"); seq=itertools.count()
with app.app_context():
    def mk(age, prior=0):
        k=next(seq); u=User(full_name="U",email=f"u{k}@x",role=RoleEnum.CUSTOMER,account_age_days=age); u.set_password("x"); db.session.add(u); db.session.flush()
        for i in range(prior): db.session.add(Order(order_number=f"O{k}-{i}",customer_id=u.id,status=OrderStatusEnum.DELIVERED,payment_method=PaymentMethodEnum.CARD,subtotal=3000,grand_total=3000,shipping_address="a",shipping_city="b"))
        db.session.commit(); return u
    cases=[("established 400d, 3 past orders, Rs 2,150 card",mk(400,3),2150,"card"),
           ("established, Rs 8,000 card (within habit)",mk(400,3),8000,"card"),
           ("established, Rs 60,000 card (way above habit)",mk(400,3),60000,"card"),
           ("brand-new account, Rs 2,150 card",mk(0),2150,"card"),
           ("brand-new account, Rs 12,000 card",mk(0),12000,"card"),
           ("brand-new account, Rs 30,000 easypaisa",mk(0),30000,"easypaisa"),
           ("1-month account, Rs 9,000 jazzcash",mk(30),9000,"jazzcash"),
           ("brand-new account, Rs 12,000 COD",mk(0),12000,"cod")]
    print(f"{'scenario':50} {'ML prob':>8}  verdict")
    for name,u,amt,pm in cases:
        if pm=="cod": r={"fraud_probability":0.0,"is_flagged":False}; ran=False
        else:
            o,n,od,nd=_simulate_balances(u,amt); r=predict_fraud(PAYMENT_TO_TXN_TYPE[PaymentMethodEnum(pm)],amt,o,n,od,nd); ran=True
        f=evaluate_rules(u,amt,pm,1,u.account_age_days,app.config)
        v=combine(r["fraud_probability"],r["is_flagged"],ran,f,0.55)
        print(f"{name:50} {r['fraud_probability']:8.3f}  {'HELD ' if v['is_flagged'] else 'ok   '} {v['risk_level']:6} src={v['flag_source']}")
