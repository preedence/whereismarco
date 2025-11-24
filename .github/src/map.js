// map.js — dipende da MapLibre GL
const MAP_STYLE = '/styles/map-style.json';
const POS_URL = '/data/positions.geojson';

const map = new maplibregl.Map({
  container: 'map',
  style: MAP_STYLE,
  center: [9.19, 45.4642],
  zoom: 4
});

map.on('load', () => {
  // sorgente e layer per la traccia
  map.addSource('track', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'track-line',
    type: 'line',
    source: 'track',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#d2b574', 'line-width': 4, 'line-opacity': 0.9 }
  });

  // source & layer per marker live
  map.addSource('live', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'live-point',
    type: 'circle',
    source: 'live',
    paint: {
      'circle-radius': 8,
      'circle-color': '#c66a3a',
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 2
    }
  });

  // prima fetch
  updateData();
  // refresh ogni 60s
  setInterval(updateData, 60000);
});

async function updateData() {
  try {
    const res = await fetch(POS_URL + '?_=' + Date.now());
    if (!res.ok) throw new Error('Impossibile recuperare positions.geojson');
    const geo = await res.json();

    // aggiorna traccia se presente
    const trackFeature = {
      type: 'FeatureCollection',
      features: []
    };

    if (geo.features && geo.features.length) {
      // assume: punti ordinati da vecchi a nuovi
      trackFeature.features = [{
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: geo.features.map(f => f.geometry.coordinates)
        }
      }];

      // ultimo punto
      const last = geo.features[geo.features.length - 1];
      map.getSource('live').setData({
        type: 'FeatureCollection',
        features: [last]
      });

      map.getSource('track').setData(trackFeature);

      const coords = last.geometry.coordinates;
      document.getElementById('lastpos').innerText = coords[1].toFixed(5) + ', ' + coords[0].toFixed(5);
      document.getElementById('lasttime').innerText = last.properties.timestamp || '—';
      // opzionale: centra la mappa sul marker se vuoi
      // map.flyTo({ center: coords, zoom: 7 });
    } else {
      document.getElementById('summary-content').innerText = 'Nessuna posizione ancora.';
    }
  } catch (err) {
    console.error(err);
    document.getElementById('summary-content').innerText = 'Errore caricamento dati';
  }
}
