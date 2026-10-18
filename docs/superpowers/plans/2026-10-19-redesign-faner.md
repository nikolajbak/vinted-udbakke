# Redesign af fanerne — implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fire faner (Lager · Opgaver · Konto · Mere), prisforslag godkendes i Opgaver, Lager med tal-felter og rolige rækker, Konto og Mere i samme stil — udgivet i tre trin.

**Architecture:** Alt bygges i de eksisterende `index.html`, `style.css` og `app.js` (én IIFE, ingen moduler, ingen byggetrin ud over `build.sh`). Hvert trin slutter med en udgivelse via `./tools/udgiv.sh` og en prøve på telefonen, før næste trin begynder. Kun runnerens »tilbage til fanen« rører serveren.

**Tech Stack:** Vanilla JS (ES5-stil: `var`, `function`, strengsammensætning), vanilla CSS med tokens på `:root`, Supabase JS-klienten (`sb`), GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-19-redesign-faner-design.md` — læs den først.

## Global Constraints

- Paletten, temaerne og kontrastkravet 4,5:1 fra 17. oktober ændres ikke; nye farver er kun eksisterende tokens (`--ink`, `--ink-soft`, `--line`, `--accent`, `--accent-soft`, `--amber`, `--amber-soft`, `--danger-tekst`, `--raised`, `--paper`).
- Én skrift: Libre Franklin. Tal med `font-variant-numeric: tabular-nums`. Ingen versaler, ingen mono.
- Ingen `object-fit: cover` på et annoncebillede — altid `contain` på papirfarven.
- Nye CSS-klasser får præfiks: `opg-…` (Opgaver), `lager-…`/`lr-…` (Lager), `mv-…` (Mere), `konto-…` (Konto). Genbrug ikke `.label`, `.h` eller andre korte navne til noget nyt.
- Priser vises med `kr()` (»89,00 kr«), summer med `krSum()` (»1.043,00 kr«).
- `window.__UDBAKKE_*` må ikke omdøbes. Runnerens regex og appens regex for faner skal ændres sammen (Task 1).
- Kodestil: som omgivelserne — `var`, `function`, `$('id')`, `esc()`, danske navne uden æøå i identifikatorer, korte danske kommentarer uden æøå.
- Før hver commit, der rører `app.js`/`style.css`: `./build.sh`. `node tools/check-runner.mjs supabase/functions/*/runner.ts app.js` skal være grøn.
- Højst én accent-knap (`btn-primary`) pr. skærm.
- Varens side og Redigér ændres ikke.
- Afprøv aldrig noget, der GEMMER på Vinted, fra browserruden.

## Test-opsætning (gælder alle tasks)

Projektet har ingen testramme. En »test« er et JavaScript-udtryk, der køres
i prøvesiden med browserrudens `javascript_tool` og skal returnere det
angivne resultat.

- Byg prøvesiden: `sh tools/proeve.sh` → preview »app« → `http://localhost:8765/proeve.html`.
- Efter en ændring: genindlæs; slår CSS ikke igennem, afregistrér service workeren (`navigator.serviceWorker.getRegistrations()` → `unregister()`) og genindlæs.
- Telefon: `resize_window` preset `mobile` (375 px). Computer: 1280×800. Tema: `colorScheme` `light` og `dark`.
- Mock'en (`tools/proeve-mock.js`) svarer på alle Supabase-kald; skrivninger sendes ikke.

## Review Focus

1. **Mac-webappen kommer tilbage fra Vinted til en fane, der ikke længere findes** — runneren sender `#fane-vagt` (og kender ikke `opgaver`). Forventet: `#fane-vagt` lander i Mere, `#fane-opgaver` i Opgaver. Testet i Task 1.
2. **Listings kan ikke hentes** (offline, fejl). Forventet: Opgaver viser stadig opgaverne fra udkastene og en fejllinje med »Prøv igen« for prisforslagene; tallet på fanen tæller kun det, der kendes; intet kaster. Testet i Task 2.
3. **»Godkend alle«, hvor ét forslag fejler.** Forventet: beskeden siger, hvor mange der blev godkendt; listen hentes forfra, så det fejlede står tilbage; tallet på fanen passer. Testet i Task 2.
4. **Et udkast ændres i realtid, mens Opgaver er fremme** (fx solgt-mail). Forventet: Opgaver tegnes om uden at hoppe til toppen. Testet i Task 2.
5. **Computerskærmen (≥960 px) med Prisvagt som underskærm.** Forventet: sidebjælken står fast, »Mere« er markeret, tilbagepilen fører til Mere. Testet i Task 7.

---

## Trin 1 — fanerne og Opgaver

### Task 0: Mock'en giver udkastene deres annoncer

Prøvesiden viste 54 »ikke tilknyttet«, fordi mock'en ikke kan indlejre `listings(...)` i `drafts`. Uden det kan hverken Lager eller Opgaver bedømmes.

**Files:**
- Modify: `tools/proeve-mock.js` (GET-grenen, ca. linje 42-51)

**Interfaces:**
- Produces: på prøvesiden har hver `rows[id].listings` de rækker fra `proeve/listings.json`, hvis `draft_id === id`.

- [ ] **Step 1: Test (skal fejle før)**

```js
await new Promise(r=>setTimeout(r,4000));
/5\d ting mere/.test(document.querySelector('.opg-baand')?.textContent || '')
```
Forventet før: `true` (båndet »53 ting mere venter på dig«).

- [ ] **Step 2: Implementér**

I GET-grenen: når tabellen er `drafts` og `select` indeholder `listings(`, så læg `body[i].listings = listings.filter(l => l.draft_id === body[i].id)` på hver række (listings.json er allerede indlæst af mock'en).

- [ ] **Step 3: Test**

```js
location.reload();  // vent 4 s, så:
document.querySelector('.opg-baand') === null || !/5\d ting/.test(document.querySelector('.opg-baand').textContent)
```
Forventet: `true`, og Ude-kortene viser »♥ N · N dage« i stedet for »ikke bekræftet«.

- [ ] **Step 4: Commit**

```bash
git add tools/proeve-mock.js
git commit -m "Prøvesiden: udkastene får deres annoncer fra listings.json"
```

### Task 1: Fire faner, Opgaver-skærm og Prisvagt som underskærm

**Files:**
- Modify: `index.html` (fanebjælken linje ~102-120, `#s-vagt` linje ~392, `#s-menu` linje ~161, ny `<section id="s-opgaver">`)
- Modify: `app.js` (`RODER` ~167, `hentFane` ~183, `aabnFraAdresse` ~3093, `opdaterVagtTal` ~3614 og dens kaldere)
- Modify: `supabase/functions/vinted-fill-script/runner.ts:659` (regex i `tilbageTil`)
- Modify: `style.css` (computerskærmens regler sidst i filen: `#s-opgaver` som de andre rødder)

**Interfaces:**
- Produces:
  - Skærm `opgaver` (`#s-opgaver`, krop `#opgaver-body`), rod i `RODER = { queue:1, opgaver:1, konto:1, menu:1 }`.
  - Fanebjælkens knap `data-til="opgaver"` med tallet `<span class="tal fod-tal" id="fod-opg-tal" hidden>`.
  - `hentFane('opgaver')` kalder `hentOpgaver()` (defineres i Task 2; i denne task en stub, der tegner `#opgaver-body` tom).
  - `vagt` er ikke længere en rod: `#s-vagt` får tilbagepil (`data-back`), og Mere får en række `#m-vagt` »Prisvagt«, der kalder `show('vagt'); hentVagt();` (erstattes af kortet i Task 7).
  - `aabnFraAdresse`: regex `/^#fane-(queue|opgaver|vagt|konto|menu)$/`; `vagt` → `skiftFane('menu')`.
  - Runneren: `tilbageTil` accepterer `queue|opgaver|vagt|konto|menu`.

- [ ] **Step 1: Test (skal fejle før)**

```js
({ faner: [...document.querySelectorAll('#fanebar [data-til]')].map(b=>b.dataset.til).join(','),
   opg: !!document.getElementById('s-opgaver') })
```
Forventet før: `{faner:"queue,vagt,konto,menu", opg:false}`.

- [ ] **Step 2: Implementér markup, `RODER`, `hentFane`, `aabnFraAdresse`, `#m-vagt` og runnerens regex som beskrevet under Interfaces.** Ikonet til Opgaver: en tjekliste (`<path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>`). Fjern `fod-vagt-tal`; `opdaterVagtTal` skriver ikke længere i den (Task 2 erstatter den).

- [ ] **Step 3: Test**

```js
const r = {};
r.faner = [...document.querySelectorAll('#fanebar [data-til]')].map(b=>b.dataset.til).join(',');
document.querySelector('#fanebar [data-til="opgaver"]').click();
await new Promise(x=>setTimeout(x,400));
r.synlig = [...document.querySelectorAll('.screen')].filter(s=>!s.hidden).map(s=>s.id).join(',');
r
```
Forventet: `faner:"queue,opgaver,konto,menu"`, `synlig:"s-opgaver"`. Genindlæs med `proeve.html#fane-vagt` → synlig skærm `s-menu`. I Mere: tryk »Prisvagt« → `s-vagt` med tilbagepil; tilbage → `s-menu`.

- [ ] **Step 4: Runner-tjek**

Run: `node tools/check-runner.mjs supabase/functions/*/runner.ts app.js`
Expected: ingen »kaldt, ikke defineret«.

- [ ] **Step 5: Commit**

```bash
./build.sh
git add index.html app.js style.css supabase/functions/vinted-fill-script/runner.ts
git commit -m "Fire faner: Opgaver ind, Prisvagt bliver underskærm fra Mere"
```

### Task 2: Opgaver-listen med prisforslag

**Files:**
- Modify: `app.js` — `opgaveKort` (~601), `tegnOpgaver` (~606-686), `renderQueue` (~517), `tegnVagt` (~3364-3399), `opdaterVagtTal` (~3614)
- Modify: `index.html` — fjern `<div id="opgaver"></div>` fra `#s-queue`
- Modify: `style.css` — fjern `.opg-baand`-reglerne; tilføj `opg-…`

