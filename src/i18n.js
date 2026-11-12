// i18n minimale: IT / EN
// Uso nell'HTML:
//   data-i18n="chiave"       -> sostituisce il testo
//   data-i18n-html="chiave"  -> sostituisce l'HTML (solo per testi tuoi, fidati)
//   data-i18n-alt="chiave"   -> sostituisce l'attributo alt
//   <body data-title-key="chiave"> -> imposta document.title
//   <button data-lang="it"> / <button data-lang="en"> -> selettore lingua
(function () {
  const SUPPORTED = ["it", "en"];
  const DEFAULT_LANG = "en"; // lingua per chi non ha né scelta salvata né browser IT/EN
  const LOCALES = { it: "it-IT", en: "en-GB" };
  const STORAGE_KEY = "wm-lang";

  const state = { lang: DEFAULT_LANG, dict: {} };

  function detectLang() {
    // 1. ?lang=en nell'URL (utile per condividere un link in una lingua precisa)
    const q = new URLSearchParams(location.search).get("lang");
    if (SUPPORTED.includes(q)) return q;
    // 2. scelta salvata
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (SUPPORTED.includes(saved)) return saved;
    } catch (e) {
      /* localStorage non disponibile */
    }
    // 3. lingua del browser
    const nav = (navigator.language || "").slice(0, 2).toLowerCase();
    return SUPPORTED.includes(nav) ? nav : DEFAULT_LANG;
  }

  async function loadDict(lang) {
    // Percorso assoluto dalla root del sito: funziona da /, /countries/, /stages/, ecc.
    // Se una pagina ha bisogno di un base diverso, può impostare window.I18N_BASE prima di i18n.js.
    const base = window.I18N_BASE || "/i18n/";
    const url = `${base}${lang}.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Impossibile caricare ${url}`);
    return res.json();
  }

  function t(key, vars) {
    let s = state.dict[key] !== undefined ? state.dict[key] : key;
    if (vars) {
      for (const k in vars) s = s.split(`{${k}}`).join(vars[k]);
    }
    return s;
  }

  function fmtNum(n, digits = 1) {
    if (typeof n !== "number" || Number.isNaN(n)) return "—";
    return new Intl.NumberFormat(LOCALES[state.lang], {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n);
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    // mezzogiorno per evitare slittamenti di fuso orario
    const d = new Date(iso + "T12:00:00");
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat(LOCALES[state.lang], {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(d);
  }

  // Nome localizzato di una nazione: oggetto con { name_it, name_en }
  function countryName(obj) {
    if (!obj) return "";
    const l = state.lang || "it";
    return (
      (l === "en" ? obj.name_en : obj.name_it) ||
      obj.name_it ||
      obj.name_en ||
      ""
    );
  }

  function apply() {
    document.documentElement.lang = state.lang;

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      el.innerHTML = t(el.dataset.i18nHtml);
    });
    document.querySelectorAll("[data-i18n-alt]").forEach((el) => {
      el.setAttribute("alt", t(el.dataset.i18nAlt));
    });

    const titleKey = document.body && document.body.dataset.titleKey;
    if (titleKey) document.title = t(titleKey);

    document.querySelectorAll("[data-lang]").forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.dataset.lang === state.lang);
    });
  }

  async function setLang(lang) {
    if (!SUPPORTED.includes(lang)) return;
    if (lang === state.lang) return; // niente reload se è già la lingua attiva
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      /* ignora */
    }
    // Ricarica: init() rileggerà localStorage e applicherà la lingua scelta
    location.reload();
  }

  async function init() {
    if (document.readyState === "loading") {
      await new Promise((r) =>
      document.addEventListener("DOMContentLoaded", r, { once: true })
      );
    }

    document.querySelectorAll("[data-lang]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setLang(btn.dataset.lang).catch((err) => console.error(err));
      });
    });

    const lang = detectLang();
    try {
      state.dict = await loadDict(lang);
      state.lang = lang;
      apply();
    } catch (err) {
      // se il JSON non carica restano i testi italiani scritti nell'HTML
      console.error("i18n:", err);
    }
  }

  window.t = t;
  window.fmtNum = fmtNum;
  window.fmtDate = fmtDate;
  window.countryName = countryName;
  window.I18N = {
    ready: init(),
 setLang,
 get lang() {
   return state.lang;
 },
  };
})();
