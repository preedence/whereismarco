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

async function fetchPositions() {
  const url = `${POSITIONS_URL}?cache=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Impossibile caricare positions.geojson");
  }
  return res.json();
}

map.on("load", () => {
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
      "line-color": "#2563eb",
      "line-width": 4,
      "line-opacity": 0.9,
    },
  });

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

  map.loadImage("images/duomo.png", (error, image) => {
    if (error) {
      console.error("Errore caricamento icona Duomo:", error);
      return;
    }
    if (!map.hasImage("duomo")) {
      map.addImage("duomo", image);
    }

    map.addSource("duomo-start", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [9.1916, 45.4642],
            },
            properties: {},
          },
        ],
      },
    });

    map.addLayer({
      id: "duomo-start-layer",
      type: "symbol",
      source: "duomo-start",
      layout: {
        "icon-image": "duomo",
        "icon-size": 0.08,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });

    let duomoEnlarged = false;

    function updateDuomoSize() {
      const z = map.getZoom();
      const size = z >= 10 ? 0.16 : 0.08;
      map.setLayoutProperty("duomo-start-layer", "icon-size", size);
    }

    updateDuomoSize();

    map.on("click", "duomo-start-layer", () => {
      if (!duomoEnlarged) {
        duomoEnlarged = true;
        map.setLayoutProperty("duomo-start-layer", "icon-size", 0.15);
        map.flyTo({
          center: [9.1916, 45.4642],
          zoom: Math.max(map.getZoom(), 14),
        });
      } else {
        duomoEnlarged = false;
        updateDuomoSize();
      }
    });

    map.on("zoomend", () => {
      const z = map.getZoom();
      if (z < 10) {
        duomoEnlarged = false;
        map.setLayoutProperty("duomo-start-layer", "icon-size", 0.08);
      } else if (!duomoEnlarged) {
        updateDuomoSize();
      }
    });

    map.on("zoom", () => {
      if (!duomoEnlarged) {
        updateDuomoSize();
      }
    });

    map.on("mouseenter", "duomo-start-layer", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "duomo-start-layer", () => {
      map.getCanvas().style.cursor = "";
    });
  });

  updateData().catch((err) => {
    console.error(err);
    const s = document.getElementById("summary-content");
    if (s) s.textContent = "Errore caricamento dati";
  });

    loadSummary();
    loadPhotos();

    setInterval(() => {
      updateData().catch((err) => console.error(err));
    }, 60000);
});

async function updateData() {
  const geo = await fetchPositions();

  if (!geo || !geo.features || !geo.features.length) {
    const s = document.getElementById("summary-content");
    if (s) s.textContent = "Nessuna posizione ancora.";
    return;
  }

  const features = geo.features;

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

  const last = features[features.length - 1];
  const [lon, lat] = last.geometry.coordinates;
  const ts = last.properties?.timestamp || "";

  let state = "riding";
  const msgType = (last.properties?.type || "").toUpperCase();

  if (msgType === "CUSTOM") {
    state = "camp";
  } else if (msgType === "OK") {
    state = "indoors";
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
        const R