**Interfaces:**
- Consumes: `#opgaver-body`, `#fod-opg-tal`, `hentFane('opgaver')` fra Task 1; `godkendForslag(l) -> Promise<boolean>`, `afvisForslag(l) -> Promise<boolean>`, `harForslag(l) -> boolean`, `visFejl(el, overskrift, besked, igen)`.
- Produces:
  - `samlOpgaver(alle: Draft[]) -> Array<{o:number, h:string}>` — det, `tegnOpgaver` samler i dag, sorteret på `o`; tegner intet.
  - `opgaveKort(tekst, under, knapper, slags)` sætter klassen `opg-kant-rod` for `ned`, `opg-kant-rav` for `svar|fejl|send|knyt`, ingen kant for `salg`.
  - `var OPG_FORSLAG = null` (null = ikke hentet, `[]` = ingen, `'fejl'` = kunne ikke hentes) og `hentOpgaver()` → henter `sb.from('listings').select('*').eq('status','aktiv').not('forslag','is',null)`, sætter `OPG_FORSLAG`, kalder `tegnOpgaveSkaerm()` og `opdaterOpgaveTal()`.
  - `tegnOpgaveSkaerm()` tegner `#opgaver-body` (rækkefølge nedenfor) og binder knapperne.
  - `aktuelleUdkast() -> Draft[]` — udkastene med `status` i `['ny','afventer','kladde','afsendt']` (det filter, `renderQueue` har i dag); `renderQueue` bruger den også.
  - `opdaterOpgaveTal()` erstatter `opdaterVagtTal()` overalt: tal = `samlOpgaver(aktuelleUdkast()).length + (Array.isArray(OPG_FORSLAG) ? OPG_FORSLAG.filter(harForslag).length : 0)`, skrevet i `#fod-opg-tal` (skjult ved 0).
  - `renderQueue()` kalder ikke længere noget, der tegner på Lager; den kalder `opdaterOpgaveTal()`, og `tegnOpgaveSkaerm()` når `#s-opgaver` er synlig.
  - Ved opstart — de to steder, der i dag kalder `opdaterVagtTal()` efter indlæsningen af udkastene (~3937 og ~3968) — kaldes `hentOpgaver()`, så tallet på fanen passer, før Opgaver er åbnet.

