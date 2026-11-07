/* ============================================================
 *  JOURNEY — carica data/summary.json e renderizza il blog
 *  Usa window.t / fmtDate / fmtNum da src/i18n.js
 * ============================================================ */
(function () {
  // ─── Meteo: WMO code → emoji ───
  function weatherIcon(code) {
    if (code == null) return '🌡️';
    if (code === 0) return '☀️';
    if (code === 1) return '🌤️';
    if (code === 2) return '⛅';
    if (code === 3) return '☁️';
    if (code === 45 || code === 48) return '🌫️';
    if (code >= 51 && code <= 57) return '🌦️';
    if (code >= 61 && code <= 67) return '🌧️';
    if (code >= 71 && code <= 77) return '🌨️';
    if (code >= 80 && code <= 82) return '🌧️';
    if (code >= 85 && code <= 86) return '🌨️';
    if (code >= 95) return '⛈️';
    return '🌡️';
  }

  function safeDate(iso) {
    return (window.fmtDate ? window.fmtDate(iso) : iso) || '—';
  }

  function num(n, digits) {
    return window.fmtNum ? window.fmtNum(Number(n), digits ?? 0) : String(n);
  }

  function pageForDay(index) {
    // 01..55 — indice progressivo, coerente con l'ordine cronologico
    const n = String(index + 1).padStart(2, '0');
    return `stages/giorno-${n}.html`;
  }

  function renderCard(day, idx) {
    const card = document.createElement('a');
    card.className = 'wm-day-row wm-stage-card';
    card.href = pageForDay(idx);

    const w = day.weather || {};
    const icon = weatherIcon(w.code);
    const temps = (w.tmin != null && w.tmax != null)
      ? `${num(w.tmin, 0)}° / ${num(w.tmax, 0)}°`
      : '';

    const dayLabel = t('journey.day') || 'GIORNO';
    const kmLabel  = t('journey.km') || 'km';
    const mLabel   = t('journey.m') || 'm';
    const hLabel   = t('journey.h') || 'h';

    card.innerHTML = `
      <div class="wm-stage-cover">
        <div class="cover-icon" aria-hidden="true">${icon}</div>
        ${temps ? `<div class="cover-temps">${temps}</div>` : ''}
      </div>
      <div class="wm-stage-body">
        <div class="wm-stage-head">
          <span class="wm-stage-day">${dayLabel} ${String(idx + 1).padStart(2, '0')}</span>
          <span class="wm-stage-date">📅 ${safeDate(day.date)}</span>
        </div>
        <h2 class="wm-stage-title">${day.label || '—'}</h2>
        <div class="wm-stage-stats">
          <span>📏 ${num(day.distance_km, 1)} ${kmLabel}</span>
          <span>⛰️ ↑ ${num(day.elevation_up_m, 0)} ${mLabel}</span>
          <span>⏱️ ${num(day.moving_time_h, 1)} ${hLabel}</span>
          ${w.precip != null ? `<span>💧 ${num(w.precip, 1)} mm</span>` : ''}
        </div>
      </div>
    `;
    return card;
  }

  async function init() {
    // aspetta i18n pronta (imposta window.t)
    if (window.I18N && window.I18N.ready) {
      try { await window.I18N.ready; } catch (e) { /* fallback */ }
    }

    const list = document.getElementById('journey-list');
    const subtitle = document.getElementById('journey-subtitle');

    try {
      const res = await fetch('data/summary.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const days = Array.isArray(data.days) ? data.days : [];

      list.innerHTML = '';

      if (days.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'wm-journey-empty';
        empty.textContent = t('journey.empty') || 'Nessuna tappa pubblicata ancora.';
        list.appendChild(empty);
        return;
      }

      // Subtitle arricchito: N tappe dal … al …
      if (subtitle && days.length) {
        subtitle.textContent = (t('journey.subtitleRange') || '{n} tappe · dal {from} al {to}')
          .replace('{n}', days.length)
          .replace('{from}', safeDate(days[0].date))
          .replace('{to}', safeDate(days[days.length - 1].date));
      }

      days.forEach((d, i) => list.appendChild(renderCard(d, i)));
    } catch (err) {
      list.innerHTML = '';
      const box = document.createElement('div');
      box.className = 'wm-journey-empty';
      box.textContent = '⚠️ ' + (t('journey.error') || 'Impossibile caricare data/summary.json');
      list.appendChild(box);
      console.error('journey:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
