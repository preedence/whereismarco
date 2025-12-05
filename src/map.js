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
  // Pulisci le varianti precedenti
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
    // default: in movimento
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

  // Layer cerchio live (nascosto, usiamo avatar)
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
    "live-point"
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
        : `Giorno ${f.properties?.dayIndex || ""}`;
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

  // Sorgente per le foto
  map.addSource("photos", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [],
    },
  });

  map.addLayer({
    id: "photo-points",
    type: "circle",
    source: "photos",
    paint: {
      "circle-radius": 5,
      "circle-color": "#f97316",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
    },
  });

  // 🔥 DUOMO CORRETTO: ora torna piccolo al riclick e zoom out
  map.loadImage("images/duomo.png", (error, image) => {
    if (error) {
      console.error("Errore caricamento icona Duomo:", error);
      return;
    }
    if (!map.hasImage("duomo")) {
      map.addImage("duomo", image);
    }

    // Sorgente GeoJSON per il Duomo
    map.addSource("duomo-start", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [9.1916, 45.4642], // Duomo di Milano
            },
            properties: {},
          },
        ],
      },
    });

    // Layer simbolo del Duomo
    map.addLayer({
      id: "duomo-start-layer",
      type: "symbol",
      source: "duomo-start",
      layout: {
        "icon-image": "duomo",
        "icon-size": 0.08,     // Inizialmente PICCOLO
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });

    // 🆕 VARIABILE STATO per tracciare se è ingrandito
    let isDuomoEnlarged = false;

    // 🆕 Funzione centralizzata per dimensioni corrette
    function updateDuomoSize() {
      const z = map.getZoom();
      if (isDuomoEnlarged && z >= 10) {
        map.setLayoutProperty("duomo-start-layer", "icon-size", 0.15);
      } else {
        // RESET: piccolo se zoom out OPPURE non ingrandito
        map.setLayoutProperty("duomo-start-layer", "icon-size", z >= 10 ? 0.16 : 0.08);
      }
    }

    // 🆕 CLICK TOGGLE: ingrandisci/rimpicciolisci
    map.on("click", "duomo-start-layer", () => {
      isDuomoEnlarged = !isDuomoEnlarged; // Inverti stato
      
      if (isDuomoEnlarged) {
        // PRIMO CLICK → INGANDISCI + flyTo
        map.setLayoutProperty("duomo-start-layer", "icon-size", 0.15);
        map.flyTo({
          center: [9.1916, 45.4642],
          zoom: Math.max(map.getZoom(), 14),
        });
      } else {
        // SECONDO CLICK → TORNA NORMALE
        updateDuomoSize();
      }
    });

    // 🆕 ZOOM END: reset se zoom out sotto 10
    map.on("zoomend", () => {
      const z = map.getZoom();
      if (z < 10) {
        isDuomoEnlarged = false;
        map.setLayoutProperty("duomo-start-layer", "icon-size", 0.08);
      }
    });

    // 🆕 ZOOM REALE TIME: aggiorna durante lo zoom
    map.on("zoom", () => {
      updateDuomoSize();
    });

    // Hover cursor
    map.on("mouseenter", "duomo-start-layer", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "duomo-start-layer", () => {
      map.getCanvas().style.cursor = "";
    });
  });

  // Primo aggiornamento + refresh periodico
  updateData().catch((err) => {
    console.error(err);
    const s = document.getElementById("summary-content");
    if (s) s.textContent = "Errore caricamento dati";
  });

  // Riepilogo (summary.json)
  loadSummary();

  // Foto geotaggate (photos.json)
  loadPhotos();

  setInterval(() => {
    updateData().catch((err) => console.error(err));
  }, 60000); // ogni 60 secondi
});

// [resto del file IDENTICO - funzioni updateData, loadSummary, loadPhotos]
async function updateData() {
  const geo = await fetchPositions();

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

  // ---------- Determina lo stato per l'avatar ----------
  let state = "riding";
  const msgType = (last.properties?.type || "").toUpperCase();

  if (msgType === "CUSTOM") {
    state = "camp"; // tenda
  } else if (msgType === "OK") {
    state = "indoors"; // casa/hotel/B&B
  } else if (msgType === "UNLIMITED-TRACK") {
    const WINDOW_MIN = 15;
    const MIN_MOVE_METERS = 50;

    let isOld = false;
    if (ts) {
      const tLast = new Date(ts).getTime();
      const now = Date.now();
      const diffMin = (now - tLast) / 60000;
      isOld = diffMin > WINDOW_MIN;
    }

    if (isOld) {
      state = "stopped";
    } else {
      const recentPoints = [];
      const nowMs = Date.now();

      for (let i = features.length - 1; i >= 0; i--) {
        const f = features[i];
        const pts = f.properties?.timestamp;
        if (!pts) continue;
        const t = new Date(pts).getTime();
        const diffMin = (nowMs - t) / 60000;
        if (diffMin <= WINDOW_MIN) {
          recentPoints.push(f);
        } else {
          break;
        }
      }

      let totalDist = 0;

      function haversineMeters(c1, c2) {
        const R = 6371000;
        const toRad = (d) => (d * Math.PI) / 180;
        const [lon1, lat1] = c1;
        const [lon2, lat2] = c2;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      }

      if (recentPoints.length >= 2) {
        for (let i = 1; i < recentPoints.length; i++) {
          const cPrev = recentPoints[i - 1].geometry.coordinates;
          const cCur = recentPoints[i].geometry.coordinates;
          totalDist += haversineMeters(cPrev, cCur);
        }
      }

      if (totalDist < MIN_MOVE_METERS) {
        state = "stopped";
      } else {
        state = "riding";
      }
    }
  }
  // ---------- fine determinazione stato ----------

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
          const up = s.elevation_up_m ?? "—
