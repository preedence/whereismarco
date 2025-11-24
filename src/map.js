// Percorsi relativi alla pagina index.html (che ora è in root)
const MAP_STYLE_URL = "styles/map-style.json";
const POSITIONS_URL = "data/positions.geojson";

// Centro iniziale (Milano) e zoom di partenza
const INITIAL_CENTER = [9.19, 45.4642];
const INITIAL_ZOOM = 4;

// Inizializza la mappa MapLibre
const map = new maplibregl.Map({
  container: "map",
  style: MAP_STYLE_URL,
  center: INITIAL_CENTER,
  zoom: INITIAL_ZOOM,
});

// Aggiorna UI info
function updateInfo(lat, lon, timestamp) {
  const posEl = document.getElementById("last-pos");
  const timeEl = document.getElementById("last-time");

  if (!posEl || !timeEl) {
    return;
  }

  posEl.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  timeEl.textContent = timestamp || "—";
}

// Carica dati dal GeoJSON generato (positions.geojson)
async function fetchPositions() {
  const url = `${POSITIONS_URL}?cache=${Date.now()}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Impossibile caricare positions.geojson");
  }
  return res.json();
}

// Dopo che lo stile è caricato, aggiungo sorgenti e layer
map.on("load", () => {
  // Sorgente per la traccia (linea)
  map.addSource("track", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [],
    },
  });

  map.addLayer({
    id: "track-line",
    type: "line",
    source: "track",
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint: {
      "line-color": "#d2b574", // ocra
      "line-width": 4,
      "line-opacity": 0.9,
    },
  });

  // Sorgente per il punto live
  map.addSource("live", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [],
    },
  });

  map.addLayer({
    id: "live-point",
    type: "circle",
    source: "live",
    paint: {
      "circle-radius": 8,
      "circle-color": "#c66a3a", // ruggine
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });

  // Primo aggiornamento + refresh periodico
  updateData().catch((err) => {
    console.error(err);
    const s = document.getElementById("summary-content");
    if (s) s.textContent = "Errore caricamento dati";
  });

  // Carica il riepilogo (se esiste data/summary.json)
  loadSummary();

  setInterval(() => {
    updateData().catch((err) => console.error(err));
  }, 60000); // ogni 60 secondi
});

// Funzione che aggiorna traccia + punto live
async function updateData() {
  const geo = await fetchPositions();

  // Ci aspettiamo un FeatureCollection con punti ordinati cronologicamente
  if (!geo || !geo.features || !geo.features.length) {
    const s = document.getElementById("summary-content");
    if (s) s.textContent = "Nessuna posizione ancora.";
    return;
  }

  const features = geo.features;

  // Costruisci la LineString per la traccia
  const trackFeature = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: features.map((f) => f.geometry.coordinates),
        },
        properties: {},
      },
    ],
  };

  // Ultimo punto (più recente)
  const last = features[features.length - 1];
  const [lon, lat] = last.geometry.coordinates;
  const ts = last.properties?.timestamp || "";

  // Aggiorna sorgenti sulla mappa
  map.getSource("track").setData(trackFeature);
  map.getSource("live").setData({
    type: "FeatureCollection",
    features: [last],
  });

  // Aggiorna coordinate e timestamp nel pannello
  updateInfo(lat, lon, ts);

  // Opzionale: centra la mappa sull'ultima posizione
  map.flyTo({
    center: [lon, lat],
    zoom: 7,
    speed: 0.8,
    curve: 1.4,
  });
}

// Carica il riepilogo da data/summary.json e popola il pannello
async function loadSummary() {
  const el = document.getElementById("summary-content");
  if (!el) return;

  try {
    const res = await fetch("data/summary.json?cache=" + Date.now());
    if (!res.ok) {
      el.textContent = "Nessun riepilogo disponibile.";
      return;
    }

    const data = await res.json();
    if (!data.days || !data.days.length) {
      el.textContent = "Nessuna tappa ancora.";
      return;
    }

    const rows = data.days
      .map((d) => {
        const dist = d.distance_km?.toFixed
          ? d.distance_km.toFixed(1)
          : d.distance_km;
        const up = d.elevation_up_m ?? "—";
        const time = d.moving_time_h?.toFixed
          ? d.moving_time_h.toFixed(1)
          : d.moving_time_h ?? "—";

        return `
          <tr>
            <td>${d.date}</td>
            <td>${d.label || ""}</td>
            <td style="text-align:right;">${dist ?? "—"}</td>
            <td style="text-align:right;">${up}</td>
            <td style="text-align:right;">${time}</td>
          </tr>
        `;
      })
      .join("");

    el.innerHTML = `
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr>
            <th style="text-align:left;">Data</th>
            <th style="text-align:left;">Tappa</th>
            <th style="text-align:right;">km</th>
            <th style="text-align:right;">↑ m</th>
            <th style="text-align:right;">h</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error(err);
    el.textContent = "Errore nel caricamento del riepilogo.";
  }
}
