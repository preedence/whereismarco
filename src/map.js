// Percorsi relativi alla pagina index.html (che ora è in root)
const MAP_STYLE_URL = "styles/map-style.json";
const POSITIONS_URL = "data/positions.geojson";

// Centro iniziale (Milano) e zoom di partenza
const INITIAL_CENTER = [9.19, 45.4642];
const INITIAL_ZOOM = 4;

// Riepilogo per data (riempito da loadSummary)
let summaryByDate = {};

// Inizializza la mappa MapLibre
const map = new maplibregl.Map({
  container: "map",
  style: MAP_STYLE_URL,
  center: INITIAL_CENTER,
  zoom: INITIAL_ZOOM,
});

// Aggiorna UI info (al momento non usata, ma tenuta per estensioni future)
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

  // Sorgente per i punti di fine giornata
  map.addSource("day-ends", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [],
    },
  });

  // Cerchietti fine giornata
  map.addLayer({
    id: "day-end-points",
    type: "circle",
    source: "day-ends",
    paint: {
      "circle-radius": 10,
      "circle-color": "#38536b", // blu/steel
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });

  // Numeri sopra i cerchi fine giornata
  map.addLayer(
    {
      id: "day-end-labels",
      type: "symbol",
      source: "day-ends",
      layout: {
        "text-field": ["to-string", ["get", "dayIndex"]],
        "text-size": 14,
        "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        "text-anchor": "center",
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 2,
      },
    },
    "live-point" // sotto il punto live, sopra la traccia
  );

  // Popup con riepilogo giornata sui pallini di fine tappa
  const dayEndPopup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
  });

  function showDayEndPopup(e) {
    const f = e.features && e.features[0];
    if (!f) return;
    const html =
      f.properties && f.properties.summary_html
        ? f.properties.summary_html
        : `<strong>Giorno ${f.properties?.dayIndex || ""}</strong>`;
    map.getCanvas().style.cursor = "pointer";
    dayEndPopup.setLngLat(f.geometry.coordinates).setHTML(html).addTo(map);
  }

  function hideDayEndPopup() {
    map.getCanvas().style.cursor = "";
    dayEndPopup.remove();
  }

  map.on("mouseenter", "day-end-points", showDayEndPopup);
  map.on("mouseleave", "day-end-points", hideDayEndPopup);
  map.on("click", "day-end-points", showDayEndPopup);

  // Primo aggiornamento + refresh periodico
  updateData().catch((err) => {
    console.error(err);
    const s = document.getElementById("summary-content");
    if (s) s.textContent = "Errore caricamento dati";
  });

  // Carica il riepilogo (se esiste data/summary.json)
  loadSummary();

  // Carica marker foto geotaggate (se esiste data/photos.json)
  loadPhotos();

  setInterval(() => {
    updateData().catch((err) => console.error(err));
  }, 60000); // ogni 60 secondi
});

// Funzione che aggiorna traccia + punto live + punti fine giornata
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

  // Calcola i punti "fine giornata" con indice progressivo e riepilogo HTML
  const dayEnds = [];
  let lastDate = null;
  let currentLast = null;
  let dayCount = 0;

  for (const f of features) {
    const tsF = f.properties?.timestamp;
    const d = tsF ? tsF.slice(0, 10) : null; // "YYYY-MM-DD"
    if (d !== lastDate) {
      if (currentLast) {
        dayCount++;
        const clone = JSON.parse(JSON.stringify(currentLast));
        clone.properties = clone.properties || {};
        clone.properties.dayIndex = dayCount;

        const dateStr = clone.properties.timestamp
          ? clone.properties.timestamp.slice(0, 10)
          : null;
        const s = dateStr ? summaryByDate[dateStr] : null;
        if (s) {
          const dist =
            typeof s.distance_km === "number"
              ? s.distance_km.toFixed(1)
              : s.distance_km ?? "—";
          const up = s.elevation_up_m ?? "—";
          const time =
            typeof s.moving_time_h === "number"
              ? s.moving_time_h.toFixed(1)
              : s.moving_time_h ?? "—";

          clone.properties.summary_html = `
            <strong>${dateStr}</strong><br>
            ${s.label || ""}<br>
            ${dist} km, ↑ ${up} m, ${time} h
          `;
        }

        dayEnds.push(clone);
      }
      lastDate = d;
    }
    currentLast = f;
  }

  if (currentLast) {
    dayCount++;
    const clone = JSON.parse(JSON.stringify(currentLast));
    clone.properties = clone.properties || {};
    clone.properties.dayIndex = dayCount;

    const dateStr = clone.properties.timestamp
      ? clone.properties.timestamp.slice(0, 10)
      : null;
    const s = dateStr ? summaryByDate[dateStr] : null;
    if (s) {
      const dist =
        typeof s.distance_km === "number"
          ? s.distance_km.toFixed(1)
          : s.distance_km ?? "—";
      const up = s.elevation_up_m ?? "—";
      const time =
        typeof s.moving_time_h === "number"
          ? s.moving_time_h.toFixed(1)
          : s.moving_time_h ?? "—";

      clone.properties.summary_html = `
        <strong>${dateStr}</strong><br>
        ${s.label || ""}<br>
        ${dist} km, ↑
