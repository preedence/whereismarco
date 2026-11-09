#!/usr/bin/env python3
"""
Raggruppa le tappe di data/summary.json per nazione e produce data/countries.json.

- country_code: automatico (da summary.json, via Nominatim)
- nome + bandiera: automatici (da country_code)
- descrizione: letto da diary/_country_XX.md (Obsidian, markdown -> HTML)

Output: data/countries.json con un array di nazioni ordinate per prima data di ingresso.
"""

import json
from collections import defaultdict
from datetime import date as date_cls
from pathlib import Path

try:
    import markdown as md_lib
    HAS_MARKDOWN = True
except ImportError:
    HAS_MARKDOWN = False


REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "data"
DIARY_DIR = REPO_ROOT / "diary"
SUMMARY_PATH = DATA_DIR / "summary.json"
OUTPUT_PATH = DATA_DIR / "countries.json"


COUNTRIES = {
    "it": ("italia",        "Italia",              "Italy"),
    "si": ("slovenia",      "Slovenia",            "Slovenia"),
    "hr": ("croazia",       "Croazia",             "Croatia"),
    "ba": ("bosnia",        "Bosnia ed Erzegovina","Bosnia and Herzegovina"),
    "me": ("montenegro",    "Montenegro",          "Montenegro"),
    "al": ("albania",       "Albania",             "Albania"),
    "xk": ("kosovo",        "Kosovo",              "Kosovo"),
    "mk": ("macedonia",     "Macedonia del Nord",  "North Macedonia"),
    "rs": ("serbia",        "Serbia",              "Serbia"),
    "gr": ("grecia",        "Grecia",              "Greece"),
    "bg": ("bulgaria",      "Bulgaria",            "Bulgaria"),
    "tr": ("turchia",       "Turchia",             "Türkiye"),
    "ge": ("georgia",       "Georgia",             "Georgia"),
    "at": ("austria",       "Austria",             "Austria"),
    "ch": ("svizzera",      "Svizzera",            "Switzerland"),
    "fr": ("francia",       "Francia",             "France"),
    "de": ("germania",      "Germania",            "Germany"),
    "es": ("spagna",        "Spagna",              "Spain"),
    "pt": ("portogallo",    "Portogallo",          "Portugal"),
}


def flag_emoji(cc: str) -> str:
    if not cc or len(cc) != 2:
        return "🏳️"
    return "".join(chr(0x1F1E6 + ord(c) - ord("a")) for c in cc.lower())


def country_info(cc: str) -> tuple[str, str, str]:
    if cc in COUNTRIES:
        return COUNTRIES[cc]
    return (cc or "unknown", (cc or "Sconosciuto").upper(), (cc or "Unknown").upper())


def load_country_description(cc: str) -> str:
    """Legge diary/_country_XX.md e la converte in HTML (markdown).
    Ritorna stringa vuota se il file non esiste."""
    if not cc:
        return ""
    md_path = DIARY_DIR / f"_country_{cc.lower()}.md"
    if not md_path.exists():
        return ""
    raw = md_path.read_text(encoding="utf-8")
    if HAS_MARKDOWN:
        return md_lib.markdown(raw, extensions=["extra", "sane_lists"])
    import html as _html
    return "".join(f"<p>{_html.escape(p.strip())}</p>" for p in raw.split("\n\n") if p.strip())


def main():
    if not SUMMARY_PATH.exists():
        print(f"❌ {SUMMARY_PATH} non trovato. Esegui prima generate_summary.py.")
        return

    with SUMMARY_PATH.open("r", encoding="utf-8") as f:
        summary = json.load(f)

    days = summary.get("days", [])
    if not days:
        print("Nessuna tappa in summary.json.")
        return

    groups: dict[str, list] = defaultdict(list)
    for day in days:
        cc = (day.get("country_code") or "unknown").lower()
        groups[cc].append(day)

    countries = []
    for cc, cdays in groups.items():
        slug, name_it, name_en = country_info(cc)

        first_idx = days.index(cdays[0]) + 1
        last_idx = days.index(cdays[-1]) + 1
        first_date = cdays[0].get("date", "")
        last_date = cdays[-1].get("date", "")

        total_km = round(sum(d.get("distance_km") or 0 for d in cdays), 1)
        total_up = int(sum(d.get("elevation_up_m") or 0 for d in cdays))
        total_hours = round(sum(d.get("moving_time_h") or 0 for d in cdays), 1)

        description_html = load_country_description(cc)

        countries.append({
            "country_code": cc,
            "slug": slug,
            "name_it": name_it,
            "name_en": name_en,
            "flag": flag_emoji(cc),
            "days_count": len(cdays),
            "first_day_index": first_idx,
            "last_day_index": last_idx,
            "first_date": first_date,
            "last_date": last_date,
            "total_km": total_km,
            "total_elevation_m": total_up,
            "total_moving_h": total_hours,
            "description_html": description_html,
            "has_description": bool(description_html),
            "days": [
                {
                    "gpx_file": d.get("gpx_file"),
                    "date": d.get("date"),
                    "label": d.get("label"),
                    "distance_km": d.get("distance_km"),
                    "elevation_up_m": d.get("elevation_up_m"),
                    "moving_time_h": d.get("moving_time_h"),
                    "weather": d.get("weather"),
                    "day_index": days.index(d) + 1,
                }
                for d in cdays
            ],
        })

    countries.sort(key=lambda c: c["first_date"])

    out = {
        "generated_at": date_cls.today().isoformat(),
        "countries": countries,
    }

    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Scritto {OUTPUT_PATH}")
    print(f"   {len(countries)} nazioni, {sum(c['days_count'] for c in countries)} tappe totali\n")
    for c in countries:
        desc = "✓" if c["has_description"] else "—"
        print(f"   {c['flag']}  {c['name_it']:24s}  {c['days_count']:2d} tappe  "
              f"{c['total_km']:7.1f} km  descrizione: {desc}")


if __name__ == "__main__":
    main()
