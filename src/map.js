// Percorsi relativi alla pagina index.html (che ora è in root)
const MAP_STYLE_URL = "styles/map-style.json";
const POSITIONS_URL = "data/positions.geojson";

// Centro iniziale e zoom di partenza
const INITIAL_CENTER = [9.19, 45.4642];
const INITIAL_ZOOM = 4;

// Riepilogo per data (riempito da loadSummary)
let summaryByDate = {};

// Marker avatar live
let liveAvatarMarker = null;

// Inizializza la mappa MapLibre
const map = new maplibregl.Map({
  container: "map",
  style: MAP_STYLE_URL,
  center: INITIAL_CENTER,
  zoom: INITIAL_ZOOM,
});

// Aggiorna UI info (al momento non usata)
function updateInfo(lat, lon, timestamp) {
  const posEl = document.getElementById("last-pos");
  const timeEl = document.getElementById("last-time");
  if (!posEl || !timeEl) {
    return;
  }
  posEl.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  timeEl.textContent = timestamp || "—";
}

// Aggiorna/crea l'avatar live con stato
function updateLiveAvatar(lon, lat, state) {
  if (!liveAvatarMarker) {
    const el = document.createElement("div");
    el.className = "wm-live-avatar";
    liveAvatarMarker = new maplibregl.Marker({ element: el })
      .setLngLat([lon, lat])
      .addTo(map);
  } else {
    liveAvatarMarker.setLngLat([lon, lat]);
  }

  const el = liveAvatarMarker.getElement();
  el.classList.remove(
    "wm-live-avatar--riding",
    "wm-live-avatar--stopped",
    "wm-live-avatar--camp",
    "wm-live-avatar--indoors"
  );

  if (state === "camp") {
    el.classList.add("wm-live-avatar--camp");
  } else if (state === "indoors") {
    el.classList.add("wm-live-avatar--indoors");
  } else if (state === "stopped") {
    el.classList.add("wm-live-avatar--stopped");
  } else {
    el.classList.add("wm-live-avatar--riding");
  }
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
      "line-color": "#d2b574",
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
      "circle-radius": 0,
      "circle-color": "#c66a3a",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 0,
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

  map.addLayer({
    id: "day-end-points",
    type: "circle",
    source: "day-ends",
    paint: {
      "circle-radius": 10,
      "circle-color": "#38536b",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });

  map.addLayer({
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
  }, "live-point");

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
        : `Giorno
