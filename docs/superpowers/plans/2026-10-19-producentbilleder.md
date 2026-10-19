# Producentens billeder som forlæg — implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opslaget finder producentens billeder af varen på en person og butikkens ord om pasformen; appen viser billederne som forlæg på varens side, optagelsen får trinnet »På kroppen«, og »Tag dit eget som dette« lægger et eget billede til et klar-udkast — intet producentbillede når en annonce.

**Architecture:** De rene dele (kandidater fra HTML, udvælgelse af modellens svar) står i en ny Deno-fri fil `_shared/producentbilleder.ts`, så de kan testes med `node --test`. Modelkaldet og koblingen til opslaget ligger i `_shared/beskrivelse.ts`. Appen kalder serveren via `FILL_API` (`mode:'nytFoto'`), som kalder det eksisterende delkald `analyze-draft {id, photo:n}`.

**Tech Stack:** Supabase Edge (Deno, TypeScript), Anthropic Messages API (Haiku 5.5), vanilla JS i `app.js` (ES5-stil), vanilla CSS, Node 26 (`node --test`, typer strippes af sig selv).

**Spec:** `docs/superpowers/specs/2026-10-19-producentbilleder-design.md` — læs den først.

## Global Constraints

- **Intet producentbillede i `drafts.photos`** — aldrig, ad nogen vej. Kun `drafts.fakta.producentBilleder` (links).
- Poserækkefølgen: `forfra-hel` → `trekvart` → `bagfra` → `naer`. `pakkeshot` og `andet` bruges ikke. Højst én pr. pose, højst 4.
- Kandidater: højst 12; kun adresser, der står i sidens HTML.
- Model: `claude-haiku-5-5`. Hvert kald noteres med `noterForbrug(data, "opslag:billeder", draftId)`.
- Opslaget og analysen må aldrig vælte på billederne eller pasformen — fejl giver bare intet.
- `fakta.pasform` højst 200 tegn.
- Pillens tekst: »Fra producenten · <vært uden www.>«. Linjen under: »Kun til dig — producentens billeder kommer ikke med i annoncen.«
- »Tag dit eget som dette« kun når `fase(d) === 'klar'`. Sekundær knap (ingen ny `btn-primary`).
- Billeder i appen: `object-fit: contain` på papirfarven — aldrig `cover`.
- Nye CSS-klasser: præfiks `.pb-`. Nye id'er: præfiks `pb-`.
- Kodestil som omgivelserne: `app.js` med `var`/`function`/`$('id')`/`esc()`; danske navne uden æøå i identifikatorer; korte kommentarer uden æøå.
- Før en commit, der rører `app.js`/`style.css`: `./build.sh`. `node tools/check-runner.mjs supabase/functions/*/runner.ts app.js` skal være grøn.
- Udgiv kun med `./tools/udgiv.sh`. Midlertidige funktioner slettes bagefter.
- Afprøv intet, der gemmer på Vinted, fra browserruden (her gemmes intet på Vinted).
- Hver regel, del og `fakta`-nøgle skrives i `CLAUDE.md` i den task, der laver den.

## Test-opsætning

- **Rene funktioner**: `node --test tools/test-producentbilleder.mjs` (importerer `../supabase/functions/_shared/producentbilleder.ts` direkte).
- **Server**: Deno findes ikke lokalt. En midlertidig funktion `pb-proeve` deployes med `npx --yes supabase@latest functions deploy pb-proeve --project-ref gjycsqshkvkcupdnvgvf` og kaldes med `curl`; slettes med `npx --yes supabase@latest functions delete pb-proeve --project-ref gjycsqshkvkcupdnvgvf`.
- **App**: `sh tools/proeve.sh` → preview »app« → `http://localhost:8765/proeve.html`; tests er udtryk i `javascript_tool`. `window.__proeveData` er mock'ens data; afregistrér service workeren, hvis CSS ikke slår igennem. Telefon: preset `mobile`; computer 1280×800; lyst og mørkt med `colorScheme`.