**Skærmens rækkefølge (`tegnOpgaveSkaerm`):**
1. Kort med `o` < 4 (`ned`, `svar`, `fejl`, `send`) og `knyt` — som `.opgave` med deres kant.
2. Er der forslag: `<div class="opg-grp"><span class="label">Prisforslag · N</span><button class="btn-link" id="opg-godkend-alle">Godkend alle</button></div>` (knappen kun ved N > 1), så én `opg-forslag`-række pr. listing: billede (`rows[l.draft_id].image_url`, 44×58, `contain`), titel (`l.title`), én linje begrundelse (`l.forslag.note`, forkortet med CSS), `×` (`data-f="afvis"`, `aria-label="Afvis"`) og en `btn-primary`-knap med `kr(l.forslag.price)` (`data-f="godkend"`). Tryk på række (ikke knapperne) → `openDetail(l.draft_id)`, hvis udkastet findes. `OPG_FORSLAG === 'fejl'` → en linje »Prisforslagene kunne ikke hentes« med »Prøv igen« (`hentOpgaver`).
3. Kort med `slags === 'salg'` (»hvad gik den for?«).
4. Intet af det: `<div class="empty"><h3>Intet venter på dig</h3><p>Nye opgaver dukker op her, fx når en vare er solgt eller en køber skriver.</p></div>` med et flueben-SVG i stedet for `empty-mark`.

Godkend/afvis: deaktivér knappen, kald `godkendForslag`/`afvisForslag`, vis samme beskeder som `vagtHandling` i dag, og kald `hentOpgaver()`. »Godkend alle«: `Promise.all(forslag.map(godkendForslag))`, besked »N priser godkendt — sættes, næste gang Vinted er åben« (N = antal `true`), så `hentOpgaver()`.

`tegnVagt`: fjern gruppen »Til godkendelse« og `#vagt-godkend-alle`; forslagene vises ikke længere på Prisvagt. `tilGodkendelse`-annoncer kommer i stedet med under »Holder øje«.

**CSS:** `.opg-kant-rod{ box-shadow: inset 3px 0 0 var(--danger-tekst) }` og `.opg-kant-rav{ box-shadow: inset 3px 0 0 var(--amber) }` — har `.opgave` i dag en ydre skygge, så sæt den efter den indre i samme `box-shadow`. `.opg-forslag{ display:grid; grid-template-columns: 44px 1fr auto; gap: var(--s3); align-items:center; padding: var(--s2) 0; border-bottom: 1px solid var(--line) }`; begrundelsen `white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size: var(--t-small); color: var(--ink-soft)`. Computerskærm: `#s-opgaver .body` holder 680 px som Opsætning.

- [ ] **Step 1: Test (skal fejle før)**

