/**
 * datageoparana i18n — vanilla, shared across landing, controlpanel and React panels.
 *
 * Detection order: URL param ?lang= → localStorage → navigator.language → 'pt'.
 *
 * Usage in HTML:
 *   <h1 data-i18n="masthead.title">Datageo Paraná</h1>
 *   <a href="..." data-i18n="plates.vbp.title">VBP Paraná...</a>
 *   <input placeholder="..." data-i18n-placeholder="filters.search">
 *   <a href="..." aria-label="..." data-i18n-aria="nav.open">...</a>
 *
 * Usage in JS:
 *   window.i18n.t('filters.period')
 *   window.i18n.setLang('en')
 *
 * Companion file: i18n-dict.js (loaded before this one) populates window.__I18N__.
 */
(function () {
  'use strict';
  var SUPPORTED = ['pt', 'en', 'es'];
  var DEFAULT = 'pt';
  var STORAGE_KEY = 'dgp-lang';

  // Base do proprio script, para resolver os dicionarios sob demanda.
  // document.currentScript funciona em scripts defer durante a avaliacao inicial;
  // o fallback relativo mantem compat com os paineis servidos de ./i18n/.
  var BASE = (document.currentScript && document.currentScript.src)
    ? document.currentScript.src.replace(/[^\/]*$/, '')
    : 'i18n/';

  // Carrega i18n-dict.js + i18n-text-map.js sob demanda (so quando lang != pt).
  // Memoizado: uma unica promessa por pagina. Guard inicial torna a funcao no-op
  // quando os dicts ja estao presentes (paineis que ainda usam <script> estatico).
  var dictsPromise = null;
  function ensureDicts() {
    if (window.__I18N__ && window.__I18N_TEXT_MAP__) return Promise.resolve(true);
    if (dictsPromise) return dictsPromise;
    dictsPromise = new Promise(function (resolve) {
      var todo = 2;
      function done() {
        if (--todo === 0) resolve(!!(window.__I18N__ && window.__I18N_TEXT_MAP__));
      }
      ['i18n-dict.js', 'i18n-text-map.js'].forEach(function (f) {
        var s = document.createElement('script');
        s.src = BASE + f;
        s.async = true;
        s.onload = done;
        // onerror tambem chama done(): resolve(false) sinaliza fallback PT sem quebrar.
        s.onerror = done;
        document.head.appendChild(s);
      });
    });
    return dictsPromise;
  }

  function detect() {
    try {
      var url = new URL(window.location.href);
      var q = (url.searchParams.get('lang') || '').toLowerCase();
      if (SUPPORTED.indexOf(q) !== -1) return q;
    } catch (e) {}
    try {
      var s = (localStorage.getItem(STORAGE_KEY) || '').toLowerCase();
      if (SUPPORTED.indexOf(s) !== -1) return s;
    } catch (e) {}
    var nav = (navigator.language || '').slice(0, 2).toLowerCase();
    if (SUPPORTED.indexOf(nav) !== -1) return nav;
    return DEFAULT;
  }

  function get(dict, path) {
    var parts = path.split('.');
    var cur = dict;
    for (var i = 0; i < parts.length; i++) {
      if (cur && typeof cur === 'object' && parts[i] in cur) cur = cur[parts[i]];
      else return null;
    }
    return typeof cur === 'string' ? cur : null;
  }

  function t(key, fallback) {
    var lang = window.i18n.lang;
    var dict = (window.__I18N__ && window.__I18N__[lang]) || {};
    return get(dict, key) || fallback || key;
  }

  function applyDom(root) {
    root = root || document;
    var lang = window.i18n.lang;
    // Set <html lang="..">.
    try {
      var htmlLang = lang === 'pt' ? 'pt-BR' : (lang === 'en' ? 'en-US' : 'es-ES');
      document.documentElement.setAttribute('lang', htmlLang);
    } catch (e) {}

    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var val = t(key);
      if (val && val !== key) {
        // Preserve child elements when the slot wraps text + inline children.
        if (el.childElementCount === 0) el.textContent = val;
        else {
          // Replace only the first text node, keep nested SVGs / icons.
          var replaced = false;
          for (var i = 0; i < el.childNodes.length; i++) {
            var n = el.childNodes[i];
            if (n.nodeType === 3 && n.nodeValue.trim()) {
              n.nodeValue = val;
              replaced = true;
              break;
            }
          }
          if (!replaced) el.textContent = val;
        }
      }
    });
    // Guard v !== key (como em data-i18n): sem dicionario (PT lazy), t() devolve a
    // propria chave; nesse caso NAO sobrescreve o conteudo canonico PT ja no HTML.
    root.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      var v = t(key);
      if (v && v !== key) el.setAttribute('placeholder', v);
    });
    root.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-aria');
      var v = t(key);
      if (v && v !== key) el.setAttribute('aria-label', v);
    });
    root.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-title');
      var v = t(key);
      if (v && v !== key) el.setAttribute('title', v);
    });
    root.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html');
      var v = t(key);
      if (v && v !== key) el.innerHTML = v;
    });

    // Update language switcher chips' aria-selected state.
    root.querySelectorAll('[data-lang]').forEach(function (el) {
      var on = el.getAttribute('data-lang') === lang;
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      el.classList.toggle('is-active', on);
    });
  }

  function setLang(lang, opts) {
    opts = opts || {};
    if (SUPPORTED.indexOf(lang) === -1) return;
    window.i18n.lang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    if (opts.updateUrl !== false) {
      try {
        var url = new URL(window.location.href);
        url.searchParams.set('lang', lang);
        window.history.replaceState({}, '', url);
      } catch (e) {}
    }
    if (lang === 'pt') {
      // PT nao precisa dos dicionarios: restaura texto canonico via runtime/applyDom.
      applyDom();
      window.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang: lang } }));
      return;
    }
    // EN/ES: garante dicts antes de aplicar. Le window.i18n.lang no resolve
    // (nao a var capturada) para evitar corrida em troca rapida EN->ES.
    ensureDicts().then(function (ok) {
      if (!ok) {
        window.i18n.lang = 'pt';
        try { localStorage.setItem(STORAGE_KEY, 'pt'); } catch (e) {}
      }
      applyDom();
      window.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang: window.i18n.lang } }));
    });
  }

  // Mount switcher chips: any element with [data-lang] becomes a button.
  function bindSwitcher() {
    document.querySelectorAll('[data-lang]').forEach(function (el) {
      if (el.__i18nBound) return;
      el.__i18nBound = true;
      el.addEventListener('click', function (e) {
        e.preventDefault();
        setLang(el.getAttribute('data-lang'));
      });
    });
  }

  // Build a default switcher chip group at [data-i18n-switcher] mount points.
  function buildSwitcher(host) {
    if (!host || host.__i18nBuilt) return;
    host.__i18nBuilt = true;
    var langs = [
      { code: 'pt', label: 'PT', flag: '🇧🇷', full: 'Português' },
      { code: 'en', label: 'EN', flag: '🇺🇸', full: 'English' },
      { code: 'es', label: 'ES', flag: '🇪🇸', full: 'Español' },
    ];
    host.classList.add('lang-switcher');
    host.setAttribute('role', 'group');
    // Chave PT canônica: o runtime traduz [aria-label] via i18n-text-map.js.
    host.setAttribute('aria-label', 'Idioma');
    host.innerHTML = langs.map(function (l) {
      return '<button type="button" class="lang-chip" data-lang="' + l.code +
             '" aria-pressed="false" title="' + l.full + '">' +
             '<span class="lang-flag" aria-hidden="true">' + l.flag + '</span>' +
             '<span class="lang-code">' + l.label + '</span>' +
             '</button>';
    }).join('');
    bindSwitcher();
  }

  function init() {
    window.i18n.lang = detect();
    document.querySelectorAll('[data-i18n-switcher]').forEach(buildSwitcher);
    bindSwitcher();
    // Render PT imediato (sem flash em outro idioma): build/bind/applyDom sincronos.
    applyDom();
    // Se o idioma detectado (?lang=, dgp-lang ou navigator) != pt, baixa os
    // dicionarios em paralelo e re-traduz tudo ao chegar. Fallback PT se falhar.
    if (window.i18n.lang !== 'pt') {
      ensureDicts().then(function (ok) {
        if (!ok) { window.i18n.lang = 'pt'; }
        applyDom();
        window.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang: window.i18n.lang } }));
      });
    }
  }

  window.i18n = { t: t, setLang: setLang, apply: applyDom, lang: DEFAULT, SUPPORTED: SUPPORTED };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