## Review Focus

1. **En side med navy og oliven af samme model** (Teeshoppen nr. 54). Forventet: kun den sorte; en anden farve er ikke »samme vare«. Testet i Task 2 (øjnene på det valgte).
2. **Modellen svarer med et `nr`, der ikke findes, eller med samme pose to gange.** Forventet: ukendte numre ignoreres, første af hver pose vinder. Testet i Task 1.
3. **Et hotlinket producentbillede, der ikke kan hentes** (butikken fjerner det, hotlink-spærre). Forventet: billedet skjules, og er alle væk, skjules blokken — ingen tom ramme. Testet i Task 4.
4. **»Tag dit eget som dette« trykket to gange, eller billedet uploadet men `nytFoto` fejler.** Forventet: knappen låst under upload; billedet står i udkastet råt og kan stadig bruges; besked »Billedet er gemt, men ikke optimeret«. Testet i Task 5.
5. **En vare, der går fra klar til ude, mens varens side er åben.** Forventet: knappen forsvinder ved næste tegning; `nytFoto` på en vare, der er ude, afvises af serveren (`ikke_klar`). Testet i Task 3 og 5.

---

### Task 1: Kandidater og udvælgelse (rene funktioner)

**Files:**
- Create: `supabase/functions/_shared/producentbilleder.ts`
- Create: `tools/test-producentbilleder.mjs`

**Interfaces:**
- Produces:
  - `export type Pose = "forfra-hel" | "trekvart" | "bagfra" | "naer"`
  - `export const POSER: Pose[] = ["forfra-hel", "trekvart", "bagfra", "naer"]`
  - `export type ProducentBillede = { url: string; pose: Pose }`
  - `export function billedKandidater(html: string, sideUrl: string, foerst: string[]): string[]` — højst 12 absolutte `https:`-adresser
  - `export type BilledSvar = { nr: number; sammeVare: boolean; paaPerson: boolean; pose: string }`
  - `export function udvaelg(kandidater: string[], svar: BilledSvar[]): ProducentBillede[]`

- [ ] **Step 1: Skriv de fejlende tests** i `tools/test-producentbilleder.mjs` (`node:test`, `node:assert/strict`):
  - `kandidater afkoder escapes og dropper ikoner`: HTML med `"https:\/\/cdn.x.com\/a\/jakke-sort-1.jpg?v=2"`, `//cdn.x.com/a/logo-dark.png`, `/favicon-64.png`, `https://cdn.x.com/a/ikon.svg`, `src="//cdn.x.com/a/jakke-sort-1.jpg?v=3"` → `["https://cdn.x.com/a/jakke-sort-1.jpg?v=2"]` (dublet på stien uden forespørgsel; første forekomst beholdes).
  - `kandidater: foerst, så ord fra stien, så resten`: side `https://shop.dk/products/hooded-puffer-sort`, `foerst = ["https://cdn.x.com/og.jpg"]`, HTML med i rækkefølge `//cdn.x.com/anbefaling.jpg`, `//cdn.x.com/hooded-let-puffer-forfra.png` → `["https://cdn.x.com/og.jpg", "https://cdn.x.com/hooded-let-puffer-forfra.png", "https://cdn.x.com/anbefaling.jpg"]`. Ord = stiens ord på mindst 4 tegn (`hooded`, `puffer`, `products` tæller ikke — se Step 3).
  - `kandidater højst 12`: HTML med 20 forskellige `.jpg` → længde 12.
  - `kandidater: &amp; og /`: `https://cdn.x.com/b.jpg?w=1&amp;h=2` → `"https://cdn.x.com/b.jpg?w=1&h=2"`.
  - `udvaelg sorterer efter pose og tager én pr. pose`: 5 kandidater, svar `[{nr:1,sammeVare:true,paaPerson:true,pose:"bagfra"},{nr:2,…,pose:"forfra-hel"},{nr:3,…,pose:"forfra-hel"},{nr:4,…,pose:"naer"},{nr:5,…,pose:"trekvart"}]` → poserne `["forfra-hel","trekvart","bagfra","naer"]` og forfra-hel er kandidat 2 (`kandidater[1]`). `nr` er 1-baseret.
  - `udvaelg dropper andre varer, pakkeshot og ukendte nr`: `{nr:1,sammeVare:false,…}`, `{nr:2,paaPerson:false,…}`, `{nr:3,…,pose:"pakkeshot"}`, `{nr:99,…}` → `[]`.

