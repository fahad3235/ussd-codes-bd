// USSD Codes BD \u2014 node unit tests for js/logic.js + js/data.js + js/i18n.js.
// Usage: node tests/logic.test.js  (exit non-zero on failure)
const L = require('../js/logic.js');
const BANK = require('../js/data.js');
const I18n = require('../js/i18n.js');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('ok - ' + name); }
  else { fail++; console.log('FAIL - ' + name + (extra ? ' :: ' + extra : '')); }
}
function counts(cat) { return BANK.filter(d => d.cat === cat).length; }

// ---- bank integrity ----
check('bank has 19 entries', BANK.length === 19, 'got ' + BANK.length);
check('6 categories present', L.CATEGORIES.length === 6);
check('category counts 5/4/2/2/4/2',
  counts('mfs') === 5 && counts('gp') === 4 && counts('robi') === 2 &&
  counts('airtel') === 2 && counts('bl') === 4 && counts('tt') === 2,
  JSON.stringify(L.CATEGORIES.map(c => c + ':' + counts(c))));
const ids = BANK.map(d => d.id);
check('ids unique', new Set(ids).size === 19);
check('every entry has all fields', BANK.every(d =>
  d.id && d.cat && d.code && d.serviceEn && d.serviceBn && d.titleEn &&
  d.titleBn && d.descEn && d.descBn && d.custom === false));
check('every entry has Bengali title/service', BANK.every(d =>
  /[\u0980-\u09FF]/.test(d.titleBn) && /[\u0980-\u09FF]/.test(d.serviceBn)));
check('every code validates', BANK.every(d => L.validateCode(d.code).ok),
  BANK.filter(d => !L.validateCode(d.code).ok).map(d => d.id).join(','));
