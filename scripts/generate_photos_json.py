import json
from pathlib import Path

import exifread  # pip install exifread


REPO_ROOT = Path(__file__).resolve().parents[1]
PHOTOS_DIR = REPO_ROOT / "photos"
OUT_FILE = REPO_ROOT / "data" / "photos.json"


def _get_if_exist(tags, key):
  return tags.get(key)


def _convert_to_degrees(value):
  d = float(value.values[0].num) / float(value.values[0].den)
  m = float(value.values[1].num) / float(value.values[1].den)
  s = float(value.values[2].num) / float(value.values[2].den)
  return d + (m / 60.0) + (s / 3600.0)


def get_gps_from_exif(path: Path):
  """Restituisce (lat, lon) in decimali o (None, None) se non presenti."""
  with path.open("rb") as f:
    tags = exifread.process_file(f, details=False)

  gps_latitude = _get_if_exist(tags, "GPS GPSLatitude")
  gps_latitude_ref = _get_if_exist(tags, "GPS GPSLatitudeRef")
  gps_longitude = _get_if_exist(tags, "GPS GPSLongitude")
  gps_longitude_ref = _get_if_exist(tags, "GPS GPSLongitudeRef")

  if not (gps_latitude and gps_latitude_ref and gps_longitude and gps_longitude_ref):
    return None, None

  lat = _convert_to_degrees(gps_latitude)
  if gps_latitude_ref.values[0] != "N":
    lat = -lat

  lon = _convert_to_degrees(gps_longitude)
  if gps_longitude_ref.values[0] != "E":
    lon = -lon

  return float(lat), float(lon)


def build_photos_json():
  photos = []

  if not PHOTOS_DIR.exists():
    print(f"Nessuna cartella {PHOTOS_DIR}, niente da fare.")
    return {"photos": photos}

  for path in sorted(PHOTOS_DIR.rglob("*.jpg")):
    rel_path = path.relative_to(REPO_ROOT).as_posix()
    lat, lon = get_gps_from_exif(path)
    if lat is None or lon is None:
      continue  # salta foto senza GPS

    # Etichetta base dal nome file
    title = path.stem.replace("_", " ").replace("-", " ")

    photos.append(
      {
        "file": rel_path,
        "title": title,
        "lat": lat,
        "lon": lon,
        "caption": "",
      }
    )

  return {"photos": photos}


def main():
  data = build_photos_json()
  OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
  OUT_FILE.write_text(
    json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
  )
  print(f"Scritto {OUT_FILE} con {len(data['photos'])} foto")


if __name__ == "__main__":
  main()
