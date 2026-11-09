#!/usr/bin/env python3
"""
Genera stages/giorno-XX.html per ogni tappa in data/summary.json.

- Legge data/summary.json (stats, meteo, country_code)
- Per ogni tappa legge gpx/_N.gpx (traccia) e diary/_note_N.md (nota opzionale)
- Scrive stages/giorno-XX.html con header, stats, mappa MapLibre, nota opzionale
- Link "← Torna al viaggio" + "← Nazione" + prev/next
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
DIARY_DIR = REPO_ROOT / "diary"
STAGES_DIR = REPO_ROOT / "stages"
SUMMARY_PATH = DATA_DIR / "summary.json"
COUNTRIES_JSON = DATA_DIR / "countries.json"

MAX_TRACK_POINTS = 800


COUNTRIES = {
    "it": ("italia",        "Italia"),
    "si": ("slovenia",      "Slovenia"),
    "hr": ("croazia",       "Croazia"),
    "ba": ("bosnia",        "Bosnia ed Erzegovina"),
    "me": ("montenegro",    "Montenegro"),
    "al": ("albania",       "Albania"),
    "xk": ("kosovo",        "Kosovo"),
    "mk": ("macedonia",     "Macedonia del Nord"),
    "rs": ("serbia",        "Serbia"),
    "gr": ("grecia",        "Grecia"),
    "bg": ("bulgaria",      "Bulgaria"),
    "tr": ("turchia",       "Turchia"),
    "ge": ("georgia",       "Georgia"),
}


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


def load_note(gpx_name):
    """Cerca diary/_note_N.md (dove N è il numero senza underscore iniziale).
    Ritorna (html_o_None, {})"""
    stem = Path(gpx_name).stem.lstrip("_")  # "_21" -> "21"
    md_path = DIARY_DIR / f"_note_{stem}.md"
    if not md_path.exists():
        return None
    raw = md_path.read_text(encoding="utf-8")
    if HAS_MARKDOWN:
        return md_lib.markdown(raw, extensions=["extra", "sane_lists"])
    return "".join(f"<p>{html.escape(p.strip())}</p>" for p in raw.split("\n\n") if p.strip())


HTML_TEMPLATE = """<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>{title} – Il viaggio – Dov'è Marco?</title>
  <link rel="icon" href="../images/favicon.ico" type="image/x-icon" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Silkscreen:wght@400;700&display=swap" rel="stylesheet">

  <link href="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css" rel="stylesheet" />
  <link rel="stylesheet" href="../src/style.css" />
  <link rel="stylesheet" href="../src/stage.css" />
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

      <div class="wm-stage-backlinks">
        <a href="../journey.html" class="wm-back-link">← Torna al viaggio</a>
        <a href="../countries/{country_slug}.html" class="wm-back-link">← {country_flag} {country_name}</a>
      </div>

      <article class="wm-page wm-stage-article">

        <div class="wm-stage-headline">
          <span class="wm-stage-day">GIORNO {day_num}</span>
          <span class="wm-stage-date">📅 {date_display}</span>
        </div>

        <h1>{label}</h1>

        <div class="wm-stage-stats-block">
          <div class="wm-stat"><span>📏</span><strong>{distance} km</strong><small>distanza</small></div>
          <div class="wm-stat"><span>⛰️</span><strong>↑ {elevation} m</strong><small>dislivello</small></div>
          <div class="wm-stat"><span>⏱️</span><strong>{moving_time} h</strong><small>in sella</small></div>
          <div class="wm-stat"><span>{wicon}</span><strong>{tmin}° / {tmax}°</strong><small>{precip} mm</small></div>
        </div>

        <div id="stage-map" class="wm-stage-map"></div>

        {note_section}

        <nav class="wm-stage-nav">
          {prev_link}
          {next_link}
        </nav>

      </article>
    </div>
  </main>

  <script src="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js"></script>
  <script>
    const TRACK = {track_json};
    const MAP_STYLE = "../styles/map-style.json";

    if (TRACK.length > 0) {{
      const map = new maplibregl.Map({{
        container: "stage-map",
        style: MAP_STYLE,
        center: [TRACK[0][1], TRACK[0][0]],
        zoom: 10,
        attributionControl: false,
      }});

      map.on("load", () => {{
        map.addSource("track", {{
          type: "geojson",
          data: {{
            type: "Feature",
            geometry: {{ type: "LineString", coordinates: TRACK.map(p => [p[1], p[0]]) }},
          }},
        }});

        map.addLayer({{
          id: "track-line",
          type: "line",
          source: "track",
          paint: {{
            "line-color": "#e63946",
            "line-width": 4,
            "line-opacity": 0.9,
          }},
          layout: {{ "line-cap": "round", "line-join": "round" }},
        }});

        const bounds = TRACK.reduce(
          (b, p) => b.extend([p[1], p[0]]),
          new maplibregl.LngLatBounds([TRACK[0][1], TRACK[0][0]], [TRACK[0][1], TRACK[0][0]])
        );
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


def render_stage(day, idx, total):
    gpx_name = day.get("gpx_file", "")
    gpx_path = GPX_DIR / gpx_name

    track_json = "[]"
    if gpx_path.exists():
        raw_track = load_gpx_track(gpx_path)
        track = simplify_track(raw_track, MAX_TRACK_POINTS)
        track_json = json.dumps([[round(lat, 6), round(lon, 6)] for lat, lon in track])

    note_html = load_note(gpx_name)
    if note_html:
        note_section = f"""
        <section class="wm-diary">
          <h2>📔 Nota del giorno</h2>
          {note_html}
        </section>
        """
    else:
        note_section = ""

    # Country info
    cc = (day.get("country_code") or "").lower()
    country_slug, country_name = COUNTRIES.get(cc, (cc or "unknown", (cc or "").upper()))
    country_flag = ""
    if cc and len(cc) == 2:
        country_flag = "".join(chr(0x1F1E6 + ord(c) - ord("a")) for c in cc)

    w = day.get("weather") or {}
    prev_link = ""
    next_link = ""
    if idx > 0:
        prev_link = f'<a href="giorno-{idx:02d}.html" class="wm-nav-prev">← Giorno {idx:02d}</a>'
    if idx < total - 1:
        next_link = f'<a href="giorno-{idx+2:02d}.html" class="wm-nav-next">Giorno {idx+2:02d} →</a>'

    return HTML_TEMPLATE.format(
        title=html.escape(day.get("label", f"Giorno {idx+1}")),
        day_num=f"{idx+1:02d}",
        date_display=fmt_date_it(day.get("date")),
        label=html.escape(day.get("label", "—")),
        distance=fmt_number_it(day.get("distance_km"), 1),
        elevation=fmt_number_it(day.get("elevation_up_m"), 0),
        moving_time=fmt_number_it(day.get("moving_time_h"), 1),
        wicon=weather_icon(w.get("code")),
        tmin=fmt_number_it(w.get("tmin"), 0) if w.get("tmin") is not None else "—",
        tmax=fmt_number_it(w.get("tmax"), 0) if w.get("tmax") is not None else "—",
        precip=fmt_number_it(w.get("precip"), 1) if w.get("precip") is not None else "—",
        note_section=note_section,
        prev_link=prev_link,
        next_link=next_link,
        track_json=track_json,
        country_slug=country_slug,
        country_name=country_name,
        country_flag=country_flag,
    )


def main():
    if not SUMMARY_PATH.exists():
        print(f"❌ {SUMMARY_PATH} non trovato. Esegui prima generate_summary.py.")
        return

    STAGES_DIR.mkdir(exist_ok=True)

    with SUMMARY_PATH.open("r", encoding