```js
document.querySelector('#fanebar [data-til="opgaver"]').click();
await new Promise(r=>setTimeout(r,1500));
({ forslag: document.querySelectorAll('#opgaver-body .opg-forslag').length,
   paaLager: document.querySelectorAll('#s-queue .opgave').length })
```
Forventet før: `{forslag:0, paaLager:1}` (eller mere).

- [ ] **Step 2: Implementér `samlOpgaver`, `opgaveKort`-kanten, `OPG_FORSLAG`, `hentOpgaver`, `tegnOpgaveSkaerm`, `opdaterOpgaveTal` og ændringerne i `renderQueue`, `tegnVagt` og `index.html` som beskrevet. Erstat alle kald af `opdaterVagtTal()` med `opdaterOpgaveTal()`. Slet `OPG_AABEN` og `.opg-baand`.**

- [ ] **Step 3: Test — listen og tallet**

```js
document.querySelector('#fanebar [data-til="opgaver"]').click();
await new Promise(r=>setTimeout(r,1500));
const n = document.querySelectorAll('#opgaver-body .opg-forslag').length;
({ forslag: n,
   alle: !!document.getElementById('opg-godkend-alle'),
   paaLager: document.querySelectorAll('#s-queue .opgave').length,
   tal: document.getElementById('fod-opg-tal').textContent,
   kanter: document.querySelectorAll('#opgaver-body .opg-kant-rod, #opgaver-body .opg-kant-rav').length,
   vagtGodkend: !!document.getElementById('vagt-godkend-alle') })
```
Forventet: `forslag` = antal rækker i `proeve/listings.json` med `status==='aktiv'` og `forslag.price > 0` (13 den 19. oktober), `alle:true`, `paaLager:0`, `tal` = `forslag` + antal `.opgave` i `#opgaver-body`, `vagtGodkend:false`.

- [ ] **Step 4: Test — Review Focus 2 (listings fejler)**

```js
const ægte = window.fetch;
window.fetch = (u,o) => /\/listings/.test(String(u)) ? Promise.reject(new Error('offline')) : ægte(u,o);
document.querySelector('#fanebar [data-til="queue"]').click();
document.querySelector('#fanebar [data-til="opgaver"]').click();
await new Promise(r=>setTimeout(r,1500));
window.fetch = ægte;
({ fejl: /kunne ikke hentes/.test(document.getElementById('opgaver-body').textContent),
   tal: document.getElementById('fod-opg-tal').textContent || '0' })
```
Forventet: `fejl:true`, `tal` = antal `.opgave` (forslag tælles ikke), ingen fejl i `read_console_messages` ud over det afviste kald.

- [ ] **Step 5: Test — Review Focus 3 (Godkend alle med én fejl)**