- [ ] **Step 2: Kør — skal fejle**

Run: `node --test tools/test-producentbilleder.mjs`
Expected: FAIL (modulet findes ikke)

- [ ] **Step 3: Implementér `billedKandidater` og `udvaelg`** i `supabase/functions/_shared/producentbilleder.ts` — ingen imports (Deno-fri).
  - Afkod `\/` → `/`, `/` → `/` (ikke versal-følsom), `&amp;` → `&`. Find `(https?:)?//[A-Za-z0-9.-]+/[^"'\s)<>,]+?\.(jpe?g|png|webp)(\?[^"'\s)<>,]*)?`; giv `https:` foran, hvor det mangler.
  - Drop, hvis stien (små bogstaver) indeholder `logo`, `favicon`, `icon`, `apple-touch`, `sprite` eller `placeholder`.
  - Dubletter på `origin + pathname`.
  - Stiens ord: `new URL(sideUrl).pathname` delt på ikke-bogstaver/tal, ord på 4+ tegn, minus `products`, `product`, `html`. En kandidat »deler ord«, hvis dens filnavn (sidste led, små bogstaver) indeholder et af dem.
  - `foerst` (afkodet og normaliseret som resten) står først i den givne rækkefølge, så kandidater, der deler ord, så resten; højst 12.

- [ ] **Step 4: Kør — skal bestå**

Run: `node --test tools/test-producentbilleder.mjs`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/producentbilleder.ts tools/test-producentbilleder.mjs
git commit -m "Producentbilleder: kandidater fra produktsidens HTML og udvælgelse efter pose"
```

---

### Task 2: Opslaget finder billederne og pasformen

**Files:**
- Modify: `supabase/functions/_shared/beskrivelse.ts` (`Fakta`, `faktaTekst`, `OPSLAG_TOOL` ~l.140, `Opslag` ~l.184, `slaaOp` ~l.190, `laesSiden` ~l.310)
- Modify: `supabase/functions/analyze-draft/index.ts:~895` (hvor `fakta.produktside` sættes)
- Modify: `supabase/functions/vinted-fill-script/index.ts:~1927` (samme i markedsrunden)
- Create (midlertidig): `supabase/functions/pb-proeve/index.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `billedKandidater`, `udvaelg`, `ProducentBillede`, `BilledSvar` fra Task 1.
- Produces:
  - `Fakta.producentBilleder?: ProducentBillede[]`, `Fakta.pasform?: string`
  - `Opslag.producentBilleder?: ProducentBillede[]`, `Opslag.pasform?: string`
  - `laesSiden(url): Promise<{ pris?: number; maerke?: string; kandidater: string[] }>`
  - `export async function vaelgBilleder(apiKey: string, kandidater: string[], egne: string[], draftId?: unknown): Promise<ProducentBillede[]>`

- [ ] **Step 1: `laesSiden` giver kandidaterne.** Saml JSON-LD `Product.image` (string, array af strings, eller objekter med `url`) og `og:image` (`<meta property="og:image" content="…">`) i den rækkefølge som `foerst`, og returnér `kandidater: billedKandidater(html, url, foerst)`. `kandidater: []`, når siden ikke svarer.

