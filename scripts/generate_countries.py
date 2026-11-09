#!/usr/bin/env python3
"""
Genera countries/<slug>.html per ogni nazione in data/countries.json.

- Legge countries.json (prodotto da build_countries.py)
- Per ogni nazione, aggrega le tracce GPX dei suoi giorni in un'unica FeatureCollection
- Scrive countries/<slug>.html con header, stats, mappa aggregata, lista tappe, diario Obsidian
"""

import html
import json
from datetime import date as date_cls
from pathlib import Path

import gpxpy

try:
    import markdown as md_lib
    HAS_MARKDOWN = True
except ImportError:
    HAS_MARKDOWN = False


REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "data"
GPX_DIR = REPO_ROOT / "gpx"
COUNTRIES_DIR = REPO_ROOT / "countries"
COUNTRIES_JSON = DATA_DIR / "countries.json"

MAX_TRACK_POINTS_PER_STAGE = 200


def weather_icon(code):
    if code is None: return "🌡️"
    if code == 0: return "☀️"
    if code == 1: return "🌤️"
    if code == 2: return "⛅"
    if code == 3: return "☁️"
    if code in (45, 48): return "🌫️"
    if 51 <= code <= 57: return "🌦️"
    if 61 <= code <= 67: return "🌧️"
    if 71 <= code <= 77: return "🌨️"
    if 80 <= code <= 82: return "🌧️"
    if 85 <= code <= 86: return "🌨️"
    if code >= 95: return "⛈️"
    return "🌡️"


def fmt_number_it(value, digits=1):
    if value is None:
        return "—"
    s = f"{value:,.{digits}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def fmt_date_it(iso):
    if not iso:
        return "—"
    try:
        d = date_cls.fromisoformat(iso)
    except Exception:
        return iso
    months = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"]
    return f"{d.day} {months[d.month-1]} {d.year}"


def simplify_track(points, max_points):
    if len(points) <= max_points:
        return points
    step = len(points) / max_points
    out = [points[0]]
    for i in range(1, max_points - 1):
        out.append(points[int(i * step)])
    out.append(points[-1])
    return out


def load_gpx_track(path):
    with path.open("r", encoding="utf-8") as f:
        gpx = gpxpy.parse(f)
    coords = []
    for track in gpx.tracks:
        for seg in track.segments:
            for pt in seg.points:
                coords.append((pt.latitude, pt.longitude))
    return coords


def build_geojson(country):
    """Costruisce una FeatureCollection con una LineString per ogni tappa della nazione."""
    features = []
    for day in country["days"]:
        gpx_name = day.get("gpx_file")
        if not gpx_name:
            continue
        gpx_path = GPX_DIR / gpx_name
        if not gpx_path.exists():
            continue
        raw = load_gpx_track(gpx_path)
        simplified = simplify_track(raw, MAX_TRACK_POINTS_PER_STAGE)
        coords = [[round(lon, 6), round(lat, 6)] for lat, lon in simplified]
        if len(coords) < 2:
            continue
        features.append({
            "type": "Feature",
            "properties": {
                "day_index": day.get("day_index"),
                "date": day.get("date"),
                "label": day.get("label"),
            },
            "geometry": {
                "type": "LineString",
                "coordinates": coords,
            },
        })
    return {"type": "FeatureCollection", "features": features}


HTML_TEMPLATE = """<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>{name_it} – Il viaggio – Dov'è Marco?</title>
  <link rel="icon" href="../images/favicon.ico" type="image/x-icon" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Silkscreen:wght@400;700&display=swap" rel="stylesheet">

  <link href="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css" rel="stylesheet" />
  <link rel="stylesheet" href="../src/style.css" />
  <link rel="stylesheet" href="../src/countries.css" />
</head>
<body>
  <div class="waldo-stripe"></div>

  <header class="wm-topbar">
    <div class="wm-topbar-inner">
      <a href="../index.html" class="wm-logo">
        <div class="wm-logo-title-wrap">
          <span class="wm-logo-title">🔍 Dov'è Marco?</span>
        </div>
        <span class="wm-logo-subtitle">Dove mi porta la bici</span>
      </a>

      <button type="button" class="wm-mobile-toggle" id="menu-toggle" aria-label="Toggle Menu">
        <span class="bar"></span><span class="bar"></span><span class="bar"></span>
      </button>

      <nav class="wm-nav" id="wm-nav-menu">
        <a href="../about.html">Info</a>
        <a href="../journey.html">Il viaggio</a>
        <div class="wm-lang" role="group" aria-label="Language">
          <button type="button" data-lang="it" aria-pressed="true">IT</button>
          <button type="button" data-lang="en" aria-pressed="false">EN</button>
        </div>
      </nav>
    </div>
  </header>

  <main class="wm-journey-main">
    <div class="wm-journey-wrap">

      <a href="../journey.html" class="wm-back-link">← Torna a tutte le nazioni</a>

      <article class="wm-page wm-country-article">

        <header class="wm-country-header">
          <div class="wm-country-flag">{flag}</div>
          <div>
            <h1 class="wm-country-title">{name_it}</h1>
            <p class="wm-country-sub">
              {days_count} tappe · {total_km} km · ↑ {total_elevation_m} m
              · dal {first_date} al {last_date}
            </p>
          </div>
        </header>

        <div id="country-map" class="wm-country-map"></div>

        {description_section}

        <section class="wm-country-stages">
          <h2>Le tappe</h2>
          <div class="wm-country-stages-list">
            {stages_html}
          </div>
        </section>

        <nav class="wm-country-nav">
          {prev_link}
          {next_link}
        </nav>

      </article>
    </div>
  </main>

  <script src="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js"></script>
  <script>
    const GEOJSON = {geojson_json};
    const MAP_STYLE = "../styles/map-style.json";

    if (GEOJSON.features.length > 0) {{
      const map = new maplibregl.Map({{
        container: "country-map",
        style: MAP_STYLE,
        center: [10, 45],
        zoom: 4,
        attributionControl: false,
      }});

      map.on("load", () => {{
        map.addSource("stages", {{ type: "geojson", data: GEOJSON }});

        map.addLayer({{
          id: "stage-lines",
          type: "line",
          source: "stages",
          paint: {{
            "line-color": "#e63946",
            "line-width": 3,
            "line-opacity": 0.85,
          }},
          layout: {{ "line-cap": "round", "line-join": "round" }},
        }});

        // Fit bounds su tutte le tracce
        const bounds = new maplibregl.LngLatBounds();
        GEOJSON.features.forEach(f => {{
          f.geometry.coordinates.forEach(c => bounds.extend(c));
        }});
        map.fitBounds(bounds, {{ padding: 40, duration: 0 }});
      }});
    }}

    document.getElementById('menu-toggle').addEventListener('click', function() {{
      document.getElementById('wm-nav-menu').classList.toggle('active');
      this.classList.toggle('open');
    }});
  </script>
</body>
</html>
"""


