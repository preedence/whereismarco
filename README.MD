# Milano → Tokyo Live Map

Repo per il tracking live del viaggio in bicicletta Milano → Tokyo.
Contiene una pagina statica (GitHub Pages) che legge `data/positions.geojson`
(evidenza posizione SPOT), e script + workflows per aggiornare automaticamente.

Struttura:
- `src/` → frontend (index.html, map.js, style.css)
- `data/` → positions.geojson (aggiornato dalle Actions)
- `scripts/` → script Python per fetch SPOT e generazione summary da GPX
- `.github/workflows/` → GitHub Actions (polling SPOT, generazione summary)

Vedi i file sotto `scripts/` per configurare il feed SPOT.