- [ ] **Step 2: `vaelgBilleder`.** Tomt ind → `[]` uden kald. Ét kald til `claude-haiku-5-5`, `max_tokens: 1500`, `tool_choice: {type:"tool", name:"angiv_billeder"}`. Indhold: op til 4 af `egne` som `image`/`url` med teksten »Billederne ovenfor er varen, der sælges.«, så hver kandidat som `image`/`url` med teksten `Kandidat <nr>:` før, og til sidst: »For hver kandidat: er det samme model OG samme farve som varen (sammeVare), bæres den af en person (paaPerson), og hvilken pose: forfra-hel (hele figuren forfra), trekvart, bagfra, naer (stof eller detalje tæt på), pakkeshot (uden person) eller andet. En anden farve af samme model er ikke samme vare.« Værktøjets skema: `billeder: [{nr: integer, sammeVare: boolean, paaPerson: boolean, pose: enum[…6]}]` (required alle fire). `noterForbrug(data, "opslag:billeder", draftId)`. Svar: `udvaelg(kandidater, input.billeder)` — tål at `billeder` kommer som tekst (parse den; CLAUDE.md »Modellerne«). Svarer API'et 400 med en kandidats adresse i fejlteksten, så prøv én gang uden de kandidater, hvis adresse står i teksten; enhver anden fejl → `[]`. Hele funktionen i `try` → `[]`.

- [ ] **Step 3: `OPSLAG_TOOL` får `pasform`** (`type: ["string","null"]`, beskrivelse fra spec §1), og den kommer i `required`. `slaaOp` returnerer `pasform: tekst(i.pasform, 200)` og, når `url` findes, `producentBilleder: await vaelgBilleder(apiKey, siden.kandidater, billeder, draftId)` (kun med noget i, ellers `undefined`). Samme `billeder` (op til 8), opslaget allerede har.

- [ ] **Step 4: Skrivningen i begge kaldere.** I `analyze-draft/index.ts` og `vinted-fill-script/index.ts`, ved siden af `fakta.produktside = fundet.produktside`: sæt `fakta.producentBilleder` og `fakta.pasform`, når de findes (overskriv ikke et gammelt fund med intet).

- [ ] **Step 5: `faktaTekst` får linjen** `k.pasform && \`Butikken skriver om pasformen: ${k.pasform}. Brug det, hvis det hjælper køberen med størrelsen — skriv ikke, at det kommer fra butikken eller fra et billede.\``.

- [ ] **Step 6: Syntaks**

Run: `for f in supabase/functions/_shared/beskrivelse.ts supabase/functions/_shared/producentbilleder.ts supabase/functions/analyze-draft/index.ts supabase/functions/vinted-fill-script/index.ts; do npx --yes esbuild@0.24.0 "$f" --loader:.ts=ts --log-level=error >/dev/null || echo "FEJL $f"; done`
Expected: intet output

- [ ] **Step 7: Prøv udvælgelsen på de fire rigtige sider.** `pb-proeve/index.ts` (key-tjek med `SHORTCUT_KEY`) læser `drafts` for `nr` i query'en, kalder `slaaOp` med udkastets mærke, varetype, størrelse, farve, `fakta.maerker` og `photos` (op til 8) og svarer med `{nr, produktside, pasform, producentBilleder, kandidater}` (eksportér `laesSiden` midlertidigt eller lad funktionen kalde den selv). Deploy, kald for nr. 54, 63, 65, 66, og hent hvert valgt billede (`curl -o`) og se det med `Read`.
Expected: mindst 3 af 4 varer har mindst ét billede; hvert valgt billede er varen i varens farve og bæres af en person; nr. 54 har ingen navy eller oliven; poserne passer til billedet. Notér `forbrug` for `opslag:billeder` (`select sum(usd) from forbrug where trin='opslag:billeder' and tid > now() - interval '1 hour'`) — forventet under 0,06 $ pr. vare. Rammer udvælgelsen forkert, ret prompten og kør igen; stol ikke på ét gennemløb (CLAUDE.md »Billedmodellens svar svinger«) — kør hver vare to gange.

