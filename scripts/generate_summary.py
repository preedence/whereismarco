import json
import os
from pathlib import Path

import gpxpy


REPO_ROOT = Path(__file__).resolve().parents[1]
GPX_DIR = REPO_ROOT / "gpx"
DATA_DIR = REPO_ROOT / "data"
SUMMARY_PATH = DATA_DIR / "summary.json"


def summarize_gpx(path: Path) -> dict:
  with path.open("r", encoding="utf-8") as f:
    gpx = gpxpy.parse(f)

  distance_m = 0.0
  elevation_up_m = 0.0
  moving_time_s = 0.0

  for track in gpx.tracks:
    for segment in track.segments:
      distance_m += segment.length_3d() or 0.0
      # dislivello positivo
      prev_point = None
      for point in segment.points:
        if prev_point and point.elevation and prev_point.elevation:
          diff = float(point.elevation) - float(prev_point.elevation)
          if diff > 0:
            elevation_up_m += diff
        prev_point = point

  moving_time_s = gpx.get_moving_data().moving_time or 0.0

  # prova a ricavare la data dalla prima traccia o dal nome file
  date = None
  if gpx.time:
    date = gpx.time.date().isoformat()
  if not date:
    # es: 2025-04-01-milano-brescia.gpx
    try:
      date = path.stem.split("-")[0:3]
      date = "-".join(date)
    except Exception:
      date = ""

  label = gpx.name or path.stem

  return {
    "date": date,
    "label": label,
    "distance_km": round(distance_m / 1000.0, 1),
    "elevation_up_m": int(round(elevation_up_m)),
    "moving_time_h": round(moving_time_s / 3600.0, 1),
    "gpx_file": path.name,
  }


def main():
  DATA_DIR.mkdir(exist_ok=True)
  days = []

  if not GPX_DIR.exists():
    print("Nessuna cartella gpx/, niente da fare.")
  else:
    for path in sorted(GPX_DIR.glob("*.gpx")):
      print(f"Elaboro {path.name}")
      days.append(summarize_gpx(path))

  summary = {"days": days}

  with SUMMARY_PATH.open("w", encoding="utf-8") as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)

  print(f"Scritto {SUMMARY_PATH} ({len(days)} tappe)")


if __name__ == "__main__":
  main()
