# Betalt annoncering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native, chosen by you via memory »agenter-som-gates«: a fresh review agent gates each task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boosts and other paid promotion are recorded per item and marketplace, counted in Konto, learning, Køb igen and the price watcher, and Vinted's boost numbers turn into a verdict on the item page.

**Architecture:** Two tables (`annoncering_ordrer`, `annoncering`) plus history (`annoncering_maal`). The invoice email creates the order; the runner finds the items in the wardrobe (`promoted`) and fetches `bumps/stats`; the server owns all logic in a pure module `_shared/annoncering.ts`. The app reads the tables directly and writes only its own manual rows.

**Tech Stack:** Supabase Postgres + Edge Functions (Deno/TS), runner as `String.raw` JS, PWA `app.js` (ES5-ish), `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-19-betalt-annoncering-design.md`

## Global Constraints

- Vinted's stats call: `GET https://api.vinted.dk/vas/items/{id}/bumps/stats?timezone=Europe%2FCopenhagen`, `credentials:'include'`, header `Accept-Language: da-DK` (without it: 500).
- Boost-salg = sold between `start` and `slut` + 7 days.
- Thresholds: under 5 other boosted items with numbers → fixed 1,5 % klik/vist and 5 % hjerter/klik; from 5 → 0,7 × the median of the others.
- Prices for the user: `kr()` »12,69 kr« (two decimals here, since the amounts are real øre), sums `krSum`.
- New CSS classes get the prefix `.ann-`.
- The runner never buys or clicks anything on Vinted; only GET.
- Run `node tools/check-runner.mjs supabase/functions/*/runner.ts app.js` and `./build.sh` before commits that touch runner/app.

## Review Focus

- The same invoice email arrives twice or `?genlaes=44` runs twice → still only one order (unique `vinted_mail_id`). Test in Task 2.
- The runner reports `promoted` items that already belong to an older order still running → they are not counted twice; only items without a row overlapping the period get attached. Test in Task 3 (live call).
- An item boosted twice → two rows; Konto adds both, and the item page shows the newest. Test in Task 5.
- A boost row without numbers (manual, DBA) → the funnel and verdict are absent, no "NaN %". Test in Task 1 (`tragt(null)`) and Task 5.
- The stats call fails (500/404/network) → `spor` records it, and the next page load tries again (no measurement saved that day). Test in Task 3.

---

### Task 1: The pure module

**Files:**
- Create: `supabase/functions/_shared/annoncering.ts`
- Test: `tools/test-annoncering.mjs`

**Interfaces:**
- Produces:
  - `laesFaktura(emne: string, tekst: string): {slags:'boost', dage:number, antal:number, kr:number, tekst:string} | null`
  - `type Tal = {impressions:number, views:number, favorites:number, conversations:number, forskel?:number|null}`
  - `tragt(t: Tal|null): {vist, klik, klikPct, hjerter, hjertePct, beskeder} | null` (pct as numbers with one decimal; null when `t` is null or `impressions` is 0)
  - `boostDom(t: Tal|null, andre: Tal[], o: {solgtFor?: number|null, slut: string, nu?: Date}): string | null`
  - `boostSalg(r: {start:string, slut:string}, soldAt: string|null): boolean`
  - `boostLinje(r: {start, slut, kr, tal}, soldAt: string|null): string` (for prompts: »boostet 3 d for 12,69 kr fra 19.10 (2.397 vist, 54 klik, 6 hjerter), solgt under/efter boostet«)

- [ ] **Step 1: Write the tests** — `laesFaktura` on mail 44's subject and text (copied from the spec) → `{dage:3, antal:2, kr:25.38}`; `null` for »Du har solgt en artikel på Vinted«. `tragt({impressions:2397, views:54, favorites:6, conversations:0})` → `klikPct 2.3, hjertePct 11.1`; `tragt(null)` and `tragt({impressions:0,…})` → `null`. `boostDom`: sold → starts with »Boostet betalte sig«; 0,9 % klik → starts with »Få klik«; 2,3 % klik + 2 % hjerter → »Klik, men få hjerter«; 6 ♥, slut in the past, unsold → »Mange hjerter«; with 5 others at 5 % klik, an item at 3 % → »Få klik«; under 5 others, the text says »skøn«. `boostSalg` true at slut+6 d, false at slut+8 d and before start.
- [ ] **Step 2:** `node --test tools/test-annoncering.mjs` → FAIL (module missing).
- [ ] **Step 3: Implement.** The amount: »I alt« followed by a number; when both comma and dot are present, the last one is the decimal separator.
- [ ] **Step 4:** run again → PASS.
- [ ] **Step 5: Commit.**

