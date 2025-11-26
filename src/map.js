// Stili cartografici disponibili (relativi a index.html)
const MAP_STYLES = {
  classic: "styles/map-style.json",
  terrain: "styles/map-style-terrain.json"
};

let currentStyle = "classic";

const POSITIONS_URL = "data/positions.geojson";

// Centro iniziale e zoom di partenza
const INITIAL_CENTER = [9.19, 45.4642];
const INITIAL_ZOOM = 4;

// Riepilogo per data (riempito da loadSummary)
let summaryByDate = {};

// Popup per i fine tappa (deve essere accessibile da installLayers)
const dayEndPopup = new maplibregl.Popup({
  closeButton: false,
  closeOnClick: false
});

// Inizializza la mappa MapLibre
const map = new maplibregl.Map({
  container: "map",
  style: MAP_STYLES[currentStyle],
  center: INITIAL_CENTER,
  zoom: INITIAL_ZOOM
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

// Carica dati dal GeoJSON generato (positions.geojson)
async function fetchPositions() {
  const url = `${POSITIONS_URL}?cache=${Date.now()}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Impossibile caricare positions.geojson");
  }
  return res.json();
}

// Handler popup giorno (definiti una volta sola)
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

// Aggiunge (se mancano) le sorgenti/layer personalizzati sulla mappa corrente
function installLayers() {
  const style = map.getStyle();
  if (!style) return;

  // Traccia
  if (!map.getSource("track")) {
    map.addSource("track", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });

    map.addLayer({
      id: "track-line",
      type: "line",
      source: "track",
      layout: {
        "line-join": "round",
        "line-cap": "round"
      },
      paint: {
        "line-color": "#d2b574", // ocra
        "line-width": 4,
        "line-opacity": 0.9
      }
    });
  }

  // Punto live
  if (!map.getSource("live")) {
    map.addSource("live", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });

    map.addLayer({
      id: "live-point",
      type: "circle",
      source: "live",
      paint: {
        "circle-radius": 8,
        "circle-color": "#c66a3a", // ruggine
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2
      }
    });
  }

  // Fine giornata
  if (!map.getSource("day-ends")) {
    map.addSource("day-ends", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });

    map.addLayer({
      id: "day-end-points",
      type: "circle",
      source: "day-ends",
      paint: {
        "circle-radius": 10,
        "circle-color": "#38536b", // blu/steel
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2
      }
    });
  }

  if (!map.getLayer("day-end-labels")) {
    map.addLayer(
      {
        id: "day-end-labels",
        type: "symbol",
        source: "day-ends",
        layout: {
          "text-field": ["to-string", ["get", "dayIndex"]],
          "text-size": 14,
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
          "text-anchor": "center"
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#000000",
          "text-halo-width": 2
        }
      },
      "live-point"
    );
  }

  // Ricollega gli handler popup (li stacchiamo/riattacchiamo ad ogni cambio style)
  map.off("mouseenter", "day-end-points", showDayEndPopup);
  map.off("mouseleave", "day-end-points", hideDayEndPopup);
  map.off("click", "day-end-points", showDayEndPopup);

  map.on("mouseenter", "day-end-points", showDayEndPopup);
  map.on("mouseleave", "day-end-points", hideDayEndPopup);
  map.on("click", "day-end-points", showDayEndPopup);
}

// Setup iniziale
map.on("load", () => {
  installLayers();

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

// Funzione che aggiorna traccia + punto live + punti fine giornata
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
          coordinates: features.map((f) => f.geometry.coordinates)
        },
        properties: {}
      }
    ]
  };

  const last = features[features.length - 1];
  const [lon, lat] = last.geometry.coordinates;
  const ts = last.properties?.timestamp || "";

  const dayEnds = [];
  let lastDate = null;
  let currentLast = null;
  let dayCount = 0;

  for (const f of features) {
    const tsF = f.properties?.timestamp;
    const d = tsF ? tsF.slice(0, 10) : null;
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
        ${dist} km, ↑ ${up} m, ${time} h
      `;
    }

    dayEnds.push(clone);
  }

  if (map.getSource("track")) {
    map.getSource("track").setData(trackFeature);
  }
  if (map.getSource("live")) {
    map.getSource("live").setData({
      type: "FeatureCollection",
      features: [last]
    });
  }
  if (map.getSource("day-ends")) {
    map.getSource("day-ends").setData({
      type: "FeatureCollection",
      features: dayEnds
    });
  }

  updateInfo(lat, lon, ts);

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
      [maxLon, maxLat]
    ],
    {
      padding: 50,
      maxZoom: 8,
      duration: 800
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

    summaryByDate = {};
    days.forEach((d) => {
      if (d.date) {
        summaryByDate[d.date] = d;
      }
    });

    const totalDays = days.length;
    const totalKm = days.reduce(
      (sum, d) => sum + (typeof d.distance_km === "number" ? d.distance_km : 0),
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

    let longest = null;
    for (const d of days) {
      if (
        typeof d.distance_km === "number" &&
        (!longest || d.distance_km > longest.distance_km)
      ) {
        longest = d;
      }
    }

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
        longestEl.textContent = `${longest.date} – ${
          longest.label || ""
        } (${distStr} km)`;
      } else {
        longestEl.textContent = "—";
      }
    }

    const rows = days
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

        return `
          <tr>
            <td>${d.date}</td>
            <td>${d.label || ""}</td>
            <td style="text-align:right;">${dist}</td>
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

// Carica foto geotaggate da data/photos.json e aggiunge marker con popup
async function loadPhotos() {
  try {
    const res = await fetch("data/photos.json?cache=" + Date.now());
    if (!res.ok) {
      return;
    }
    const data = await res.json();
    if (!data.photos || !data.photos.length) {
      return;
    }

    data.photos.forEach((p) => {
      if (typeof p.lon !== "number" || typeof p.lat !== "number") return;

      const popupHtml = `
        <div style="max-width:220px;">
          <strong>${p.title || "Foto"}</strong><br>
          <img src="${p.file}" style="width:100%;margin-top:6px;border-radius:4px;">
          ${
            p.caption
              ? `<div style="margin-top:6px;font-size:12px;">${p.caption}</div>`
              : ""
          }
        </div>
      `;

      const popup = new maplibregl.Popup({ offset: 20 }).setHTML(popupHtml);

      new maplibregl.Marker({ color: "#c66a3a" })
        .setLngLat([p.lon, p.lat])
        .setPopup(popup)
        .addTo(map);
    });
  } catch (err) {
    console.error("Errore nel caricamento delle foto:", err);
  }
}

// Switch stile mappa (Classic / Terrain)
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".style-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-style");
      if (!key || !MAP_STYLES[key] || key === currentStyle) return;

      currentStyle = key;

      // Quando il nuovo style è pronto, reinstallo layer e ricarico dati
      map.once("styledata", () => {
        installLayers();
        updateData().catch((err) => console.error(err));
      });

      map.setStyle(MAP_STYLES[currentStyle]);
    });
  });
});
