// USSD Codes BD \u2014 app wiring (browser only).
(function () {
  'use strict';

  var L = window.UssdLogic;
  var I18n = window.UssdI18n;
  var BANK = window.UssdData || [];
  var STORE_KEY = 'ussd-codes-bd-v1';

  var state = {
    lang: 'en',
    query: '',
    cat: 'all',
    favsOnly: false,
    favorites: [],
    customs: []
  };

  function $(id) { return document.getElementById(id); }
  function t(key) { return I18n.t(state.lang, key); }
  function digits(v) {
    return state.lang === 'bn' ? I18n.toBnDigits(v) : String(v);
  }
  function allEntries() { return BANK.concat(state.customs); }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data.lang === 'en' || data.lang === 'bn') state.lang = data.lang;
      if (Array.isArray(data.favorites)) {
        state.favorites = data.favorites.filter(function (id) { return typeof id === 'string'; });
      }
      if (Array.isArray(data.customs)) {
        state.customs = data.customs.filter(function (c) {
          return c && typeof c === 'object' &&
            L.buildCustomEntry({ code: c.code, title: c.titleEn || '', cat: c.cat, id: c.id }).ok;
        });
      }
    } catch (e) { /* corrupted storage: start fresh */ }
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        lang: state.lang, favorites: state.favorites, customs: state.customs
      }));
    } catch (e) { /* storage unavailable: session-only */ }
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }

  function copyText(text, okMsg) {
    function done(ok) { toast(ok ? okMsg : t('copyFailed')); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(); });
    } else { fallback(); }
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta); done(!!ok);
      } catch (e) { done(false); }
    }
  }

  function visibleEntries() {
    return L.filterEntries(allEntries(), {
      query: state.query, cat: state.cat,
      favsOnly: state.favsOnly, favs: state.favorites
    });
  }

  function renderStatic() {
    document.documentElement.lang = state.lang === 'bn' ? 'bn' : 'en';
    document.title = t('title');
    $('title').textContent = t('title');
    $('tagline').textContent = t('tagline');
    $('langBtn').textContent = t('langBtn');
    $('search').placeholder = t('searchPlaceholder');
    $('addTitle').textContent = t('addTitle');
    $('addCodeLabel').textContent = t('addCode');
    $('addNameLabel').textContent = t('addName');
    $('addCatLabel').textContent = t('addCat');
    $('addBtn').textContent = t('addBtn');
    $('dataTitle').textContent = t('dataTitle');
    $('exportBtn').textContent = t('exportBtn');
    $('importBtn').textContent = t('importBtn');
    $('eraseBtn').textContent = t('eraseBtn');
    $('disclaimer').textContent = t('disclaimer');
    $('offlineNote').textContent = t('offline');
    var sel = $('addCat');
    sel.innerHTML = '';
    L.CATEGORIES.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = t('cat_' + c);
      sel.appendChild(o);
    });
  }

  function renderChips() {
    var counts = L.countByCategory(allEntries());
    var box = $('catChips');
    box.innerHTML = '';
    var mk = function (cat, label, n) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('aria-pressed', state.cat === cat ? 'true' : 'false');
      b.textContent = label + ' (' + digits(n) + ')';
      b.addEventListener('click', function () { state.cat = cat; render(); });
      box.appendChild(b);
    };
    mk('all', t('allCategories'), counts.all);
    L.CATEGORIES.forEach(function (c) { mk(c, t('cat_' + c), counts[c]); });
    var fav = $('favToggle');
    fav.textContent = '\u2605 ' + t('favsOnly') + ' (' + digits(state.favorites.length) + ')';
    fav.setAttribute('aria-pressed', state.favsOnly ? 'true' : 'false');
  }

  function cardEl(e) {
    var card = document.createElement('article');
    card.className = 'card';
    card.setAttribute('data-id', e.id);

    var top = document.createElement('div');
    top.className = 'card-top';
    var code = document.createElement('span');
    code.className = 'card-code';
    code.textContent = e.code;
    var star = document.createElement('button');
    star.type = 'button';
    star.className = 'star-btn';
    star.textContent = '\u2605';
    star.setAttribute('aria-pressed', state.favorites.indexOf(e.id) !== -1 ? 'true' : 'false');
    star.setAttribute('aria-label', t(state.favorites.indexOf(e.id) !== -1 ? 'favRemove' : 'favAdd'));
    star.addEventListener('click', function () {
      state.favorites = L.toggleFav(state.favorites, e.id);
      save(); render();
    });
    top.appendChild(code); top.appendChild(star);
    card.appendChild(top);

    var title = document.createElement('p');
    title.className = 'card-title';
    title.textContent = state.lang === 'bn' ? e.titleBn : e.titleEn;
    if (e.custom) {
      var badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = t('customBadge');
      title.appendChild(badge);
    }
    card.appendChild(title);

    var svc = document.createElement('p');
    svc.className = 'card-service';
    svc.textContent = e.custom ? t('cat_' + e.cat)
      : (state.lang === 'bn' ? e.serviceBn : e.serviceEn);
    card.appendChild(svc);

    var desc = document.createElement('p');
    desc.className = 'card-desc';
    desc.textContent = state.lang === 'bn' ? e.descBn : e.descEn;
    card.appendChild(desc);

    var actions = document.createElement('div');
    actions.className = 'card-actions';
    var dial = document.createElement('a');
    dial.className = 'btn primary';
    dial.href = L.toTelUri(e.code);
    dial.textContent = t('dial');
    actions.appendChild(dial);
    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'btn copy-btn';
    copy.textContent = t('copy');
    copy.addEventListener('click', function () { copyText(e.code, t('copied')); });
    actions.appendChild(copy);
    if (e.custom) {
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn danger del-btn';
      del.textContent = t('customRemove');
      del.addEventListener('click', function () { removeCustom(e.id); });
      actions.appendChild(del);
    }
    card.appendChild(actions);
    return card;
  }

  function render() {
    renderStatic();
    renderChips();
    var list = visibleEntries();
    var box = $('cards');
    box.innerHTML = '';
    list.forEach(function (e) { box.appendChild(cardEl(e)); });
    var n = list.length;
    $('countLabel').textContent = n === 1 ? t('countOne') : I18n.fmt(t('count'), { n: digits(n) });
    var empty = $('empty');
    if (n === 0) {
      empty.textContent = state.favsOnly ? t('emptyFavs') : t('empty');
      empty.hidden = false;
    } else { empty.hidden = true; }
  }

  function removeCustom(id) {
    state.customs = state.customs.filter(function (c) { return c.id !== id; });
    state.favorites = state.favorites.filter(function (f) { return f !== id; });
    save(); render();
  }

  function exportPayload() {
    return { app: 'ussd-codes-bd', version: 1, favorites: state.favorites, customs: state.customs };
  }

  function applyImport(text) {
    var parsed;
    try { parsed = JSON.parse(text); } catch (e) { return { ok: false, error: 'importErr' }; }
    var bankIds = BANK.map(function (e) { return e.id; });
    var res = L.importPayload(parsed, bankIds);
    if (!res.ok) return res;
    state.favorites = res.favorites;
    state.customs = res.customs;
    save(); render();
    return { ok: true };
  }

  function eraseAll() {
    state.favorites = [];
    state.customs = [];
    save(); render();
  }

  function wire() {
    $('search').addEventListener('input', function (ev) {
      state.query = ev.target.value; render();
    });
    $('favToggle').addEventListener('click', function () {
      state.favsOnly = !state.favsOnly; render();
    });
    $('langBtn').addEventListener('click', function () {
      state.lang = state.lang === 'en' ? 'bn' : 'en';
      save(); render();
    });
    $('addForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var err = $('addError'), ok = $('addOk');
      err.hidden = true; ok.hidden = true;
      var code = $('addCode').value;
      var built = L.buildCustomEntry({
        code: code, title: $('addName').value, cat: $('addCat').value
      });
      if (!built.ok) { err.textContent = t(built.error); err.hidden = false; return; }
      if (L.isDuplicate(allEntries(), built.entry.code)) {
        err.textContent = t('addErrDup'); err.hidden = false; return;
      }
      state.customs.push(built.entry);
      save(); render();
      $('addCode').value = ''; $('addName').value = '';
      ok.textContent = t('addOk'); ok.hidden = false;
    });
    $('exportBtn').addEventListener('click', function () {
      var text = JSON.stringify(exportPayload());
      $('dataBox').value = text;
      var msg = $('dataMsg');
      copyText(text, t('exportDone'));
      msg.textContent = t('exportDone'); msg.hidden = false;
    });
    $('importBtn').addEventListener('click', function () {
      var msg = $('dataMsg');
      var res = applyImport($('dataBox').value);
      msg.textContent = t(res.ok ? 'importOk' : 'importErr');
      msg.hidden = false;
      if (!res.ok) msg.className = 'form-error'; else msg.className = 'form-ok';
    });
    var eraseArmed = false;
    $('eraseBtn').addEventListener('click', function () {
      if (!eraseArmed) {
        eraseArmed = true;
        $('eraseBtn').textContent = t('eraseConfirm');
        setTimeout(function () { eraseArmed = false; $('eraseBtn').textContent = t('eraseBtn'); }, 4000);
        return;
      }
      eraseArmed = false;
      $('eraseBtn').textContent = t('eraseBtn');
      eraseAll();
      var msg = $('dataMsg');
      msg.textContent = t('erased'); msg.className = 'form-ok'; msg.hidden = false;
    });
  }

  load();
  wire();
  render();

  // Test hooks (also handy for power users in the console).
  window.__ussd = {
    state: function () {
      return {
        lang: state.lang, query: state.query, cat: state.cat,
        favsOnly: state.favsOnly, favorites: state.favorites.slice(),
        customs: state.customs.map(function (c) { return c.id; })
      };
    },
    setQuery: function (q) { state.query = q; $('search').value = q; render(); },
    setCategory: function (c) { state.cat = c; render(); },
    setFavsOnly: function (v) { state.favsOnly = !!v; render(); },
    toggleFav: function (id) { state.favorites = L.toggleFav(state.favorites, id); save(); render(); },
    addCustom: function (code, title, cat) {
      var built = L.buildCustomEntry({ code: code, title: title, cat: cat });
      if (!built.ok) return built;
      if (L.isDuplicate(allEntries(), built.entry.code)) return { ok: false, error: 'addErrDup' };
      state.customs.push(built.entry); save(); render();
      return { ok: true, id: built.entry.id };
    },
    removeCustom: removeCustom,
    exportPayload: exportPayload,
    importPayload: applyImport,
    eraseAll: eraseAll,
    setLang: function (lang) { state.lang = lang; save(); render(); }
  };
})();