Lad mock'en svare 500 på den første `PATCH …/listings?id=eq.<første forslags id>` (overstyr `window.fetch` som i Step 4 for netop den adresse), tryk `#opg-godkend-alle`, vent 1,5 s.
Forventet: beskeden (`.toast`) siger »12 priser godkendt …« (N−1), og `hentOpgaver` er kaldt (listen er tegnet forfra — på prøvesiden står alle 13 stadig, fordi mock'en ikke gemmer; det er godt nok her).

- [ ] **Step 6: Test — Review Focus 4 (realtid, mens Opgaver er fremme)**

`renderQueue` er privat, så udløs den med en knap, der kalder den: »Taget ned« på en solgt-opgave eller »Klaret« på en køberopgave (begge kalder `renderQueue`). Findes ingen af dem i prøvedata, så læg midlertidigt en køberbesked i `proeve/`-dataene, og fjern den igen bagefter.

```js
const b = document.querySelector('#s-opgaver .body'); b.scrollTop = 200;
const før = b.scrollTop;
document.querySelector('#opgaver-body [data-op^="ned-"], #opgaver-body [data-op="svar-klaret"]').click();
await new Promise(r=>setTimeout(r,800));
({ synlig: !document.getElementById('s-opgaver').hidden, rul: b.scrollTop === før || b.scrollHeight <= b.clientHeight })
```
Forventet: `{synlig:true, rul:true}` — skærmen tegnes om uden at rulle til toppen.

- [ ] **Step 7: Visuelt**

Ét skærmbillede (scale 0.6) i 375 px, lyst og mørkt: kanterne ses, rækkerne flugter, knappen med prisen står på linje. Mål kontrasten på begrundelsen (`--ink-soft` på `--paper`) med JavaScript: ≥ 4,5.

- [ ] **Step 8: Commit**

```bash
./build.sh
git add app.js index.html style.css
git commit -m "Opgaver: én liste med det akutte, prisforslag og salgspriser"
```

### Task 3: Udgiv trin 1

**Files:**
- Modify: `CLAUDE.md` — »Appens opbygning« (fire faner, Opgaver), »Lageret« (opgaverne står i Opgaver, ikke øverst på forsiden), »Prisvagten → Kun forslag« (»Appen«-punktet: forslag godkendes i Opgaver; ingen gruppe på Prisvagt), noten om redesignet (trin 1 ude).
- Modify: `STATUS.md` — ny øverste post: trin 1 ude, hvad der er afprøvet på prøvesiden, »ikke afprøvet: telefonen«.

- [ ] **Step 1: Ret `CLAUDE.md` og `STATUS.md` som ovenfor.**
- [ ] **Step 2: Commit og udgiv**

```bash
git add CLAUDE.md STATUS.md
git commit -m "Notér trin 1 af redesignet"
./tools/udgiv.sh
```
Expected: »udgivelse-NNNN er ude.«, og `vinted-fill-script` er med (runnerens regex).

- [ ] **Step 3: Stop.** Bed brugeren prøve Opgaver på telefonen (godkend ét forslag, se det sat næste gang Vinted er åben). Næste trin først efter deres ja.

---

## Trin 2 — Lager

### Task 4: Tal-felterne

**Files:**
- Modify: `index.html` — `#faner` i `#s-queue` (linje ~72-76)
- Modify: `app.js` — `renderQueue` (~501-520)
- Modify: `style.css` — `lager-felt…`

**Interfaces:**
- Produces:
  - Markup: `<div class="lager-felter" role="tablist" id="faner">` med tre `<button type="button" role="tab" class="lager-felt" data-fane="klar|ude|solgt">` hver med `<span class="lager-felt-n" id="tal-klar">`, `<span class="lager-felt-t">Klar</span>`, `<span class="lager-felt-s" id="sum-klar">`. Id'erne `tal-*` og `data-fane` bevares, så den eksisterende klik-binding (~443) virker uændret.
  - `faseSum(f: 'klar'|'ude'|'solgt', alle: Draft[]) -> number`:
    - klar: Σ `prisTal(d.price)` over udkast i fasen, hvor tallet er endeligt.
    - ude: Σ `nuPris(d)` (endelige).
    - solgt: Σ over solgte Vinted-annoncer `Number(l.sold_price != null ? l.sold_price : l.price)` — samme regel som `salgspris` i `tegnKonto`.
  - `renderQueue` skriver antal i `tal-*` (»0« vises som »0«, ikke tom) og `krSum(faseSum(...))` i `sum-*` (tom ved 0).

**CSS:** `.lager-felter{ display:grid; grid-template-columns: repeat(3,1fr); gap: var(--s2) }`; `.lager-felt{ background: var(--raised); border: 0; border-radius: 12px; padding: var(--s3); text-align:left; box-shadow: 0 1px 0 var(--line) }`; `.lager-felt.on{ background: var(--ink); color: var(--paper) }`; `-n` 22 px/700/`-0.03em`; `-t` og `-s` `var(--t-small)`, `-s` med `opacity:.75`. Computerskærm: felterne fylder bredden.

- [ ] **Step 1: Test (skal fejle før)**

```js
({ felter: document.querySelectorAll('#s-queue .lager-felt').length, sum: !!document.getElementById('sum-ude') })
```
Forventet før: `{felter:0, sum:false}`.

- [ ] **Step 2: Implementér markup, `faseSum` og `renderQueue`-ændringen.**

- [ ] **Step 3: Test**

```js
const t = id => document.getElementById(id).textContent;
({ felter: document.querySelectorAll('#s-queue .lager-felt').length,
   ude: t('tal-ude'), udeSum: t('sum-ude'), solgtSum: t('sum-solgt'),
   on: document.querySelector('.lager-felt.on')?.dataset.fane })
```
Forventet: `felter:3`; `ude` = antal rækker under Ude; `udeSum` på formen `/^\d{1,3}(\.\d{3})*,00 kr$/`; `solgtSum` = »Omsætning i alt« på Konto-fanen (læs den med `get_page_text` efter et skift til Konto og sammenlign).

- [ ] **Step 4: Commit**

```bash
./build.sh
git add index.html app.js style.css
git commit -m "Lager: Klar · Ude · Solgt som tal-felter med summen"
```

### Task 5: De rolige rækker

**Files:**
- Modify: `app.js` — `kortLinjer` (~243), `linjeTre` (~454), rækkerne i `renderQueue` (~535-560)
- Modify: `style.css` — `.row`-reglerne for Lager og computerskærmens gitter (»Computerskaermen« sidst i filen)
- Modify: `index.html` — skelettets rækker (`#queue-loading`) får rækkens nye form

**Interfaces:**
- Produces:
  - `raekkeTekst(d) -> string` (erstatter `kortLinjer`): tre `<span class="lr-l">`:
    1. `[d.brand, d.category].join(' · ')` (samme reserve som i dag: `d.title`, »Ufærdig billedserie«, »Nyt udkast«)
    2. `[størrelse, farve, stand]` — `d.size` skrives som i dag (»Str. M«); **uden materiale**. Tom → samme reserve som i dag (antal billeder / tidspunkt).
    3. `fmtNr(d.nr)` i `<span class="lr-nr">` + `markedsMaerker(d)` + `<span class="kort-vent">rettelse venter</span>`, hvis `venterFelter(vintedAnnonce(d)).length`.
  - `raekkePris(d) -> { pris: string, under: string, rav: boolean }` (erstatter `linjeTre`):
    - klar: `pris = kortPris(d.price)` for `ny`/`afsendt`, ellers `koeStatus(d)`; `under = ''`.
    - ude med annonce: `pris = kr(nuPris(d))`, `under = '♥ ' + favourites + ' · ' + dage + ' d'`. Uden annonce: `pris = kr(nuPris(d))`, `under = 'ikke bekræftet'`.
    - solgt: `pris = kr(sold_price)`, `under = dage + ' d'`; mangler `sold_price`: `pris = 'tast salgsprisen'`, `rav = true`; ingen solgt annonce: `pris = 'taget ned'`.
  - Rækken: `<button class="row lr" data-id>` med `<img>` (eller `.ph`), `<span class="lr-tekst">raekkeTekst</span>`, `<span class="lr-hoejre"><b class="lr-pris">…</b><small>…</small></span>`. `.swipe`-indpakningen, `swipe-del`, `is-muted` og klik-bindingen er uændrede. Chevronen udgår.
  - `kortLinjer` og `linjeTre` slettes, når intet kalder dem (`grep -n "kortLinjer\|linjeTre" app.js` → kun definitionerne).

**CSS (Lager):** `#queue-list .row{ display:grid; grid-template-columns: 72px 1fr auto; gap: var(--s3); align-items:center; background: transparent; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; box-shadow:none; padding: var(--s3) 0 }`; billedet `width:72px; height:96px; object-fit: contain; background: var(--surface); border-radius: 8px`; `.lr-l` én linje med »…«; `.lr-l:first-child{ font-weight:600 }`; `.lr-l + .lr-l{ color: var(--ink-soft); font-size: var(--t-small) }`; `.lr-pris{ font-size: 16px; font-weight:700; font-variant-numeric: tabular-nums; text-align:right; display:block }`; `.lr-hoejre small{ display:block; text-align:right; color: var(--ink-soft); font-size: var(--t-label) }`; `.lr-pris.rav{ color: var(--amber) }`. Hover (mus) og `:active` som i dag, men uden kant. Computerskærm: `#queue-list{ display:grid; grid-template-columns: 1fr 1fr; column-gap: var(--s6) }` i stedet for kortgitteret.

- [ ] **Step 1: Test (skal fejle før)**

```js
const r = document.querySelector('#queue-list .row');
({ lr: r.classList.contains('lr'), billedH: r.querySelector('img')?.getBoundingClientRect().height })
```
Forventet før: `lr:false`.

- [ ] **Step 2: Implementér `raekkeTekst`, `raekkePris`, rækkerne, CSS og skelettet; slet `kortLinjer`/`linjeTre`.**

- [ ] **Step 3: Test**

```js
const rk = [...document.querySelectorAll('#queue-list .row')];
const r = rk[0], cs = getComputedStyle(r);
({ lr: r.classList.contains('lr'),
   billedH: Math.round(r.querySelector('img').getBoundingClientRect().height),
   fit: getComputedStyle(r.querySelector('img')).objectFit,
   kant: cs.borderTopWidth + ' ' + cs.borderBottomWidth,
   materiale: rk.some(x => /bomuld|polyester|uld|hør/i.test(x.querySelector('.lr-tekst').textContent)),
   nr: /^#\d{4}/.test(r.querySelector('.lr-nr').textContent),
   under: r.querySelector('.lr-hoejre small').textContent })
```
Forventet (fasen Ude): `lr:true`, `billedH:96`, `fit:"contain"`, `kant:"0px 1px"`, `materiale:false`, `nr:true`, `under` på formen `/^♥ \d+ · \d+ d$/`. Skift til Solgt: mindst én række med `pris = "tast salgsprisen"` har klassen `rav`, hvis data har sådan én. Kør `check-runner`.

- [ ] **Step 4: Visuelt** — ét skærmbillede i 375 px og ét i 1280 px (to spalter), lyst og mørkt. Swipe på en Klar-række virker stadig (træk med `left_click_drag` 120 px til venstre → »Kassér« ses; tryk et andet sted → lukker).

- [ ] **Step 5: Commit**

```bash
./build.sh
git add app.js style.css index.html
git commit -m "Lager: rolige rækker uden kasser, store billeder, prisen til højre"
```

### Task 6: Udgiv trin 2

**Files:**
- Modify: `CLAUDE.md` — skriv »Kortene i listen« om til de nye regler (tal-felter, tre linjer uden materiale, løbenummer på linje 3, prisen til højre med linjen under; `raekkeTekst`/`raekkePris`); »Appens opbygning → Lager« (rækker i to spalter på computeren); noten om redesignet (trin 2 ude).
- Modify: `STATUS.md`

- [ ] **Step 1: Ret filerne.**
- [ ] **Step 2: Commit og udgiv**

```bash
git add CLAUDE.md STATUS.md
git commit -m "Notér trin 2 af redesignet"
./tools/udgiv.sh
```
- [ ] **Step 3: Stop.** Bed brugeren se Lager på telefonen. Næste trin først efter deres ja.

---

## Trin 3 — Mere, Prisvagt og Konto

### Task 7: Mere med prisvagtens kort; Prisvagt som stille underskærm

**Files:**
- Modify: `index.html` — `#s-menu` (linje ~161-206)
- Modify: `app.js` — `tegnTjek` (~2202; skriver i dag i `#tjek`), `hentFane('menu')`, `vagtStatus` (~3292), `tegnVagt` (afsnitstekster ~3366-3371), `#m-vagt` fra Task 1
- Modify: `style.css` — `mv-…`, fjern `.tjek-kort`-reglerne, når intet bruger dem

**Interfaces:**
- Consumes: `VAGT_NU_URL`, `aabnUdad(url)`, `VAGT_PULS`, `hentVagt()`, `show(name)`.
- Produces:
  - `hentMereVagt()` — henter `sb.from('listings').select('id, status, pending, pending_since, next_check_at, auto')` og `puls` (`prisvagt`, `prisvagt-dagligt`), og tegner `#mv-vagt`: `<button class="mv-vagt" id="mv-vagt">` med »Holder øje med N« (N = `aktiv`+`pause`), en pille `mv-pille ok` »Kører« eller `mv-pille adv` »Forsinket« (forsinket = mindst én aktiv annonce med `next_check_at` over 24 t gammel og intet `prisvagt-dagligt` inden for 26 t — samme regel som `vagtStatus`'s »Slå dagligt tjek til«), linjen »Sidste tjek … · dagligt tjek slået til/ikke slået til« og `<span class="btn btn-primary" id="mv-vagt-nu">Tjek priserne nu</span>`. Tryk på kortet → `show('vagt'); hentVagt()`; tryk på knappen → `aabnUdad(VAGT_NU_URL)` (og `stopPropagation`). Fejl ved hentning: kortet viser »Prisvagten kunne ikke hentes« og åbner stadig skærmen.
  - `hentFane('menu')` kalder `hentMereVagt(); tegnTjek(); tegnVersion();`.
  - `tegnTjek()` skriver kun statuslinjen i `#opsaet-tal` (»Alt virker« eller »N ting skal ses på« med klassen `mv-adv`) og opsætningstrinnene, som i dag; `#tjek` og `.tjek-kort` fjernes.
  - Mere-markup, ovenfra: `#mv-vagt`; så én `.gruppe` med `menu-item` i rækkefølgen Opsætning (`#m-opsaet`, undertekst `#opsaet-tal`), Etiketter (`#m-labels`), Køb igen (`#m-indkob`); så `<span class="label">Udseende</span>` + den eksisterende `#tema`; så `#m-logout` med klassen `menu-fare` (tekst i `--danger-tekst`); så `#mere-version`. `#m-vagt` fra Task 1 slettes. `.mere-blok`/`.gruppe-navn` udgår.
  - `tegnVagt`: afsnitsteksterne bliver én linje: »Holder øje« → »Foreslår en lavere pris, når den står højt mod lignende varer.«; »Ny pris på vej« → »Sættes af sig selv, næste gang Vinted er åben.«; »Rører ikke prisen« → »På pause eller stoppet.«. `vagtStatus` beholder sin knap »Tjek priserne nu« (den eneste `btn-primary` på Prisvagt).

- [ ] **Step 1: Test (skal fejle før)**

```js
document.querySelector('#fanebar [data-til="menu"]').click();
await new Promise(r=>setTimeout(r,1200));
({ kort: !!document.getElementById('mv-vagt'), tjek: !!document.getElementById('tjek') })
```
Forventet før: `{kort:false, tjek:true}`.

- [ ] **Step 2: Implementér som beskrevet.**

- [ ] **Step 3: Test**

```js
document.querySelector('#fanebar [data-til="menu"]').click();
await new Promise(r=>setTimeout(r,1500));
const m = document.getElementById('s-menu');
({ kort: /Holder øje med \d+/.test(document.getElementById('mv-vagt').textContent),
   pille: !!m.querySelector('.mv-pille'),
   primaer: m.querySelectorAll('.btn-primary').length,
   raekker: [...m.querySelectorAll('.menu-item')].map(b=>b.id).join(','),
   opsaet: document.getElementById('opsaet-tal').textContent,
   tjek: !!document.getElementById('tjek') })
```
Forventet: `kort:true`, `pille:true`, `primaer:1`, `raekker:"m-opsaet,m-labels,m-indkob,m-logout"`, `opsaet` er »Alt virker« eller `/^\d+ ting skal ses på$/`, `tjek:false`.

- [ ] **Step 4: Test — Review Focus 5 (computerskærm)**

`resize_window` 1280×800, så:
```js
document.getElementById('mv-vagt').click();
await new Promise(r=>setTimeout(r,600));
({ synlig: [...document.querySelectorAll('.screen')].filter(s=>!s.hidden).map(s=>s.id).join(','),
   fanebarI: document.getElementById('fanebar').parentNode.id,
   markeret: document.querySelector('#fanebar .fane-knap.on')?.dataset.til,
   pil: !!document.querySelector('#s-vagt [data-back]') })
```
Forventet: `synlig:"s-vagt"` (efter overgangen), `fanebarI:"app"`, `markeret:"menu"`, `pil:true`. Tryk pilen → `s-menu`. Sæt bagefter `resize_window` preset `desktop`.

- [ ] **Step 5: Visuelt** — Mere og Prisvagt i 375 px, lyst og mørkt; ét skærmbillede hver.

- [ ] **Step 6: Commit**

```bash
./build.sh
git add index.html app.js style.css
git commit -m "Mere: prisvagtens kort øverst, rækker i stedet for blokke; Prisvagt med korte tekster"
```

### Task 8: Konto

**Files:**
- Modify: `app.js` — `tegnKonto` (~3777-3900), `kontoFelt` (~3770)
- Modify: `style.css` — `konto-…`-reglerne, også computerskærmens 12-spalte-gitter

**Interfaces:**
- Consumes: de tal, `tegnKonto` regner i dag (omsætning, `udenPris`, denne/forrige måned, `medDage`, ude nu, salgspris i % af udbud, månederne, favoritter, alle salg, `forbrug` i kr via `USD_KR`, `tagetNed`). Ingen beregning ændres.
- Produces — markup i `#konto-body`, ovenfra:
  1. `<div class="konto-top"><span class="label">Omsætning i alt</span><div class="konto-stor">krSum(omsaetning)</div><div class="konto-linje">N salg · i snit X · ca. Y kr brugt på AI</div></div>` — »i snit« = `krSum(round(omsaetning/N))`; AI-delen udelades, hvis `forbrug` er tom. Står der `udenPris`, tilføjes »· N uden salgspris« i rav.
  2. Søjlerne for seks måneder (den eksisterende `konto-graf`), indeværende måned i `--accent`, resten `--accent-soft`; månedsnavnet under hver.
  3. `<div class="konto-kv">` med rækkerne (`<div class="konto-kv-r"><span>navn</span><b>værdi</b></div>`): Ude nu (»47 · 7.475,00 kr«), Tid til salg (»9 dage«, median), Salgspris af udbud (»87 %«), Denne måned, Sidste måned.
  4. Mest favoritmarkerede og alle salg som i dag, men som rækker med streger (`konto-kv-r`, titel som link til varen).
  5. Én dæmpet linje: »DBA og Reshopper tæller ikke med — appen kender ikke deres salg (N taget ned).«
  - `kontoFelt` og `.konto-gitter`/`.konto-felt` slettes, når intet bruger dem.
- Computerskærm: `konto-top` + søjler i venstre halvdel, `konto-kv` i højre, listerne under i to spalter (erstatter `konto-maaned`/`-udgift`/`-ude`/`-salg`).

- [ ] **Step 1: Test (skal fejle før)**

```js
document.querySelector('#fanebar [data-til="konto"]').click();
await new Promise(r=>setTimeout(r,1500));
({ kv: document.querySelectorAll('#konto-body .konto-kv-r').length, felter: document.querySelectorAll('#konto-body .konto-felt').length })
```
Forventet før: `kv:0`, `felter` > 0.

- [ ] **Step 2: Notér tallene før ændringen** (`get_page_text` på Konto): omsætning, ude nu, median, procent, denne/sidste måned.

- [ ] **Step 3: Implementér.**

- [ ] **Step 4: Test**

```js
document.querySelector('#fanebar [data-til="konto"]').click();
await new Promise(r=>setTimeout(r,1500));
const k = document.getElementById('konto-body');
({ stor: k.querySelector('.konto-stor').textContent,
   linje: k.querySelector('.konto-linje').textContent,
   kv: [...k.querySelectorAll('.konto-kv-r span')].map(s=>s.textContent).slice(0,5).join('|'),
   felter: k.querySelectorAll('.konto-felt').length,
   primaer: k.querySelectorAll('.btn-primary').length })
```
Forventet: `stor` = omsætningen fra Step 2; `linje` matcher `/^\d+ salg · i snit [\d.]+,00 kr/`; `kv:"Ude nu|Tid til salg|Salgspris af udbud|Denne måned|Sidste måned"`; `felter:0`; `primaer` ≤ 1. Alle tal fra Step 2 findes stadig på siden (`get_page_text`).

- [ ] **Step 5: Visuelt** — 375 px og 1280 px, lyst og mørkt.

- [ ] **Step 6: Commit**

```bash
./build.sh
git add app.js style.css
git commit -m "Konto: ét stort tal, søjler og nøgletal på rækker"
```

### Task 9: Udgiv trin 3

**Files:**
- Modify: `CLAUDE.md` — »Appens opbygning« (Mere, Konto, Prisvagt som underskærm, computerskærmens Konto/Mere), »Prisvagten → Ingen tjek-knap« (»Tjek priserne nu« sidder i Mere og på Prisvagt), »Lageret → Virker det?« (status som undertekst på Opsætning), »Konto«; slet noten om redesignet i trin og skriv det som gældende.
- Modify: `STATUS.md`

- [ ] **Step 1: Ret filerne.**
- [ ] **Step 2: Commit og udgiv**

```bash
git add CLAUDE.md STATUS.md
git commit -m "Notér trin 3 af redesignet"
./tools/udgiv.sh
python3 tools/tjek-live.py
```
Expected: »udgivelse-NNNN er ude.«, og `tjek-live.py` melder, at telefonen kører det, git siger.
- [ ] **Step 3:** Bed brugeren prøve Mere og Konto på telefonen.
