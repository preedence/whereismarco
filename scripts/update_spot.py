#!/usr/bin/env python3
import os
import requests
import json
from pathlib import Path
from datetime import datetime

FEED_URL = os.environ.get("SPOT_FEED_URL", "https://api.findmespot.com/spot-main-web/consumer/rest-api/2.0/public/feed/YOUR_FEED_ID/message.json")
OUT = Path("data/positions.geojson")

def parse_spot(data):
    # SPOT returns messages array, newest first
    msgs = data.get("response", {}).get("feedMessageResponse", {}).get("messages", {}).get("message", [])
    features = []
    # normalize to geojson features (reverse to get chronological order)
    for m in reversed(msgs):
        try:
            lat = float(m.get("latitude"))
            lon = float(m.get("longitude"))
            ts = m.get("dateTime") or m.get("unixTime")
            props = {"timestamp": ts, "type": m.get("messageType", "TRACK"), "battery": m.get("batteryState")}
            features.append({
                "type": "Feature",
                "geometry": { "type": "Point", "coordinates": [lon, lat] },
                "properties": props
            })
        except Exception as e:
            continue
    return {"type":"FeatureCollection", "features": features}

def main():
    r = requests.get(FEED_URL, timeout=20)
    r.raise_for_status()
    data = r.json()
    geo = parse_spot(data)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(geo, indent=2))
    print("Wrote", OUT)

if __name__ == "__main__":
    main()
