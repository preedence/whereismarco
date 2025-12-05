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

  // Marker fisso di partenza (Duomo di Milano)
  const startEl = document.createElement("div");
  startEl.className = "wm-start-marker";

  const startMarker = new maplibregl.Marker({ element: startEl })
    .setLngLat([9.1916, 45.4642]) // Duomo di Milano
    .addTo(map);

  // Ingrandisci/riduci in base allo zoom (forza stile inline)
  function updateStartMarkerSize() {
    const z = map.getZoom();
    if (z >= 10) {
      startEl.classList.add("wm-start-marker--large");
      startEl.style.transform = "scale(2.2)";
      startEl.style.zIndex = "1000";
    } else {
      startEl.classList.remove("wm-start-marker--large");
      startEl.style.transform = "scale(1)";
      startEl.style.zIndex = "";
    }
  }

  // Aggiorna subito e ad ogni cambio di zoom
  updateStartMarkerSize();
  map.on("zoom", updateStartMarkerSize);

  // Ingrandisci al click e centra la mappa (forza stile inline)
  startEl.addEventListener("click", () => {
    startEl.classList.add("wm-start-marker--large");
    startEl.style.transform = "scale(2.2)";
    startEl.style.zIndex = "1000";
    map.easeTo({
      center: [9.1916, 45.4642],
      zoom: Math.max(map.getZoom(), 12),
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

// Funzione che aggiorna traccia + punto live + punti fine giornata
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
    // Parametri configurabili
    const WINDOW_MIN = 15;
    const MIN_MOVE_METERS = 50;

    // Età dell'ultimo ping
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
      // Distanza percorsa negli ultimi WINDOW_MIN minuti
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
        const dLon = toRad(lat2 - lon1);
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
          const up = s.elevation_up_m ?? "—";
          const time =
            typeof s.moving_time_h === "number"
              ? s.moving_time_h.toFixed(1)
              : s.moving_time_h ?? "—";

          const niceLabel = (s.label || "").replace(/_/g, " ");

          clone.properties.summary_html = `
  <div class="wm-popup-day">
    <div class="wm-popup-day-title">
      <span class="wm-popup-day-date">${dateStr}</span>
      ${
        niceLabel
          ? ` – <span class="wm-popup-day-label">${niceLabel}</span>`
          : ""
      }
    </div>
    <div class="wm-popup-day-meta">
      ${dist} km, ↑ ${up} m, ${time} h
    </div>
  </div>
`;
        }

        dayEnds.push(clone);
      }
      lastDate = d;
    }
    currentLast = f;
  }

  // Chiudi l'ultima giornata
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

      const niceLabel = (s.label || "").replace(/_/g, " ");

      clone.properties.summary_html = `
  <div class="wm-popup-day">
    <div class="wm-popup-day-title">
      <span class="wm-popup-day-date">${dateStr}</span>
      ${
        niceLabel
          ? ` – <span class="wm-popup-day-label">${niceLabel}</span>`
          : ""
      }
    </div>
    <div class="wm-popup-day-meta">
      ${dist} km, ↑ ${up} m, ${time} h
    </div>
  </div>
`;
    }

    dayEnds.push(clone);
  }

  // Aggiorna sorgenti sulla mappa
  map.getSource("track").setData(trackFeature);
  map.getSource("live").setData({
    type: "FeatureCollection",
    features: [last],
  });
  map.getSource("day-ends").setData({
    type: "FeatureCollection",
    features: dayEnds,
  });

  updateInfo(lat, lon, ts);
  updateLiveAvatar(lon, lat, state);

  // Adatta la mappa per mostrare l'intero percorso
  const coords = features.map((f) => f.geometry.coordinates);
  let minLon = coords[0][0];
  let maxLon = coords[0][0];
  let minLat = coords[0][1];
  let maxLat = coords[0][1];

  for (const [cLon, cLat] of coords) {
    if (cLon < minLon) minLon = cLon;
    if (cLon > maxLon) maxLon = cLon;
    if (cLat < minLat) minLat = cLat;
    if (cLat > maxLat) maxLat = cLat;
  }

  map.fitBounds(
    [
      [minLon, minLat],
      [maxLon, maxLat],
    ],
    {
      padding: 50,
      maxZoom: 8,
      duration: 800,
    }
  );
}