- [ ] **Step 8: Slet `pb-proeve`** (lokalt og i Supabase).

- [ ] **Step 9: CLAUDE.md.** »Delene«: `_shared/producentbilleder.ts` (`billedKandidater`, `udvaelg`) og `vaelgBilleder` i `_shared/beskrivelse.ts`. »Databasen«, linjen for `sql/006-fakta.sql`: tilføj `producentBilleder` (`[{url, pose}]`, producentens billeder af varen på en person — kun links, kun til appen) og `pasform`. »Annoncetekst«: pasformen fra butikken. »Målt, ikke gættet«: et nyt punkt under »Modellerne« eller et nyt emne »Produktsidernes billeder« med spec'ens tabel, tallene fra Step 7 og kostprisen.

- [ ] **Step 10: Commit**

```bash
git add supabase/functions/_shared/beskrivelse.ts supabase/functions/analyze-draft/index.ts supabase/functions/vinted-fill-script/index.ts CLAUDE.md
git commit -m "Opslaget finder producentens billeder på en person og butikkens ord om pasformen"
```

---

### Task 3: `paa-kroppen` isoleres ikke, og `mode:'nytFoto'`

**Files:**
- Modify: `supabase/functions/analyze-draft/optimize.ts:77-84` (`PADDING`)
- Modify: `supabase/functions/analyze-draft/index.ts` (der hvor `g` bliver til `optimizePhoto`-kaldet, ~l.640-660, og de to andre kald ~l.693 og ~l.729)
- Modify: `supabase/functions/vinted-fill-script/index.ts` (ny gren ved `body.mode === "omskriv"` ~l.1427)
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces: `POST FILL_API {mode:'nytFoto', id: uuid, photo: n}` → `{ok:true}` | `{error:'bad_id'|'ikke_fundet'|'ikke_klar'|'findes_ikke'|'optimeret'|'fejl', …}`.

- [ ] **Step 1: `PADDING.paakroppen = 0.035`.** I `analyze-draft/index.ts`: er `l.photo.kind === "paa-kroppen"` og modellens `subject === "helvare"`, så send `subject: "paakroppen"` videre (alle tre `optimizePhoto`-kald får samme guidance). Så bliver `vilIsolere` falsk, og beskæringen får `helvare`-luft. Kommentar: en person på hvidt ligner en udklipning.

- [ ] **Step 2: `mode:'nytFoto'`.** Tjek `id` som i `omskriv` (`bad_id`). Hent `photos, status, posted_to, taget_ned` og `listings(id)`. Afvis `ikke_klar`, hvis `posted_to` har en sat plads, der er en `listings`-række, eller status er `kasseret`/`afsendt` (samme regel som `fase()` i `app.js` for »klar« — læs den og spejl den, med en kommentar om at de skal rettes sammen). `photo` skal være et heltal med `photos[photo]` sat (`findes_ikke`) og ikke `optimized` (`optimeret`). Så `fetch(\`${SUPABASE_URL}/functions/v1/analyze-draft\`, {method:'POST', headers:{'content-type':'application/json','x-webhook-secret': WEBHOOK_SECRET}, body: JSON.stringify({id, photo})})` og `{ok: res.ok}` (`fejl` med status ved `!res.ok`).

- [ ] **Step 3: Syntaks** — samme kommando som Task 2 Step 6 for `optimize.ts`, `analyze-draft/index.ts`, `vinted-fill-script/index.ts`. Expected: intet output.

- [ ] **Step 4: CLAUDE.md.** »Delene«: `mode:'nytFoto'` i `vinted-fill-script` (kalder delkaldet `analyze-draft {id, photo}`). »Målt, ikke gættet → Beskæring og isolering«: `paa-kroppen` isoleres aldrig, med grunden.

