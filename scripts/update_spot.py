#!/usr/bin/env python3

import os
import json
from pathlib import Path
from datetime import datetime, timezone
import requests

# URL del feed SPOT, preso dal secret GitHub SPOT_FEED_URL
FEED_URL = os.environ.get(
    "SPOT_FEED_URL",
    "https://api.findmespot.com/spot-main-web/consumer/rest-api/2.0/public/feed/YOUR_FEED_ID/message.json",
)

OUT = Path("data/positions.geojson")


def load_existing():
    """Carica lo storico esistente, se c'è."""
    if not OUT.exists():
        return {"type": "FeatureCollection", "features": []}

    try:
        data = json.load(OUT.open("r", encoding="utf-8"))
        if data.get("type") != "FeatureCollection":
            return {"type": "FeatureCollection", "features": []}
        return data
    except Exception:
        # Se il file è corrotto/non valido, riparti da vuoto
        return {"type": "FeatureCollection", "features": []}


def parse_spot(data):
    """
    Converte la risposta JSON SPOT in una lista di Feature GeoJSON.
    SPOT → response.feedMessageResponse.messages.message[]
    """
    msgs = (
        data.get("response", {})
        .get("feedMessageResponse", {})
        .get("messages", {})
        .get("message", [])
    )

    # Normalizza: se è un dict singolo, rendilo lista
    if isinstance(msgs, dict):
        msgs = [msgs]
    elif not isinstance(msgs, list):
        msgs = []

    features = []

    # SPOT restituisce di solito dal più nuovo al più vecchio → li giriamo
    for m in reversed(msgs):
        try:
            lat = float(m.get("latitude"))
            lon = float(m.get("longitude"))
        except Exception:
            continue

        # Id univoco del messaggio SPOT (serve per evitare duplicati)
        msg_id = m.get("id") or m.get("messageId") or None

        # timestamp: uso dateTime se c'è, altrimenti unixTime
        ts = m.get("dateTime")
        if not ts and m.get("unixTime"):
            try:
                ts_dt = datetime.fromtimestamp(int(m["unixTime"]), tz=timezone.utc)
                ts = ts_dt.isoformat().replace("+00:00", "Z")
            except Exception:
                ts = None

        props = {
            "timestamp": ts,
            "type": m.get("messageType", "TRACK"),
            "battery": m.get("batteryState"),
            "spot_id": msg_id,
            "source": "spot",
        }

        feat = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": props,
        }
        features.append(feat)

    return features


def merge_features(existing_fc, new_features):
    """
    Unisce lo storico esistente con i nuovi punti, evitando duplicati.
    Usa properties.spot_id (se presente) come chiave.
    Se manca, tiene comunque il punto, ma i duplicati potrebbero non essere filtrati.
    """
    existing_features = existing_fc.get("features", [])
    merged = []
    seen_ids = set()

    # Prima, aggiungi tutti i vecchi
    for f in existing_features:
        props = f.get("properties", {})
        key = props.get("spot_id")
        if key:
            if key in seen_ids:
                continue
            seen_ids.add(key)
        merged.append(f)

    # Poi, aggiungi i nuovi se non già visti
    for f in new_features:
        props = f.get("properties", {})
        key = props.get("spot_id")
        if key and key in seen_ids:
            continue
        if key:
            seen_ids.add(key)
        merged.append(f)

    # Ordina per timestamp se disponibile
    def sort_key(feat):
        ts = feat.get("properties", {}).get("timestamp")
        if not ts:
            return ""
        return ts

    merged.sort(key=sort_key)

    return {"type": "FeatureCollection", "features": merged}


def main():
    print("Scarico dati da:", FEED_URL)

    r = requests.get(FEED_URL, timeout=20)
    r.raise_for_status()
    data = r.json()

    new_feats = parse_spot(data)
    existing = load_existing()
    merged = merge_features(existing, new_feats)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(merged, indent=2), encoding="utf-8")
    print("Scritto storico aggiornato in", OUT)


if __name__ == "__main__":
    main()