// Carica il riepilogo da data/summary.json e popola pannello + totali
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

    const days = data.days;

    // Mappa date -> oggetto riepilogo per collegare tappe ai pallini
    summaryByDate = {};
    days.forEach((d) => {
      if (d.date) {
        summaryByDate[d.date] = d;
      }
    });

    // Calcolo totali
    const totalDays = days.length;
    const totalKm = days.reduce(
      (sum, d) =>
        sum + (typeof d.distance_km === "number" ? d.distance_km : 0),
      0
    );
    const totalUp = days.reduce(
      (sum, d) =>
        sum + (typeof d.elevation_up_m === "number" ? d.elevation_up_m : 0),
      0
    );
    const totalHours = days.reduce(
      (sum, d) =>
        sum + (typeof d.moving_time_h === "number" ? d.moving_time_h : 0),
      0
    );
    const avgKmDay = totalDays > 0 ? totalKm / totalDays : 0;
    const avgSpeed = totalHours > 0 ? totalKm / totalHours : 0;

    // Giorno più lungo per distanza
    let longest = null;
    for (const d of days) {
      if (
        typeof d.distance_km === "number" &&
        (!longest || d.distance_km > longest.distance_km)
      ) {
        longest = d;
      }
    }

    // Aggiorna i numeri nel blocco info (se esistono)
    const daysEl = document.getElementById("total-days");
    const kmEl = document.getElementById("total-km");
    const upEl = document.getElementById("total-up");
    const hoursEl = document.getElementById("total-hours");
    const avgKmEl = document.getElementById("avg-km-day");
    const avgSpeedEl = document.getElementById("avg-speed");
    const longestEl = document.getElementById("longest-day");

    if (daysEl) daysEl.textContent = totalDays.toString();
    if (kmEl) kmEl.textContent = totalKm.toFixed(1);
    if (upEl) upEl.textContent = Math.round(totalUp).toString();
    if (hoursEl) hoursEl.textContent = totalHours.toFixed(1);
    if (avgKmEl) avgKmEl.textContent = avgKmDay.toFixed(1);
    if (avgSpeedEl) avgSpeedEl.textContent = avgSpeed.toFixed(1);
    if (longestEl) {
      if (longest) {
        const distStr =
          typeof longest.distance_km === "number"
            ? longest.distance_km.toFixed(1)
            : longest.distance_km;

        const rawLongestLabel = longest.label || "";
        const niceLongestLabel = rawLongestLabel.replace(/_/g, " ");

        longestEl.textContent = `${longest.date} – ${niceLongestLabel} (${distStr} km)`;
      } else {
        longestEl.textContent = "—";
      }
    }

    // Riepilogo formattato in HTML
    const itemsHtml = days
      .map((d) => {
        const dist =
          typeof d.distance_km === "number"
            ? d.distance_km.toFixed(1)
            : d.distance_km ?? "—";
        const up = d.elevation_up_m ?? "—";
        const time =
          typeof d.moving_time_h === "number"
            ? d.moving_time_h.toFixed(1)
            : d.moving_time_h ?? "—";

        const rawLabel = d.label || "";
        const niceLabel = rawLabel.replace(/_/g, " ");

        const date = d.date || "—";

        return `
          <div class="wm-day-row">
            <div class="wm-day-title">
              <span class="wm-day-date">${date}</span>
              ${
                niceLabel
                  ? ` – <span class="wm-day-label">${niceLabel}</span>`
                  : ""
              }
            </div>
            <div class="wm-day-meta">
              ${dist} km, ↑ ${up} m, ${time} h
            </div>
          </div>
        `;
      })
      .join("");

    el.innerHTML = itemsHtml;
  } catch (err) {
    console.error(err);
    el.textContent = "Errore caricamento riepilogo.";
  }
}

// Foto geotaggate da data/photos.json e marker/popup sulla mappa
async function loadPhotos() {
  try {
    const res = await fetch("data/photos.json?cache=" + Date.now());
    if (!res.ok) {
      return; // niente file, niente foto
    }
    const data = await res.json();

    if (!data.photos || !data.photos.length) {
      return;
    }

    const features = [];

    data.photos.forEach((p) => {
      if (typeof p.lon !== "number" || typeof p.lat !== "number") return;

      const title = p.title || "Foto";
      const caption = p.caption || "";
      const file = p.file || p.url || "";

      const popupHtml = `
  <div class="wm-photo-popup" style="max-width:220px;">
    <strong>${title}</strong><br>
    ${
      file
        ? `<img src="${file}" alt="${title}" style="width:100%;margin-top:6px;border-radius:4px;">`
        : ""
    }
    ${
      caption
        ? `<div style="margin-top:6px;font-size:12px;">${caption}</div>`
        : ""
    }
  </div>
`;

      const popup = new maplibregl.Popup({ offset: 20 }).setHTML(popupHtml);

      new maplibregl.Marker({ color: "#c66a3a" })
        .setLngLat([p.lon, p.lat])
        .setPopup(popup)
        .addTo(map);

      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [p.lon, p.lat],
        },
        properties: {
          title,
          caption,
          file,
        },
      });
    });

    if (map.getSource("photos")) {
      map.getSource("photos").setData({
        type: "FeatureCollection",
        features,
      });
    }
  } catch (err) {
    console.error("Errore nel caricamento delle foto:", err);
  }
}
