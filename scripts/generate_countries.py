#!/usr/bin/env python3
"""
Genera countries/<slug>.html per ogni nazione in data/countries.json.

- Legge countries.json (prodotto da build_countries.py)
- Per ogni nazione, aggrega le tracce GPX dei suoi giorni in un'unica FeatureCollection
- Scrive countries/<slug>.html con header, stats, mappa aggregata, lista tappe, diario Obsidian
- Testi bilingui IT/EN tramite data-i18n + src/i18n.js + src/countries.js
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
  <title data-title-country="{name_it}" data-title-country-en="{name_en}">{name_it} – Dov'è Marco?</title>
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
        <span class="wm-logo-subtitle" data-i18n="nav.subtitle">Dove mi porta la bici</span>
      </a>

      <button type="button" class="wm-mobile-toggle" id="menu-toggle" aria-label="Toggle Menu">
        <span class="bar"></span><span class="bar"></span><span class="bar"></span>
      </button>

      <nav class="wm-nav" id="wm-nav-menu">
        <a href="../about.html" data-i18n="nav.about">Info</a>
        <a href="../journey.html" data-i18n="nav.journey">Il viaggio</a>
        <div class="wm-lang" role="group" aria-label="Language">
          <button type="button" data-lang="it" aria-pressed="true">IT</button>
          <button type="button" data-lang="en" aria-pressed="false">EN</button>
        </div>
      </nav>
    </div>
  </header>

  <main class="wm-journey-main">
    <div class="wm-journey-wrap">

            <article class="wm-page wm-country-article">

        <a href="../journey.html" class="wm-back-link" data-i18n="country.backToAll">← Torna a tutte le nazioni</a>

        <header class="wm-country-header">
          <div class="wm-country-flag">{flag}</div>
          <div>
            <h1 class="wm-country-title" data-name-it="{name_it}" data-name-en="{name_en}">{name_it}</h1>
            <p class="wm-country-sub"
               data-days="{days_count}"
               data-km="{total_km_raw}"
               data-up="{total_up_raw}"
               data-first="{first_date_iso}"
               data-last="{last_date_iso}">
              <span data-i18n="country.stagesCount">5 tappe</span> ·
              <span><span class="wm-sub-km">{total_km_raw}</span> km</span> ·
              <span>↑ <span class="wm-sub-up">{total_up_raw}</span> m</span> ·
              <span data-i18n="country.from">dal</span>
              <span class="wm-sub-first">{first_date_iso}</span>
              <span data-i18n="country.to">al</span>
              <span class="wm-sub-last">{last_date_iso}</span>
            </p>
          </div>
        </header>

        <div id="country-map" class="wm-country-map"></div>

        {description_section}

        <section class="wm-country-stages">
          <h2 data-i18n="country.stages">Le tappe</h2>
          <div class="wm-country-stages-list">
            {stages_html}
          </div>
        </section>

        <nav class="wm-country-nav"
             data-prev-slug="{prev_slug}"
             data-prev-it="{prev_name_it}"
             data-prev-en="{prev_name_en}"
             data-prev-flag="{prev_flag}"
             data-next-slug="{next_slug}"
             data-next-it="{next_name_it}"
             data-next-en="{next_name_en}"
             data-next-flag="{next_flag}">
          {prev_link}
          {next_link}
        </nav>

      </article>
    </div>
  </main>

  <script src="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js"></script>
  <script src="../src/i18n.js"></script>
  <script src="../src/countries.js"></script>
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
    temps_html = ""
    if w.get("tmin") is not None and w.get("tmax") is not None:
        temps_html = (
            f'<span class="wm-csr-temps" '
            f'data-tmin="{w["tmin"]}" data-tmax="{w["tmax"]}"></span>'
        )

    return f"""
      <div class="wm-country-stage-row"
           data-date="{day.get('date') or ''}"
           data-km="{day.get('distance_km') if day.get('distance_km') is not None else ''}"
           data-up="{day.get('elevation_up_m') if day.get('elevation_up_m') is not None else ''}"
           data-hours="{day.get('moving_time_h') if day.get('moving_time_h') is not None else ''}">
        <div class="wm-csr-cover">
          <span class="wm-csr-icon">{icon}</span>
          {temps_html}
        </div>
        <div class="wm-csr-body">
          <div class="wm-csr-head">
            <span class="wm-csr-day"><span data-i18n="country.day">GIORNO</span> {day['day_index']:02d}</span>
            <span class="wm-csr-date">📅 <span class="wm-csr-date-text"></span></span>
          </div>
          <h3 class="wm-csr-title">{html.escape(day.get('label') or '—')}</h3>
          <div class="wm-csr-stats">
            <span>📏 <span class="wm-csr-km"></span> km</span>
            <span>⛰️ ↑ <span class="wm-csr-up"></span> m</span>
            <span>⏱️ <span class="wm-csr-hours"></span> <span data-i18n="country.h">h</span></span>
          </div>
        </div>
      </div>
    """


def render_country(country, idx, total, all_countries):
    if country.get("has_description"):
        description_section = f"""
        <section class="wm-country-description">
          {country['description_html']}
        </section>
        """
    else:
        description_section = ""

    stages_html = "".join(render_stage_row(d) for d in country["days"])

    prev_slug = prev_it = prev_en = prev_flag = ""
    next_slug = next_it = next_en = next_flag = ""
    prev_link = ""
    next_link = ""
    if idx > 0:
        prev_c = all_countries[idx - 1]
        prev_slug = prev_c["slug"]
        prev_it = prev_c["name_it"]
        prev_en = prev_c["name_en"]
        prev_flag = prev_c["flag"]
        prev_link = (
            f'<a href="{prev_slug}.html" class="wm-nav-prev" '
            f'data-name-it="{html.escape(prev_it)}" data-name-en="{html.escape(prev_en)}">'
            f'← {prev_flag} <span class="wm-nav-name">{html.escape(prev_it)}</span></a>'
        )
    if idx < total - 1:
        next_c = all_countries[idx + 1]
        next_slug = next_c["slug"]
        next_it = next_c["name_it"]
        next_en = next_c["name_en"]
        next_flag = next_c["flag"]
        next_link = (
            f'<a href="{next_slug}.html" class="wm-nav-next" '
            f'data-name-it="{html.escape(next_it)}" data-name-en="{html.escape(next_en)}">'
            f'{next_flag} <span class="wm-nav-name">{html.escape(next_it)}</span> →</a>'
        )

    geojson = build_geojson(country)

    return HTML_TEMPLATE.format(
        name_it=html.escape(country["name_it"]),
        name_en=html.escape(country["name_en"]),
        flag=country["flag"],
        days_count=country["days_count"],
        total_km_raw=country["total_km"],
        total_up_raw=country["total_elevation_m"],
        first_date_iso=country["first_date"],
        last_date_iso=country["last_date"],
        description_section=description_section,
        stages_html=stages_html,
        prev_slug=prev_slug,
        prev_name_it=html.escape(prev_it),
        prev_name_en=html.escape(prev_en),
        prev_flag=prev_flag,
        next_slug=next_slug,
        next_name_it=html.escape(next_it),
        next_name_en=html.escape(next_en),
        next_flag=next_flag,
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