- [ ] **Step 5: Commit** (`udgiv.sh` kræver et rent træ)

```bash
git add supabase/functions/analyze-draft/optimize.ts supabase/functions/analyze-draft/index.ts supabase/functions/vinted-fill-script/index.ts CLAUDE.md
git commit -m "Et billede på kroppen isoleres ikke; mode nytFoto optimerer ét nyt billede i et klar-udkast"
```

- [ ] **Step 6: Udgiv** — `./tools/udgiv.sh`. Expected: `udgivelse-NNNN` sat, Pages-tjekket grønt.

- [ ] **Step 7: Prøv mod den udgivne server.** Opret en midlertidig række i `drafts` (`status 'kladde'`, `photos` = de to første fra nr. 66 med `optimized` fjernet fra det andet og `kind:'paa-kroppen'`, `tone`/`ratio` kopieret fra nr. 66). Kald `nytFoto` med `photo:1`.
Expected: `{ok:true}`; efter ≤30 s er `photos[1].optimized = true`, og billedet (hentet og set med `Read`) har seriens format og INGEN hvid ramme om. Kald igen → `optimeret`. Sæt `posted_to = {"vinted": "<nu>"}` → `ikke_klar`. `photo: 5` → `findes_ikke`. Slet rækken og dens nye fil i Storage bagefter.

---

### Task 4: »Sådan ser den ud på« og trinnet »På kroppen«

**Files:**
- Modify: `app.js` (`STEPS` ~l.1768; `renderDetail` ~l.915)
- Modify: `style.css` (sidst, før »Computerskaermen«)
- Modify: `index.html` (en tom overlægning `#pb-stor`)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `d.fakta.producentBilleder: [{url, pose}]`, `d.fakta.produktside`.
- Produces: `POSE_NAVN = {'forfra-hel':'Forfra, hele figuren', trekvart:'Trekvart', bagfra:'Bagfra', naer:'Tæt på'}`; knappen `[data-pb-tag="<i>"]` (Task 5 lytter på den); `function visProducentStor(b, vaert)`.

