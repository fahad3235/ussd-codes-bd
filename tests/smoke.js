// USSD Codes BD \u2014 headless-Chrome smoke test via raw CDP (no puppeteer dependency).
// Usage: node tests/smoke.js
// Exits non-zero on any failed assertion; fails on page console errors.
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 9345;
const FILE = 'file://' + path.resolve(__dirname, '..', 'index.html');
let failures = 0;
let count = 0;
const pageErrors = [];
function check(name, cond, extra) {
  count++;
  console.log((cond ? 'ok - ' : 'FAIL - ') + name + (cond ? '' : ' :: ' + (extra || '')));
  if (!cond) failures++;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // NOTE: /opt/meta-chromium/chrome refuses raw launches in this VM
  // ("Hatch WebGL domain policy is required for browser startup" \u2014 the
  // policy is normally supplied by browser-daemon). The unpatched
  // Playwright headless_shell serves the same CDP smoke purpose.
  const CHROME_BIN = process.env.CHROME_BIN ||
    require('os').homedir() + '/.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell';
  const chrome = spawn(CHROME_BIN, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=' + PORT, '--user-data-dir=/tmp/ussd-smoke-' + process.pid,
    'about:blank',
  ], { stdio: 'ignore' });
  let targets = [];
  for (let i = 0; i < 50 && targets.length === 0; i++) {
    await wait(200);
    try {
      targets = JSON.parse(await new Promise((res, rej) => {
        http.get('http://127.0.0.1:' + PORT + '/json/list', (r) => {
          let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(d));
        }).on('error', rej);
      }));
    } catch (e) { /* retry */ }
  }
  if (!targets.length) { console.log('FAIL - chrome did not start'); process.exit(2); }
  const wsUrl = targets[0].webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);
  await new Promise((res) => { ws.onopen = res; });
  let seq = 0; const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      pageErrors.push(JSON.stringify(msg.params.args));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(JSON.stringify(msg.params.exceptionDetails).slice(0, 300));
    }
  };
  const send = (method, params) => new Promise((res) => {
    const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: FILE });
  await wait(1500);
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return { error: JSON.stringify(r.result.exceptionDetails).slice(0, 300) };
    return r.result ? r.result.result.value : undefined;
  };

  check('page title contains USSD', (await ev('document.title'))?.includes('USSD'));
  check('19 code cards render', (await ev(`document.querySelectorAll('.card').length`)) === 19);
  check('7 category chips (All + 6)', (await ev(`document.querySelectorAll('#catChips .chip').length`)) === 7);
  check('count label shows 19', (await ev(`document.getElementById('countLabel').textContent`)).includes('19'));
  check('test hooks present', (await ev(`typeof window.__ussd.setQuery`)) === 'function');
  check('disclaimer renders', (await ev(`document.getElementById('disclaimer').textContent.length`)) > 40);

  // Category filter: mfs = 5 cards.
  await ev(`window.__ussd.setCategory('mfs')`);
  check('mfs filter shows 5 cards', (await ev(`document.querySelectorAll('.card').length`)) === 5);
  check('mfs count label shows 5', (await ev(`document.getElementById('countLabel').textContent`)).includes('5'));
  await ev(`window.__ussd.setCategory('all')`);
  check('back to all shows 19 cards', (await ev(`document.querySelectorAll('.card').length`)) === 19);

  // Search: "bkash" narrows to 1; Bengali search too.
  await ev(`window.__ussd.setQuery('bkash')`);
  check('search "bkash" shows 1 card', (await ev(`document.querySelectorAll('.card').length`)) === 1);
  check('search "bkash" shows *247#', (await ev(`document.querySelector('.card-code').textContent`)) === '*247#');
  await ev(`window.__ussd.setQuery('\u09ac\u09bf\u0995\u09be\u09b6')`);
  check('Bengali search finds bKash', (await ev(`document.querySelectorAll('.card').length`)) === 1);
  await ev(`window.__ussd.setQuery('')`);

  // Dial link: href must keep the code intact (# encoded, not truncated).
  const dialHref = await ev(`document.querySelector('[data-id="bkash-menu"] a.btn.primary').getAttribute('href')`);
  check('dial href is tel:*247%23', dialHref === 'tel:*247%23', dialHref);
  check('copy button present on card', (await ev(`document.querySelector('[data-id="bkash-menu"] .copy-btn') !== null`)) === true);

  // Favourites: toggle, favs-only, persist across reload.
  await ev(`window.__ussd.toggleFav('bkash-menu')`);
  check('favourite added', (await ev(`window.__ussd.state().favorites`)).includes('bkash-menu'));
  await ev(`window.__ussd.setFavsOnly(true)`);
  check('favs-only shows 1 card', (await ev(`document.querySelectorAll('.card').length`)) === 1);
  await ev(`window.__ussd.setFavsOnly(false)`);
  await send('Page.navigate', { url: FILE });
  await wait(1200);
  check('favourite persists after reload', (await ev(`window.__ussd.state().favorites`)).includes('bkash-menu'));

  // Add custom code via hook: valid, duplicate, invalid.
  const addOk = await ev(`JSON.stringify(window.__ussd.addCustom('*999#', 'My bank', 'mfs'))`);
  check('add custom valid ok', addOk.includes('"ok":true'), addOk);
  check('custom card renders (20 cards)', (await ev(`document.querySelectorAll('.card').length`)) === 20);
  check('custom badge shows', (await ev(`document.querySelector('.card[data-id^="custom-"] .badge') !== null`)) === true);
  check('custom dial href encoded', (await ev(`document.querySelector('.card[data-id^="custom-"] a.btn.primary').getAttribute('href')`)) === 'tel:*999%23');
  const addDup = await ev(`JSON.stringify(window.__ussd.addCustom('*247#', 'Dup', 'mfs'))`);
  check('duplicate code rejected', addDup.includes('"ok":false') && addDup.includes('addErrDup'), addDup);
  const addBad = await ev(`JSON.stringify(window.__ussd.addCustom('999', 'Bad', 'mfs'))`);
  check('invalid code rejected', addBad.includes('"ok":false'), addBad);
  check('still 20 cards after rejections', (await ev(`document.querySelectorAll('.card').length`)) === 20);
  // Remove custom via its delete button.
  await ev(`document.querySelector('.card[data-id^="custom-"] .del-btn').click()`);
  check('custom deleted (19 cards)', (await ev(`document.querySelectorAll('.card').length`)) === 19);

  // Add form UI: submit an invalid code, see the inline error.
  await ev(`document.getElementById('addCode').value = 'bad'`);
  await ev(`document.getElementById('addName').value = 'Test'`);
  await ev(`document.getElementById('addForm').requestSubmit()`);
  check('form shows inline error', (await ev(`document.getElementById('addError').hidden`)) === false);

  // Language toggle: switch to Bangla, check title + card title + Bengali digits.
  await ev(`document.getElementById('langBtn').click()`);
  check('BN toggle: page title in Bengali', (await ev(`document.getElementById('title').textContent`)) === '\u0987\u0989\u098f\u09b8\u098f\u09b8\u09a1\u09bf \u0995\u09cb\u09a1 \u09ac\u09bf\u09a1\u09bf');
  check('BN toggle: card title in Bengali', (await ev(`document.querySelector('.card-title').textContent`)).match(/[\u0980-\u09FF]/) !== null);
  check('BN toggle: count label uses Bengali digits', (await ev(`document.getElementById('countLabel').textContent`)).match(/[\u09E6-\u09EF]/) !== null);
  check('BN toggle persists after reload', (await (async () => {
    await send('Page.navigate', { url: FILE });
    await wait(1200);
    return (await ev(`window.__ussd.state().lang`)) === 'bn';
  })()));
  await ev(`document.getElementById('langBtn').click()`);
  check('back to EN', (await ev(`window.__ussd.state().lang`)) === 'en');

  // Data: export payload + import validation + eraseAll.
  const payload = await ev(`JSON.stringify(window.__ussd.exportPayload())`);
  check('export payload is ussd-codes-bd v1', payload.includes('"app":"ussd-codes-bd"') && payload.includes('"version":1'));
  const imp = await ev(`JSON.stringify(window.__ussd.importPayload(JSON.stringify({app:'ussd-codes-bd',version:1,favorites:['nagad-menu'],customs:[{code:'*888#',titleEn:'Test',titleBn:'Test',cat:'gp',id:'custom-t1'}]})))`);
  check('import valid payload ok', imp.includes('"ok":true'), imp);
  check('import applied favourite + custom', (await ev(`window.__ussd.state().favorites.length`)) === 1 &&
    (await ev(`window.__ussd.state().customs.length`)) === 1);
  const badImp = await ev(`JSON.stringify(window.__ussd.importPayload('{"app":"dua-bd","version":1}'))`);
  check('import wrong app rejected', badImp.includes('"ok":false'));
  check('invalid import leaves data intact', (await ev(`window.__ussd.state().favorites.length`)) === 1);
  await ev(`window.__ussd.eraseAll()`);
  check('eraseAll clears favourites + customs', (await ev(`window.__ussd.state().favorites.length`)) === 0 &&
    (await ev(`window.__ussd.state().customs.length`)) === 0);

  // Mobile 390px: no horizontal overflow.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: FILE });
  await wait(1200);
  const overflow = await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  check('390px no horizontal overflow', overflow <= 0, 'overflow=' + overflow);
  await ev(`window.__ussd.setQuery('balance')`);
  const overflowS = await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  check('390px no overflow after search', overflowS <= 0, 'overflow=' + overflowS);

  // Zero network requests: app is fully offline (only file:// loads).
  const reqs = await ev(`performance.getEntriesByType('resource').map(r => r.name).filter(n => !n.startsWith('file://')).length`);
  check('zero non-file network requests', reqs === 0, 'non-file=' + reqs);

  check('no console/page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  chrome.kill();
  console.log('\n' + count + ' checks, ' + failures + ' failed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL - harness error: ' + e.message); try { chrome.kill(); } catch (_) {} process.exit(2); });
