import json
from pathlib import Path
from datetime import datetime, timedelta

# Root del repo (cartella che contiene data/, src/, ecc.)
REPO_ROOT = Path(__file__).resolve().parents[1]
OUT = REPO_ROOT / "data" / "positions.geojson"

# Una piccola lista di punti lungo una rotta finta Milano -> Est
ROUTE = [
    (9.19, 45.4642, "Milano"),
    (13.7768, 45.6500, "Trieste"),
    (15.9819, 45.8150, "Zagreb"),
    (20.4489, 44.7866, "Belgrado"),
    (27.5667, 47.1667, "Bucarest"),
    (28.9784, 41.0082, "Istanbul")
]

def main():
    start_time = datetime(2025, 4, 1, 8, 0, 0)
    features = []

    for i, (lon, lat, name) in enumerate(ROUTE):
        ts = start_time + timedelta(hours=i * 6)
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [lon, lat]
            },
            "properties": {
                "timestamp": ts.isoformat() + "Z",
                "label": name,
                "source": "simulate_spot"
            }
        })

    fc = {
        "type": "FeatureCollection",
        "features": features
    }

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(fc, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Scritto {OUT} con {len(features)} punti finti")

if __name__ == "__main__":
    main()
