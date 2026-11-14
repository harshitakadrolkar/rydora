"""
RYDORA - Predictive Demand Forecasting (SIMULATED DATA)

1. Generates 60 days of simulated hourly ride demand for every city zone.
2. Trains a scikit-learn GradientBoostingRegressor.
3. Evaluates on the last 7 days (predicted vs actual).
4. Forecasts the next 24 hours per zone and writes proactive driver
   positioning recommendations.

Output: ml/output/forecast.json  (read by the Node.js backend)
        ml/output/historical_demand.csv

Run:  python ml/train_demand_model.py
"""
import json
import math
import os
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_DIR = os.path.join(HERE, "output")
ZONES = json.load(open(os.path.join(ROOT, "shared", "zones.json")))

DAYS = 60
TEST_DAYS = 7
RNG = np.random.default_rng(42)

# Hour-of-day demand multipliers per zone type (index 0..23)
PROFILES = {
    "business":    [.15,.08,.05,.05,.08,.2,.5,1.1,1.9,2.0,1.3,1.0,1.1,1.0,.9,1.0,1.3,1.9,2.1,1.5,.9,.6,.4,.25],
    "nightlife":   [.9,.7,.4,.2,.1,.15,.3,.6,.9,.9,.8,.9,1.1,1.0,.9,.9,1.0,1.3,1.6,1.9,2.1,2.2,1.9,1.4],
    "tech":        [.2,.1,.05,.05,.1,.3,.7,1.4,2.2,2.0,1.2,.9,1.0,.9,.8,.9,1.2,1.8,2.2,1.9,1.2,.8,.5,.3],
    "residential": [.2,.1,.05,.05,.15,.4,1.0,1.7,1.8,1.3,.9,.8,.8,.8,.8,.9,1.0,1.3,1.4,1.3,1.1,.8,.5,.3],
    "transit":     [.5,.4,.3,.4,.7,1.1,1.5,1.6,1.5,1.2,1.0,1.0,1.0,1.0,1.0,1.1,1.3,1.5,1.6,1.4,1.2,1.0,.8,.6],
}
WEEKEND = {"business": .55, "nightlife": 1.35, "tech": .5, "residential": 1.1, "transit": 1.05}
TYPE_CODE = {t: i for i, t in enumerate(PROFILES)}


def generate_history(start: datetime) -> pd.DataFrame:
    rows = []
    for d in range(DAYS + 1):  # +1 day so we have lags for "tomorrow" context
        day = start + timedelta(days=d)
        dow = day.weekday()
        weekend = dow >= 5
        rain_day = RNG.random() < 0.25
        event_zone = RNG.choice(len(ZONES)) if RNG.random() < 0.15 else -1
        for h in range(24):
            rain = 1 if (rain_day and 14 <= h <= 21 and RNG.random() < 0.7) else 0
            temp = 21 + 6 * math.sin((h - 9) / 24 * 2 * math.pi) + RNG.normal(0, 1)
            for zi, z in enumerate(ZONES):
                mult = PROFILES[z["type"]][h]
                if weekend:
                    mult *= WEEKEND[z["type"]]
                if dow == 4 and h >= 18:  # Friday night
                    mult *= 1.25
                if rain:
                    mult *= 1.35
                if zi == event_zone and 17 <= h <= 22:
                    mult *= 1.8
                trend = 1 + 0.002 * d
                lam = max(0.2, z["baseDemand"] * mult * trend)
                demand = RNG.poisson(lam)
                rows.append({
                    "date": day.strftime("%Y-%m-%d"), "day_index": d, "hour": h, "dow": dow,
                    "is_weekend": int(weekend), "rain": rain, "temp": round(temp, 1),
                    "event": int(zi == event_zone and 17 <= h <= 22),
                    "zone_id": z["id"], "zone_idx": zi, "zone_type": TYPE_CODE[z["type"]],
                    "base_demand": z["baseDemand"], "demand": int(demand),
                })
    df = pd.DataFrame(rows).sort_values(["zone_idx", "day_index", "hour"]).reset_index(drop=True)
    df["lag_24h"] = df.groupby("zone_idx")["demand"].shift(24)
    df["lag_168h"] = df.groupby("zone_idx")["demand"].shift(168)
    df["roll_mean_24h"] = df.groupby("zone_idx")["demand"].transform(lambda s: s.shift(24).rolling(24, min_periods=1).mean())
    return df


FEATURES = ["zone_idx", "zone_type", "base_demand", "hour", "hour_sin", "hour_cos", "dow",
            "is_weekend", "rain", "temp", "event", "lag_24h", "lag_168h", "roll_mean_24h"]