- [ ] **Step 1: Tests (skal fejle)** — i prøvesiden, efter at et udkast `D` i fase klar har fået `fakta.producentBilleder` med 4 billeder (brug fire af udkastets egne `photos`-url'er som stand-ins) og `fakta.produktside = 'https://www.teeshoppen.dk/p'`, og varens side er åbnet:
  - `document.querySelectorAll('.pb-stribe img').length === 4`
  - `document.querySelector('.pb-pille').textContent === 'Fra producenten · teeshoppen.dk'`
  - `[...document.querySelectorAll('.pb-pose')].map(e=>e.textContent)` er `["Forfra, hele figuren","Trekvart","Bagfra","Tæt på"]`
  - `!!document.querySelector('[data-pb-tag]')` og linjen »Kun til dig — producentens billeder kommer ikke med i annoncen.« findes
  - `getComputedStyle(document.querySelector('.pb-stribe img')).objectFit === 'contain'`
  - `STEPS`-trinnet: åbn optagelsen, spring Forfra og Bagfra over → `$('cap-title').textContent === 'På kroppen'`.

- [ ] **Step 2: Kør dem** — Expected: FAIL.

- [ ] **Step 3: `STEPS`** — nyt trin efter `bagfra`: `{ kind:'paa-kroppen', title:'På kroppen', guide:G_HEL, hint:'Varen på, hele figuren lige forfra — eller fra halsen og ned, ansigtet er ikke nødvendigt. Rolig, ensfarvet baggrund, stå lidt til siden for midten.' }`. (Alle trin kan allerede springes over med `cap-skip`.)

- [ ] **Step 4: Blokken i `renderDetail`** — under billederne i `.d-medier`, kun når `producentBilleder` har noget: overskrift »Sådan ser den ud på«, stribe `.pb-stribe` med `.pb-kort` (img med `onerror` → kortet skjules; er alle skjult, skjules `.pb-blok`), pillen `.pb-pille`, posens navn `.pb-pose`; mens `fase(d) === 'klar'`: `<button class="btn btn-secondary" data-pb-tag="0">Tag dit eget som dette</button>` (forlægget er det første billede; tryk på et andet kort gør det til forlægget — `data-pb-tag` følger) og den dæmpede linje. Vært: `new URL(produktside).hostname` uden `www.`, i `try`.

- [ ] **Step 5: Stort billede** — tryk på et kort → `visProducentStor(b, vaert)`: `#pb-stor` (fast overlægning, papirfarve, `contain`, pillen øverst til venstre, luk med tryk eller Esc).

- [ ] **Step 6: CSS** — `.pb-blok`, `.pb-stribe` (vandret rul, `gap`), `.pb-kort` (bredde 120 px, billede 120×160 `contain` på `--paper`), `.pb-pille` (lille, `position:absolute`, `--raised`-bund, `--ink-soft`), `.pb-pose`, `.pb-note`, `#pb-stor`. Kun eksisterende tokens.

- [ ] **Step 7: Kør Step 1 igen** + skjul-reglen: sæt alle fire url'er til `https://x.invalid/a.jpg`, tegn igen → `document.querySelector('.pb-blok')` er skjult. En vare i fase ude med billeder → blokken vises, `[data-pb-tag]` findes ikke. Expected: alle PASS. Skærmbillede ved 375 px og 1280 px, lyst og mørkt (ét hver, `scale` 0.5).

- [ ] **Step 8: `./build.sh` og runner-tjek** — Expected: grøn.

- [ ] **Step 9: CLAUDE.md** — nyt afsnit under »Dine beslutninger«: »Producentens billeder« (spec §»Hvorfor«: kun i appen, aldrig i en annonce, Vinteds regel citeret, ophavsretten; poserækkefølgen og researchen i tre linjer; trinnet »På kroppen«). »Delene«: blokken og `visProducentStor` i `app.js`.

- [ ] **Step 10: Commit**

```bash
git add app.js style.css index.html CLAUDE.md
git commit -m "Varens side viser producentens billeder som forlæg; optagelsen får trinnet På kroppen"
```

---

### Task 5: »Tag dit eget som dette«

**Files:**
- Modify: `app.js` (ny skærm; genbrug `shrink` og upload-mønstret fra `handleShot` ~l.1832)
- Modify: `index.html` (skærmen `#pb-tag`)
- Modify: `style.css`
- Modify: `tools/proeve-mock.js` (svar på `mode === 'nytFoto'`)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `[data-pb-tag]`, `POSE_NAVN` fra Task 4; `mode:'nytFoto'` fra Task 3.
- Produces: `function aabnForlaeg(d, b)`; `POSE_TEKST` (tekster herunder).

- [ ] **Step 1: Tests (skal fejle)** — i prøvesiden på udkastet `D` fra Task 4:
  - tryk `[data-pb-tag]` → `#pb-tag` vises; `#pb-tag img.pb-forlaeg` har producentbilledets `src`; overskriften er posens navn.
  - simulér et valgt billede (sæt en `File` på skærmens `input[type=file]` via `DataTransfer` og send `change`) → mock'en har fået en PATCH, hvor `photos` er én længere, sidste `kind === 'paa-kroppen'` (for `naer`: `'detalje'`), og et POST med `mode:'nytFoto'` og `photo === photos.length-1`; beskeden »Billedet er lagt til« vises.
  - med `window.__proeveFejl` på `nytFoto` → beskeden »Billedet er gemt, men ikke optimeret«, og billedet står stadig i `photos`.
  - to hurtige `change` → kun én upload (knappen/inputtet låst under upload).

- [ ] **Step 2: Kør dem** — Expected: FAIL.

- [ ] **Step 3: Mock'en** svarer `{ok:true}` på `mode === 'nytFoto'` (og respekterer `__proeveFejl` som de andre).

- [ ] **Step 4: Skærmen `#pb-tag`** — som optageskærmen: luk-knap, overskrift = `POSE_NAVN[b.pose]`, `img.pb-forlaeg` (højst 40 % af skærmhøjden, `contain`, med pillen), tekst = `POSE_TEKST[b.pose]`, og én `btn-primary` »Tag billede« med `<input type=file accept=image/* capture=environment>`. `POSE_TEKST`:
  - `forfra-hel`: STEPS-teksten for »På kroppen«
  - `trekvart`: »Varen på, drejet en kvart omgang mod kameraet — hele figuren eller fra halsen og ned. Rolig, ensfarvet baggrund.«
  - `bagfra`: »Varen på, set bagfra — hele figuren eller fra halsen og ned. Rolig, ensfarvet baggrund.«
  - `naer`: »Stoffet eller detaljen tæt på, som på billedet — med luft omkring, så intet skæres af kanten.«

- [ ] **Step 5: Upload og kald** — `shrink(file, 1800, 0.9)` → Storage `photos` som i `handleShot` → `photos = d.photos.concat([{path, url, kind}])` → `sb.from('drafts').update({photos})` → `fetch(FILL_API, {method:'POST', body: {mode:'nytFoto', id: d.id, photo: photos.length-1}})`. Lås under hele forløbet. Lykkes alt: luk skærmen, `toast('Billedet er lagt til')`, tegn varens side (det rå billede står straks; realtid skifter det ud). Fejler `nytFoto`: luk, `toast('Billedet er gemt, men ikke optimeret')`. Fejler uploaden: »Kunne ikke gemme billedet. Prøv igen.« på skærmen. Svar `ikke_klar`: `toast('Varen er sendt afsted — billeder lægges kun til, mens den er klar')`.

- [ ] **Step 6: Kør Step 1 igen** — Expected: PASS. Ét skærmbillede af `#pb-tag` ved 375 px.

- [ ] **Step 7: `./build.sh` og runner-tjek** — Expected: grøn.

- [ ] **Step 8: CLAUDE.md** — under »Producentens billeder«: »Tag dit eget som dette« (kun klar, lægges sidst, `nytFoto`, teksten skrives ikke om). »Delene«: `aabnForlaeg`, `#pb-tag`.

- [ ] **Step 9: Commit**

```bash
git add app.js style.css index.html tools/proeve-mock.js CLAUDE.md
git commit -m "Tag dit eget som dette: forlægsskærm, upload og optimering af ét nyt billede"
```

---

### Task 6: Udgivelse og status

**Files:**
- Modify: `STATUS.md`

- [ ] **Step 1: Udgiv** — `./tools/udgiv.sh`. Expected: ny `udgivelse-NNNN`, Pages udleverer stemplerne.
- [ ] **Step 2: Live-tjek** — `python3 tools/tjek-live.py`. Expected: telefonen kører det, git siger.
- [ ] **Step 3: En rigtig analyse** — sæt et nyt eller eksisterende klar-udkast med mærke og produktside til `afventer` (CLAUDE.md »Afprøvning«), vent på `ny`, og tjek `fakta.producentBilleder` og `fakta.pasform` i databasen og at beskrivelsen ikke nævner butikken eller billeder. `drafts.photos` har ingen adresse uden for Supabase Storage: `select count(*) from drafts, jsonb_array_elements(photos) p where p->>'url' not like '%supabase.co/storage/%'` → 0.
- [ ] **Step 4: STATUS.md** — nyt punkt øverst: hvad der er afprøvet (Task 1-5), og hvad der kun kan ses på telefonen (kameraet fra forlægsskærmen, »På kroppen« i en rigtig optagelse).
- [ ] **Step 5: Commit og push**

```bash
git add STATUS.md
git commit -m "Status: producentens billeder som forlæg"
git push
```
