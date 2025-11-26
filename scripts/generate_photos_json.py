import json
from pathlib import Path

import exifread  # pip install exifread


REPO_ROOT = Path(__file__).resolve().parents[1]
PHOTOS_DIR = REPO_ROOT / "photos"
OUT_FILE = REPO_ROOT / "data" / "photos.json"


def _get_if_exist(tags, key):
    return tags.get(key)


def _convert_to_degrees(value):
    """
    Converte un valore EXIF GPS (in gradi/minuti/secondi) in gradi decimali.
    Esempio: [d, m, s] -> d + m/60 + s/3600.
    Restituisce None se i dati sono corrotti (denominatore 0, formato strano, ecc.).
    """
    try:
        vals = value.values
        if len(vals) < 3:
            return None

        d_val = vals[0]
        m_val = vals[1]
        s_val = vals[2]

        # Evita divisioni per zero
        if d_val.den == 0 or m_val.den == 0 or s_val.den == 0:
            return None

        d = float(d_val.num) / float(d_val.den)
        m = float(m_val.num) / float(m_val.den)
        s = float(s_val.num) / float(s_val.den)

        return d + (m / 60.0) + (s / 3600.0)
    except Exception:
        return None


def get_gps_from_exif(path: Path):
    """Restituisce (lat, lon) in decimali o (None, None) se non presenti/validi."""
    with path.open("rb") as f:
        tags = exifread.process_file(f, details=False)

    gps_latitude = _get_if_exist(tags, "GPS GPSLatitude")
    gps_latitude_ref = _get_if_exist(tags, "GPS GPSLatitudeRef")
    gps_longitude = _get_if_exist(tags, "GPS GPSLongitude")
    gps_longitude_ref = _get_if_exist(tags, "GPS GPSLongitudeRef")

    if not (gps_latitude and gps_latitude_ref and gps_longitude and gps_longitude_ref):
        return None, None

    lat = _convert_to_degrees(gps_latitude)
    lon = _convert_to_degrees(gps_longitude)

    # Se la conversione fallisce o i dati sono corrotti
    if lat is None or lon is None:
        return None, None

    # Riferimenti N/S, E/W
    ref_lat = str(gps_latitude_ref.values[0])
    ref_lon = str(gps_longitude_ref.values[0])

    if ref_lat.upper() != "N":
        lat = -lat
    if ref_lon.upper() != "E":
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
            print(f"Foto senza GPS valido, saltata: {rel_path}")
            continue  # salta foto senza GPS o con EXIF corrotti

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
