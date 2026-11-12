/* ============================================================
 *  COUNTRIES — adatta la pagina nazione alla lingua attiva
 *  Usa window.t / fmtDate / fmtNum / countryName da src/i18n.js
 * ============================================================ */
(function () {
  function num(n, digits) {
    return window.fmtNum ? window.fmtNum(Number(n), digits ?? 0) : String(n);
  }
  function date(iso) {
    return window.fmtDate ? window.fmtDate(iso) : iso;
  }

  function fillNames() {
    const title = document.querySelector(".wm-country-title");
    if (title && window.countryName) {
      const name = window.countryName({
        name_it: title.dataset.nameIt,
        name_en: title.dataset.nameEn,
      });
      if (name) title.textContent = name;
    }

    document.querySelectorAll(".wm-country-nav a[data-name-it]").forEach((a) => {
      const name = window.countryName
        ? window.countryName({ name_it: a.dataset.nameIt, name_en: a.dataset.nameEn })
        : a.dataset.nameIt;
      const span = a.querySelector(".wm-nav-name");
      if (span && name) span.textContent = name;
    });

    // Titolo scheda browser
    const docTitle = document.querySelector("title[data-title-country]");
    if (docTitle) {
      const lang = (window.I18N && window.I18N.lang) || "it";
      const name = lang === "en"
        ? docTitle.dataset.titleCountryEn
        : docTitle.dataset.titleCountry;
      docTitle.textContent = lang === "en"
        ? `${name} – Where's Marco?`
        : `${name} – Dov'è Marco?`;
    }
  }

  function fillSubtitle() {
    const sub = document.querySelector(".wm-country-sub");
    if (!sub) return;

    const days = sub.dataset.days;
    if (days && window.t) {
      const el = sub.querySelector("[data-i18n='country.stagesCount']");
      if (el) el.textContent = window.t("country.stagesCount", { n: days });
    }

    const kmEl = sub.querySelector(".wm-sub-km");
    if (kmEl) kmEl.textContent = num(sub.dataset.km, 1);

    const upEl = sub.querySelector(".wm-sub-up");
    if (upEl) upEl.textContent = num(sub.dataset.up, 0);

    const firstEl = sub.querySelector(".wm-sub-first");
    if (firstEl) firstEl.textContent = date(sub.dataset.first);

    const lastEl = sub.querySelector(".wm-sub-last");
    if (lastEl) lastEl.textContent = date(sub.dataset.last);
  }

  function fillStages() {
    document.querySelectorAll(".wm-country-stage-row").forEach((row) => {
      const kmEl = row.querySelector(".wm-csr-km");
      if (kmEl && row.dataset.km !== "") kmEl.textContent = num(row.dataset.km, 1);

      const upEl = row.querySelector(".wm-csr-up");
      if (upEl && row.dataset.up !== "") upEl.textContent = num(row.dataset.up, 0);

      const hEl = row.querySelector(".wm-csr-hours");
      if (hEl && row.dataset.hours !== "") hEl.textContent = num(row.dataset.hours, 1);

      const dEl = row.querySelector(".wm-csr-date-text");
      if (dEl && row.dataset.date) dEl.textContent = date(row.dataset.date);

      const tempsEl = row.querySelector(".wm-csr-temps");
      if (tempsEl && tempsEl.dataset.tmin !== undefined && tempsEl.dataset.tmax !== undefined) {
        tempsEl.textContent =
          `${num(tempsEl.dataset.tmin, 0)}° / ${num(tempsEl.dataset.tmax, 0)}°`;
      }
    });
  }

  function apply() {
    fillNames();
    fillSubtitle();
    fillStages();
  }

  async function init() {
    if (window.I18N && window.I18N.ready) {
      try { await window.I18N.ready; } catch (e) { /* fallback */ }
    }
    apply();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