def render_stage_row(day):
    w = day.get("weather") or {}
    icon = weather_icon(w.get("code"))
    temps = ""
    if w.get("tmin") is not None and w.get("tmax") is not None:
        temps = f"{fmt_number_it(w['tmin'], 0)}° / {fmt_number_it(w['tmax'], 0)}°"

    page = f"../stages/giorno-{day['day_index']:02d}.html"

    return f"""
      <a href="{page}" class="wm-country-stage-row">
        <div class="wm-csr-cover">
          <span class="wm-csr-icon">{icon}</span>
          <span class="wm-csr-temps">{temps}</span>
        </div>
        <div class="wm-csr-body">
          <div class="wm-csr-head">
            <span class="wm-csr-day">GIORNO {day['day_index']:02d}</span>
            <span class="wm-csr-date">📅 {fmt_date_it(day.get('date'))}</span>
          </div>
          <h3 class="wm-csr-title">{html.escape(day.get('label') or '—')}</h3>
          <div class="wm-csr-stats">
            <span>📏 {fmt_number_it(day.get('distance_km'), 1)} km</span>
            <span>⛰️ ↑ {fmt_number_it(day.get('elevation_up_m'), 0)} m</span>
            <span>⏱️ {fmt_number_it(day.get('moving_time_h'), 1)} h</span>
          </div>
        </div>
      </a>
    """


def render_country(country, idx, total, all_countries):
    # Descrizione (opzionale)
    if country.get("has_description"):
        description_section = f"""
        <section class="wm-country-description">
          {country['description_html']}
        </section>
        """
    else:
        description_section = ""

    # Tappe
    stages_html = "".join(render_stage_row(d) for d in country["days"])

    # Prev / next
    prev_link = ""
    next_link = ""
    if idx > 0:
        prev_c = all_countries[idx - 1]
        prev_link = f'<a href="{prev_c["slug"]}.html" class="wm-nav-prev">← {prev_c["flag"]} {prev_c["name_it"]}</a>'
    if idx < total - 1:
        next_c = all_countries[idx + 1]
        next_link = f'<a href="{next_c["slug"]}.html" class="wm-nav-next">{next_c["flag"]} {next_c["name_it"]} →</a>'

    geojson = build_geojson(country)

    return HTML_TEMPLATE.format(
        name_it=html.escape(country["name_it"]),
        flag=country["flag"],
        days_count=country["days_count"],
        total_km=fmt_number_it(country["total_km"], 1),
        total_elevation_m=fmt_number_it(country["total_elevation_m"], 0),
        first_date=fmt_date_it(country["first_date"]),
        last_date=fmt_date_it(country["last_date"]),
        description_section=description_section,
        stages_html=stages_html,
        prev_link=prev_link,
        next_link=next_link,
        geojson_json=json.dumps(geojson, ensure_ascii=False),
    )


def main():
    if not COUNTRIES_JSON.exists():
        print(f"❌ {COUNTRIES_JSON} non trovato. Esegui prima build_countries.py.")
        return

    COUNTRIES_DIR.mkdir(exist_ok=True)

    with COUNTRIES_JSON.open("r", encoding="utf-8") as f:
        data = json.load(f)

    countries = data.get("countries", [])
    total = len(countries)
    print(f"Genero {total} pagine nazione…")

    for idx, country in enumerate(countries):
        out_path = COUNTRIES_DIR / f"{country['slug']}.html"
        out_path.write_text(
            render_country(country, idx, total, countries),
            encoding="utf-8",
        )
        print(f"  ✓ {country['slug']}.html  ({country['flag']} {country['name_it']})")

    print(f"\n✅ Fatto: {total} pagine in {COUNTRIES_DIR}")


if __name__ == "__main__":
    main()
