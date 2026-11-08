# USSD Codes BD — test results (run #272, 2026-11-08)

## Unit tests — 56/56 pass

`node tests/logic.test.js` — bank integrity (19 entries, category counts
5/4/2/2/4/2, unique ids, all fields present, Bengali on every entry, every
code validates, known MFS codes *247#/*167#/*322#/*268#/*495# present);
search (EN, Bengali, bare digits, multi-word AND, case-insensitive, empty);
category + query combos; favourites toggle (no mutation); code validation
(9 cases); tel URI (`*247#` → `tel:*247%23`); custom entries (ok / bad code /
empty title / bad category); duplicate detection; import validation
(7 cases); i18n (EN/BN titles, fallback, fmt, Bengali digits).

## Headless-Chrome smoke — 41/41 pass, 0 console/page errors

`node tests/smoke.js` (raw CDP against Playwright `headless_shell-1187`;
`/opt/meta-chromium/chrome` refuses raw launches in this VM — "Hatch WebGL
domain policy is required for browser startup" — documented in the smoke
script). Verified: 19 cards render, 7 category chips, mfs filter = 5,
search EN ("bkash" → *247#) and BN ("বিকাশ" → 1 card), dial href is exactly
`tel:*247%23`, copy button present, favourite add + favs-only = 1 card +
persistence across reload, custom add (valid ok, 20 cards, badge, encoded
dial href) + duplicate/invalid rejected + delete back to 19, add-form inline
error on bad code, BN toggle (title + card title + Bengali digits) +
persistence, export payload (ussd-codes-bd v1) + valid import applied +
wrong-app import rejected with data intact + eraseAll, 390px no horizontal
overflow (browse + after search), zero non-file network requests.

## Repairs

- 2 test-side fixes: "balance" search expectation corrected (the word also
  appears in MFS descriptions, so the discriminating query is "Check
  balance" = 5); tel-URI expectation corrected (`encodeURIComponent` leaves
  `*` raw, so `*247#` → `tel:*247%23`, not `tel:%2A247%23`).
- 1 clarity refactor (no behaviour change): `toTelUri` now encodes only `#`
  explicitly instead of via `encodeURIComponent` — identical output
  (`tel:*247%23`), but the intent (keep `*` readable per RFC 3966
  phonedigit-hex, encode `#` so the browser does not treat it as a fragment)
  is now stated in the code.
- 0 app-logic bugs found.

## Source hygiene

`grep -P '[^\x00-\x7F]'` returns 0 matches across all shipped code
(`js/*.js`, `index.html`, `css/style.css`, `tests/*.js`) — Bengali in code
and tests is `\uXXXX` escapes (data/i18n via the generator, tests via an
ASCII pass after writing). `README.md` / `TEST_RESULTS.md` prose contains
Bengali in documentation only.

## Honesty notes

- Built-in codes are commonly published USSD menus, not an official operator
  listing; the footer + README carry the verify-with-your-operator disclaimer.
- Emergency-balance codes are labelled "terms and charges apply".
- No fabricated data: every code is a real published USSD code; user-added
  codes are the user's own.