def add_cyclic(df):
    df["hour_sin"] = np.sin(2 * np.pi * df["hour"] / 24)
    df["hour_cos"] = np.cos(2 * np.pi * df["hour"] / 24)
    return df


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    start = today - timedelta(days=DAYS)
    df = add_cyclic(generate_history(start))
    df.drop(columns=[]).to_csv(os.path.join(OUT_DIR, "historical_demand.csv"), index=False)

    # 'Tomorrow-like' row set = last generated day (day_index == DAYS) is used as forecast horizon
    hist = df[df["day_index"] < DAYS].dropna(subset=["lag_168h"])
    horizon = df[df["day_index"] == DAYS].copy()

    split = DAYS - TEST_DAYS
    train = hist[hist["day_index"] < split]
    test = hist[hist["day_index"] >= split].copy()

    model = GradientBoostingRegressor(n_estimators=300, max_depth=4, learning_rate=0.05,
                                      subsample=0.9, random_state=42)
    model.fit(train[FEATURES], train["demand"])
    test["predicted"] = np.clip(model.predict(test[FEATURES]), 0, None)

    mae = mean_absolute_error(test["demand"], test["predicted"])
    r2 = r2_score(test["demand"], test["predicted"])
    # naive baseline: same hour last week
    baseline_mae = mean_absolute_error(test["demand"], test["lag_168h"])

    # Refit on all history for the forward forecast
    model.fit(hist[FEATURES], hist["demand"])
    # Weather is unknown for tomorrow: assume no rain/event, keep simulated temperature
    horizon["rain"] = 0
    horizon["event"] = 0
    horizon["predicted"] = np.clip(model.predict(horizon[FEATURES]), 0, None)

    importances = sorted(
        [{"feature": f, "importance": round(float(i), 4)} for f, i in zip(FEATURES, model.feature_importances_)],
        key=lambda x: -x["importance"])

    test_series = [
        {"zoneId": r.zone_id, "date": r.date, "hour": int(r.hour), "actual": int(r.demand),
         "predicted": round(float(r.predicted), 2)}
        for r in test.itertuples()
    ]
    forecast = {}
    for r in horizon.itertuples():
        forecast.setdefault(r.zone_id, [0] * 24)[int(r.hour)] = round(float(r.predicted), 2)

    # Historical average per zone/hour (used for heatmap of 'actual' history)
    hist_avg = hist.groupby(["zone_id", "hour"])["demand"].mean().round(2)
    history_heatmap = {z["id"]: [float(hist_avg.get((z["id"], h), 0)) for h in range(24)] for z in ZONES}

    # Proactive positioning: for each of the next 24 hours, rank zones by predicted demand
    positioning = []
    for h in range(24):
        ranked = sorted(ZONES, key=lambda z: -forecast[z["id"]][h])
        total = sum(forecast[z["id"]][h] for z in ZONES) or 1
        positioning.append({
            "hour": h,
            "topZones": [{"zoneId": z["id"], "zoneName": z["name"], "predicted": forecast[z["id"]][h],
                          "share": round(forecast[z["id"]][h] / total, 3)} for z in ranked[:3]],
        })

    out = {
        "simulated": True,
        "model": "GradientBoostingRegressor (scikit-learn)",
        "params": {"n_estimators": 300, "max_depth": 4, "learning_rate": 0.05, "subsample": 0.9},
        "trainedAt": datetime.now().isoformat(timespec="seconds"),
        "trainRows": int(len(train)), "testRows": int(len(test)),
        "historyDays": DAYS, "testDays": TEST_DAYS,
        "features": FEATURES,
        "metrics": {"mae": round(float(mae), 3), "r2": round(float(r2), 3),
                    "baselineMaeLastWeek": round(float(baseline_mae), 3),
                    "improvementVsBaselinePct": round(float((baseline_mae - mae) / baseline_mae * 100), 1)},
        "featureImportance": importances,
        "testSeries": test_series,
        "forecastNext24h": forecast,
        "historyHeatmap": history_heatmap,
        "positioning": positioning,
        "zones": ZONES,
    }
    with open(os.path.join(OUT_DIR, "forecast.json"), "w") as f:
        json.dump(out, f)
    print(json.dumps({"ok": True, "mae": out["metrics"]["mae"], "r2": out["metrics"]["r2"],
                      "baselineMae": out["metrics"]["baselineMaeLastWeek"]}))


if __name__ == "__main__":
    main()