### Task 2: Database and the invoice email

**Files:**
- Create: `sql/023-annoncering.sql`
- Modify: `supabase/functions/vinted-mail/index.ts` (`slags()`, new branch `kind === "boost"`)

**Interfaces:**
- Consumes: `laesFaktura`.
- Produces: the tables from the spec; `annoncering_ordrer.vinted_mail_id` unique; RLS select for authenticated on all three, insert/delete on `annoncering` with `kilde = 'dig'`; index `annoncering(listing_id)`, `annoncering(draft_id)`.

- [ ] **Step 1:** Write the SQL (fields exactly as in the spec, `kr_i_alt numeric(10,2)`, `kr numeric(10,2)`, check `plads in (vinted,dba,reshopper)`, `kilde in (mail,dig)`, `tal jsonb`, `dom text`, `maalt_at timestamptz`, `annoncering_maal` with `on delete cascade`). Run with psql.
- [ ] **Step 2:** `slags()`: emne matching `/boost af din artikel/` → `"boost"`, placed BEFORE the other patterns. Branch: `laesFaktura`; on a hit, `upsert` the order on `vinted_mail_id` (`ignoreDuplicates`), `start` = the mail's `at`, `slut` = start + dage; `handling` »boost: N varer, X kr — venter på garderoben«. No push. On a miss (`null`): fall back to the »ny slags« path as before.
- [ ] **Step 3:** Deploy `vinted-mail` with `./tools/udgiv.sh vinted-mail` (after the commit), then `?genlaes=44` twice → one row in `annoncering_ordrer` (antal 2, dage 3, 25.38).
- [ ] **Step 4: Commit** (including SQL) + publish.

### Task 3: Server `mode:'boost'`, price watcher, runner

**Files:**
- Modify: `supabase/functions/vinted-fill-script/index.ts` (new `mode:"boost"` before the id guard, next to `efterloeb`; `hentForfaldne` skips active boosts; `tilsyn` gives `beslutPris` the boost line)
- Modify: `supabase/functions/vinted-fill-script/prisvagt.ts` (`Vagt.boost?: string`, one line in the prompt)
- Modify: `supabase/functions/vinted-fill-script/runner.ts` (`boostRunde()` next to `efterloeb()`)

**Interfaces:**
- Consumes: `boostDom`, `boostLinje`.
- `mode:'boost'` without data → `{bruger, behov:boolean, maal:string[]}`. With `promoted:string[]` → attaches, returns `{knyttet:[{nr, item_id, kr}]}`. With `maal:[{item_id, stats}]` (the `bumped_item_stats` object) → saves, returns `{gemt:n}`.

- [ ] **Step 1:** Server. Attaching: for each order with `plads=vinted`, `at` > now−7 d and fewer rows than `antal`: the listings among `promoted` without an `annoncering` row whose period overlaps the order → the first `antal − existing` (newest `listed_at` first); `kr = round(kr_i_alt/antal, 2)`; `next_check_at = greatest(next_check_at, slut + 1 d)`; `price_events` kind `boost` with note »boostet N d (X kr)«. Measurements: one `annoncering_maal` row per item per day (skip if one already exists today), `tal`/`maalt_at` updated on the item's newest row, then `dom` recomputed on ALL vinted rows with `tal` (the others are `andre`). `maal` list = vinted rows with `listing_id`, now < slut+7 d, `maalt_at` null or before today (Copenhagen).
- [ ] **Step 2:** `hentForfaldne`: exclude listings with a row where `slut > now`. `tilsyn`: `v.boost = boostLinje(newest row, null)` when there is a row with `slut` > now−30 d; `prisvagt.ts` adds »Betalt boost: … — hjerterne fra boostperioden er pustet op og siger ikke noget om prisen.« to the prompt when present.
- [ ] **Step 3:** Runner `boostRunde()`: at most once per hour (`localStorage` `udbakke_boost_sidst`, try/catch), POST `{mode:'boost'}`; on `behov`, fetch the wardrobe pages (`per_page=96`, max 5, `Accept: application/json`) and POST `promoted`; for each `maal`, GET stats with `Accept-Language: da-DK` and POST. `spor('boost: …')` for every outcome, including the status code on errors. Set the hour stamp only when the first POST succeeded.
- [ ] **Step 4:** `node tools/check-runner.mjs …` → ok. Commit, `./tools/udgiv.sh vinted-fill-script`.
- [ ] **Step 5: Live test in the browser pane** on a Vinted page with the runner (the CLAUDE.md snippet): `spor` shows »boost: 2 knyttet« and »boost: mål gemt for 10409100133 …«; `annoncering` has two rows of 12.69 kr with `tal` and `dom`; a second call returns empty `maal`. A failed call (temporarily the wrong header via the console is not possible — instead verify that the error branch exists in the code and runs `spor`).