check('all codes unique per service', (() => {
  const seen = new Set();
  return BANK.every(d => {
    const k = d.cat + ':' + d.code;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
})());
check('known codes present',
  BANK.some(d => d.code === '*247#') && BANK.some(d => d.code === '*167#') &&
  BANK.some(d => d.code === '*322#') && BANK.some(d => d.code === '*268#') &&
  BANK.some(d => d.code === '*495#'));
check('countByCategory totals', (() => {
  const c = L.countByCategory(BANK);
  return c.all === 19 && c.mfs === 5 && c.gp === 4 && c.robi === 2 &&
    c.airtel === 2 && c.bl === 4 && c.tt === 2;
})());

// ---- search ----
check('search "bkash" finds bkash-menu',
  L.filterEntries(BANK, { query: 'bkash' }).map(e => e.id).join(',') === 'bkash-menu');
check('search "247" (bare digits) finds *247#',
  L.filterEntries(BANK, { query: '247' }).some(e => e.id === 'bkash-menu'));
check('search "Check balance" finds 5 balance codes',
  L.filterEntries(BANK, { query: 'Check balance' }).length === 5,
  L.filterEntries(BANK, { query: 'Check balance' }).map(e => e.id).join(','));
check('search "emergency" finds 2 codes',
  L.filterEntries(BANK, { query: 'emergency' }).length === 2);
check('search "my number" finds 2 codes',
  L.filterEntries(BANK, { query: 'my number' }).length === 2);
check('Bengali search finds bKash',
  L.filterEntries(BANK, { query: '\u09ac\u09bf\u0995\u09be\u09b6' }).some(e => e.id === 'bkash-menu'));
check('Bengali search "\u099c\u09b0\u09c1\u09b0\u09bf \u09ac\u09cd\u09af\u09be\u09b2\u09c7\u09a8\u09cd\u09b8" finds 2 codes',
  L.filterEntries(BANK, { query: '\u099c\u09b0\u09c1\u09b0\u09bf \u09ac\u09cd\u09af\u09be\u09b2\u09c7\u09a8\u09cd\u09b8' }).length === 2);
check('multi-word AND: "robi balance" = 2 (menu + balance)',
  L.filterEntries(BANK, { query: 'robi balance' }).length === 2);
check('case-insensitive: "BKASH" finds bkash-menu',
  L.filterEntries(BANK, { query: 'BKASH' }).some(e => e.id === 'bkash-menu'));
check('no match returns empty',
  L.filterEntries(BANK, { query: 'zzzznope' }).length === 0);
check('empty query returns all', L.filterEntries(BANK, { query: '' }).length === 19);

// ---- category filter ----
check('mfs filter = 5', L.filterEntries(BANK, { cat: 'mfs' }).length === 5);
check('gp filter = 4', L.filterEntries(BANK, { cat: 'gp' }).length === 4);
check('tt filter = 2', L.filterEntries(BANK, { cat: 'tt' }).length === 2);
check('category + query combo: gp + balance = 3',
  L.filterEntries(BANK, { cat: 'gp', query: 'balance' }).length === 3,
  L.filterEntries(BANK, { cat: 'gp', query: 'balance' }).map(e => e.id).join(','));

// ---- favourites (pure helpers) ----
check('toggleFav adds then removes (no mutation)',
  (() => {
    const a = ['bkash-menu'];
    const b = L.toggleFav(a, 'nagad-menu');
    const c = L.toggleFav(b, 'nagad-menu');
    return a.length === 1 && b.length === 2 && c.length === 1 && c[0] === 'bkash-menu';
  })());
check('favsOnly filter honours favourites',
  L.filterEntries(BANK, { favsOnly: true, favs: ['bkash-menu', 'tt-balance'] }).length === 2);

// ---- code validation ----
check('validate *247# ok', L.validateCode('*247#').ok);
check('validate *1010*1# ok', L.validateCode('*1010*1#').ok);
check('validate trims spaces', L.validateCode('  *247#  ').ok && L.validateCode('  *247#  ').code === '*247#');
check('reject missing leading *', !L.validateCode('247#').ok);
check('reject missing trailing #', !L.validateCode('*247').ok);
check('reject letters', !L.validateCode('*24a#').ok);
check('reject no digits', !L.validateCode('*#').ok);
check('reject empty', !L.validateCode('').ok);
check('reject too long', !L.validateCode('*12345678901234567890#').ok);

// ---- tel URI ----
check('tel URI encodes # but keeps *', L.toTelUri('*247#') === 'tel:*247%23');
check('tel URI keeps digits and inner *', L.toTelUri('*1010*1#') === 'tel:*1010*1%23');

// ---- custom entries ----
check('buildCustomEntry ok', (() => {
  const r = L.buildCustomEntry({ code: '*999#', title: 'My bank', cat: 'mfs', id: 'custom-x' });
  return r.ok && r.entry.code === '*999#' && r.entry.custom === true && r.entry.cat === 'mfs';
})());
check('buildCustomEntry rejects bad code',
  L.buildCustomEntry({ code: '999', title: 'X', cat: 'mfs' }).ok === false);
check('buildCustomEntry rejects empty title',
  L.buildCustomEntry({ code: '*999#', title: '   ', cat: 'mfs' }).ok === false);
check('buildCustomEntry rejects bad category',
  L.buildCustomEntry({ code: '*999#', title: 'X', cat: 'nope' }).ok === false);
check('isDuplicate detects same code (case-insensitive)',
  L.isDuplicate(BANK, '*247#') && L.isDuplicate(BANK, '*247#') && !L.isDuplicate(BANK, '*999#'));

// ---- import validation ----
check('import valid payload ok', (() => {
  const r = L.importPayload(
    { app: 'ussd-codes-bd', version: 1, favorites: ['bkash-menu'],
      customs: [{ code: '*999#', titleEn: 'My bank', titleBn: 'My bank', cat: 'mfs', id: 'custom-1' }] },
    ids);
  return r.ok && r.favorites.length === 1 && r.customs.length === 1;
})());
check('import drops unknown favourite ids', (() => {
  const r = L.importPayload(
    { app: 'ussd-codes-bd', version: 1, favorites: ['bkash-menu', 'nope-id'], customs: [] }, ids);
  return r.ok && r.favorites.length === 1 && r.favorites[0] === 'bkash-menu';
})());
check('import drops invalid customs', (() => {
  const r = L.importPayload(
    { app: 'ussd-codes-bd', version: 1, favorites: [],
      customs: [{ code: 'bad', titleEn: 'X', cat: 'mfs' }] }, ids);
  return r.ok && r.customs.length === 0;
})());
check('import rejects wrong app', !L.importPayload({ app: 'dua-bd', version: 1 }, ids).ok);
check('import rejects wrong version', !L.importPayload({ app: 'ussd-codes-bd', version: 2 }, ids).ok);
check('import rejects null', !L.importPayload(null, ids).ok);
check('import rejects garbage string', !L.importPayload('nope', ids).ok);

// ---- i18n ----
check('i18n EN title', I18n.t('en', 'title') === 'USSD Codes BD');
check('i18n BN title', I18n.t('bn', 'title') === '\u0987\u0989\u098f\u09b8\u098f\u09b8\u09a1\u09bf \u0995\u09cb\u09a1 \u09ac\u09bf\u09a1\u09bf');
check('i18n fallback to EN for unknown lang', I18n.t('xx', 'title') === 'USSD Codes BD');
check('i18n fmt count', I18n.fmt(I18n.t('en', 'count'), { n: 19 }) === '19 codes');
check('Bengali digits 247', I18n.toBnDigits(247) === '\u09e8\u09ea\u09ed');
check('Bengali digits in string', I18n.toBnDigits('code *247#') === 'code *\u09e8\u09ea\u09ed#');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
