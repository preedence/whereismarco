import json
import re
import time
import urllib.parse
import urllib.request
from datetime import date as date_cls
from pathlib import Path

import gpxpy


REPO_ROOT = Path(__file__).resolve().parents[1]
GPX_DIR = REPO_ROOT / "gpx"
DATA_DIR = REPO_ROOT / "data"
SUMMARY_PATH = DATA_DIR / "summary.json"

# Pausa tra le chiamate API (secondi), per non sovraccaricare il servizio
WEATHER_SLEEP_S = 0.2
GEOCODE_SLEEP_S = 1.0  # Pausa di rispetto per le API pubbliche di Nominatim
# Se True, salta le chiamate API meteo e usa i dati già presenti
SKIP_WEATHER_FETCH = False


def get_gpx_date(path: Path) -> str:
    """Estrae la data dal primo <time> del GPX leggendo solo l'inizio del file."""
    # 1. Prova dal nome file, se contiene una data YYYY-MM-DD
    parts = path.stem.split("-")
    if len(parts) >= 3:
        candidate = "-".join(parts[0:3])
        try:
            date_cls.fromisoformat(candidate)
            return candidate
        except ValueError:
            pass

    # 2. Leggi solo i primi 16 KB e cerca il primo <time>
    try:
        with path.open("r", encoding="utf-8", errors="ignore") as f:
            head = f.read(16384)
        m = re.search(r"<time>(\d{4}-\d{2}-\d{2})T", head)
        if m:
            return m.group(1)
    except Exception:
        pass

    # 3. Fallback estremo: parse completo
    try:
        with path.open("r", encoding="utf-8") as f:
            gpx = gpxpy.parse(f)
        if gpx.tracks and gpx.tracks[0].segments and gpx.tracks[0].segments[0].points:
            first_point = gpx.tracks[0].segments[0].points[0]
            if first_point.time:
                return first_point.time.date().isoformat()
    except Exception:
        pass

    return "1970-01-01"


def get_last_coord(gpx) -> tuple[float, float] | None:
    """Estrae l'ultima coordinata (lon, lat) dalla traccia GPX."""
    for track in reversed(gpx.tracks):
        for segment in reversed(track.segments):
            for point in reversed(segment.points):
                return (point.longitude, point.latitude)
    return None


def fetch_location_name(lat: float, lon: float) -> str | None:
    """Ottiene il nome della località partendo da coordinate lat/lon tramite Nominatim."""
    url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}&zoom=10"
    headers = {"User-Agent": "WhereIsMarcoTracker/1.0"}
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            address = data.get("address", {})
            # Cerca il nome della città, paese, comune o regione
            loc = (
                address.get("town")
                or address.get("city")
                or address.get("village")
                or address.get("municipality")
                or address.get("county")
            )
            return loc
    except Exception as e:
        print(f"  Località non disponibile: {e}", flush=True)
    return None


def fetch_weather(lat: float, lon: float, date_str: str) -> dict | None:
    """Chiama Open-Meteo Archive e restituisce max/min/media/precip/codice."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": date_str,
        "end_date": date_str,
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode",
        "hourly": "temperature_2m",
        "timezone": "auto",
    }
    url = "https://archive-api.open-meteo.com/v1/archive?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            data = json.loads(resp.read().decode())
    except Exception as e:
        print(f"  Meteo non disponibile per {date_str}: {e}", flush=True)
        return None

    try:
        daily = data["daily"]
        tmax = daily["temperature_2m_max"][0]
        tmin = daily["temperature_2m_min"][0]
        precip = daily["precipitation_sum"][0]
        code = daily["weathercode"][0]

        hourly_temps = [t for t in data["hourly"]["temperature_2m"] if t is not None]
        tmean = round(sum(hourly_temps) / len(hourly_temps), 1) if hourly_temps else None

        return {
            "tmax": tmax,
            "tmin": tmin,
            "tmean": tmean,
            "precip": precip,
            "code": code,
        }
    except (KeyError, IndexError, TypeError):
        return None


def summarize_gpx(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        gpx = gpxpy.parse(f)

    distance_m = 0.0
    elevation_up_m = 0.0
    moving_time_s = 0.0

    for track in gpx.tracks:
        for segment in track.segments:
            distance_m += segment.length_3d() or 0.0
            prev_point = None
            for point in segment.points:
                if prev_point and point.elevation and prev_point.elevation:
                    diff = float(point.elevation) - float(prev_point.elevation)
                    if diff > 0:
                        elevation_up_m += diff
                prev_point = point

    moving_time_s = gpx.get_moving_data().moving_time or 0.0

    date = None
    if gpx.time:
        date = gpx.time.date().isoformat()
    if not date:
        try:
            date = path.stem.split("-")[0:3]
            date = "-".join(date)
        except Exception:
            date = ""

    # Ricerca automatica della label / località tramite coordinate finali del GPX
    label = gpx.name
    coord = get_last_coord(gpx)

    if not label or label == path.stem:
        if coord:
            lon, lat = coord
            print(f"  Cerco località per {date} @ {lat:.4f},{lon:.4f}", flush=True)
            loc_name = fetch_location_name(lat, lon)
            if loc_name:
                label = loc_name
                print(f"    Trovato: {loc_name}", flush=True)
            time.sleep(GEOCODE_SLEEP_S)

    if not label:
        label = path.stem

    # Meteo (solo se abbiamo data valida e coordinate)
    weather = None
    if not SKIP_WEATHER_FETCH and date and date != "1970-01-01":
        if coord:
            lon, lat = coord
            print(f"  Meteo per {date} @ {lat:.4f},{lon:.4f}", flush=True)
            weather = fetch_weather(lat, lon, date)
            time.sleep(WEATHER_SLEEP_S)

    return {
        "date": date,
        "label": label,
        "distance_km": round(distance_m / 1000.0, 1),
        "elevation_up_m": int(round(elevation_up_m)),
        "moving_time_h": round(moving_time_s / 3600.0, 1),
        "gpx_file": path.name,
        "weather": weather,
    }


def main():
    DATA_DIR.mkdir(exist_ok=True)
    days = []

    if not GPX_DIR.exists():
        print("Nessuna cartella gpx/, niente da fare.", flush=True)
    else:
        gpx_files = list(GPX_DIR.glob("*.gpx"))
        print(f"Trovati {len(gpx_files)} file GPX", flush=True)

        gpx_files_sorted = sorted(gpx_files, key=get_gpx_date)
        print("Ordinamento completato", flush=True)

        for path in gpx_files_sorted:
            print(f"Elaboro {path.name}", flush=True)
            days.append(summarize_gpx(path))

    summary = {"days": days}

    with SUMMARY_PATH.open("w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print(f"Scritto {SUMMARY_PATH} ({len(days)} tappe)", flush=True)


if __name__ == "__main__":
    main()
