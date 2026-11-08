// USSD Codes BD \u2014 DOM-free logic. Works in browser and Node (for tests).
(function (global) {
  'use strict';

  var CATEGORIES = ['mfs', 'gp', 'robi', 'airtel', 'bl', 'tt'];

  var CODE_RE = /^\*[0-9*#]+\#$/;

  function norm(s) {
    return String(s == null ? '' : s).trim().replace(/\s+/g, ' ');
  }

  // A query matches when EVERY word appears (case-insensitive for Latin) in
  // the code, service, title or description (EN or BN). Bengali words match
  // on the raw substring. A bare number (e.g. "247") also matches inside a
  // code ("*247#").
  function matchesQuery(entry, query) {
    var q = norm(query);
    if (!q) return true;
    var hay = [entry.code, entry.serviceEn, entry.serviceBn, entry.titleEn,
               entry.titleBn, entry.descEn, entry.descBn].join(' ');
    var words = q.split(' ');
    return words.every(function (w) {
      if (!w) return true;
      if (/[a-zA-Z]/.test(w)) return hay.toLowerCase().indexOf(w.toLowerCase()) !== -1;
      return hay.indexOf(w) !== -1;
    });
  }

  // Filter the combined bank (built-ins + customs) by category, query and
  // favourites-only. Returns a NEW array; never mutates its inputs.
  function filterEntries(entries, opts) {
    opts = opts || {};
    var query = opts.query || '';
    var cat = opts.cat || 'all';
    var favsOnly = !!opts.favsOnly;
    var favs = opts.favs || [];
    return entries.filter(function (e) {
      if (cat !== 'all' && e.cat !== cat) return false;
      if (favsOnly && favs.indexOf(e.id) === -1) return false;
      return matchesQuery(e, query);
    });
  }

  function countByCategory(entries) {
    var out = { all: entries.length };
    CATEGORIES.forEach(function (c) { out[c] = 0; });
    entries.forEach(function (e) {
      if (out[e.cat] !== undefined) out[e.cat]++;
    });
    return out;
  }

  // USSD codes: start with *, end with #, digits and * in between, 3\u201320
  // chars, at least one digit. Returns {ok:true} or {ok:false, error:key}.
  function validateCode(raw) {
    var code = norm(raw);
    if (!code) return { ok: false, error: 'addErrCode' };
    if (code.length < 3 || code.length > 20) return { ok: false, error: 'addErrCode' };
    if (!CODE_RE.test(code)) return { ok: false, error: 'addErrCode' };
    if (!/[0-9]/.test(code)) return { ok: false, error: 'addErrCode' };
    return { ok: true, code: code };
  }

  // tel: URI for dialling \u2014 # must be percent-encoded or the browser treats
  // it as a fragment delimiter and the dialler never sees it. * is a legal
  // tel-URI character (RFC 3966 phonedigit-hex) and stays raw.
  function toTelUri(code) {
    return 'tel:' + String(code).replace(/#/g, '%23');
  }

  // Toggle an id in a favourites array. Returns a NEW array.
  function toggleFav(favs, id) {
    var i = favs.indexOf(id);
    if (i === -1) return favs.concat([id]);
    return favs.slice(0, i).concat(favs.slice(i + 1));
  }

  function makeCustomId(nowMs, rand) {
    return 'custom-' + Number(nowMs).toString(36) + '-' +
      Math.floor(Number(rand) * 46656).toString(36);
  }

  // Build a user-added entry. title is used for both EN and BN display.
  function buildCustomEntry(opts) {
    var v = validateCode(opts.code);
    var title = norm(opts.title);
    if (!v.ok) return { ok: false, error: v.error };
    if (!title) return { ok: false, error: 'addErrName' };
    if (CATEGORIES.indexOf(opts.cat) === -1) return { ok: false, error: 'addErrCode' };
    return {
      ok: true,
      entry: {
        id: opts.id || makeCustomId(Date.now(), Math.random()),
        cat: opts.cat,
        code: v.code,
        serviceEn: 'Custom',
        serviceBn: 'Custom',
        titleEn: title,
        titleBn: title,
        descEn: 'Added by you.',
        descBn: 'Added by you.',
        custom: true
      }
    };
  }

  function isDuplicate(entries, code) {
    var c = norm(code).toLowerCase();
    return entries.some(function (e) { return e.code.toLowerCase() === c; });
  }

  // Validate an import payload {app:'ussd-codes-bd', version:1,
  // favorites:[ids], customs:[entries]}. Unknown favourite ids are dropped;
  // invalid customs are dropped. Never throws on malformed input.
  function importPayload(payload, bankIds) {
    if (!payload || typeof payload !== 'object') return { ok: false, error: 'importErr' };
    if (payload.app !== 'ussd-codes-bd' || payload.version !== 1) {
      return { ok: false, error: 'importErr' };
    }
    var known = {};
    (bankIds || []).forEach(function (id) { known[id] = true; });
    var favs = [];
    if (Array.isArray(payload.favorites)) {
      payload.favorites.forEach(function (id) {
        if (typeof id === 'string' && (known[id] || id.indexOf('custom-') === 0) &&
            favs.indexOf(id) === -1) favs.push(id);
      });
    }
    var customs = [];
    if (Array.isArray(payload.customs)) {
      payload.customs.forEach(function (c) {
        if (!c || typeof c !== 'object') return;
        var built = buildCustomEntry({ code: c.code, title: c.titleEn || c.titleBn || '', cat: c.cat, id: c.id });
        if (built.ok) customs.push(built.entry);
      });
    }
    return { ok: true, favorites: favs, customs: customs };
  }

  var api = {
    CATEGORIES: CATEGORIES,
    norm: norm,
    matchesQuery: matchesQuery,
    filterEntries: filterEntries,
    countByCategory: countByCategory,
    validateCode: validateCode,
    toTelUri: toTelUri,
    toggleFav: toggleFav,
    makeCustomId: makeCustomId,
    buildCustomEntry: buildCustomEntry,
    isDuplicate: isDuplicate,
    importPayload: importPayload
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.UssdLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