### Task 4: Learning and Køb igen

**Files:**
- Modify: `supabase/functions/vinted-fill-script/laering.ts`, `supabase/functions/vinted-fill-script/indkob.ts`

**Interfaces:**
- Consumes: `boostSalg`, `boostLinje`. Both fetch `annoncering` (`listing_id, start, slut, kr, tal`) for the listings.

- [ ] **Step 1:** `laering.ts`: the first line of each item gets ` · ` + `boostLinje(...)` per row; SYSTEM gets »- Et salg under eller lige efter et betalt boost beviser ikke, at pris, tekst eller billeder virkede, og hjerter fra en boostperiode er pustet op.«
- [ ] **Step 2:** `indkob.ts`: `Vare` gets `boostet: boolean`, `boostSalg: boolean`; `samle` computes the `let` median on sales with `!boostSalg` (none → `dom` can be at most `saelger`); the `hjerterPrDag` median excludes `boostet`; `udfald` + » (boostet)«. Make `dom` take `medianDageUdenBoost` as an extra field.
- [ ] **Step 3:** `mode:'laer'` and `mode:'indkob'` live (curl with the key) → 200, and the output for nr 55/7 says »boostet«. Commit + publish.

### Task 5: The app

**Files:**
- Modify: `app.js` (`hentKonto`/`tegnKonto`, the item page's Vinted row and marketplace rows, the form for manual registration), `style.css` (`.ann-…`), `tools/proeve-mock.js` (the mock answers `annoncering`)

**Interfaces:**
- Consumes: the tables. The app's copy of `boostSalg` (`erBoostSalg`) — note »ret sammen med `_shared/annoncering.ts`«.

- [ ] **Step 1:** Konto: fetch `annoncering` (`kr, start, slut, listing_id, draft_id, plads`); rows »Annoncering (N varer)« `ca. ` + krSum, »Tilbage efter AI og annoncering« (replaces »Tilbage efter AI«), »Boost: N boostede · M solgt under/efter« (+ » · X kr pr. salg« when M>0); the sales list adds »boostet« for boost sales; the summary line under the total mentions annoncering when > 0.
- [ ] **Step 2:** Item page: under the Vinted row (and DBA/Reshopper) for each row of the item: »Boostet · ender om N d · 12,69 kr« / »Boostet 19.–22. okt · 12,69 kr«, the funnel »2.397 vist → 54 klik (2,3 %) → 6 ♥ (11,1 %) → 0 beskeder«, and the `dom` under it; manual rows have a »Slet« link. No funnel without `tal`.
- [ ] **Step 3:** »Betalt annoncering« on each marketplace row that is sent there: opens an inline form (Beløb kr, Dage, Slags: Boost / Topannonce / Andet) → `insert` with `kilde:'dig'`, `start = now`, `slut = now + dage`; validation: amount ≥ 0, days 1–60.
- [ ] **Step 4:** `./build.sh`, check-runner, the preview page (`sh tools/proeve.sh`, preview »app«): nr 55's page at 375 and 1280 px, light and dark; register and delete by hand (in the mock); Konto with the two boosts. Commit + `./tools/udgiv.sh`.

### Task 6: CLAUDE.md, STATUS, final review

- [ ] CLAUDE.md: »Dine beslutninger → Betalt annoncering« (rules), »Målt → Vinted: boost« (the measurements, including `Accept-Language: da-DK`), the parts table (`_shared/annoncering.ts`, `mode:'boost'`, `boostRunde`) and the database table (023). STATUS.md entry. A review agent over the whole branch. Commit and push.
