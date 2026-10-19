# Producentens billeder som forlæg, poser og pasform

19. oktober 2026. Godkendt i samtalen (»Godkendt. Skriv specen med alle fire
dele, inkl. »Tag dit eget som dette««).

## Hvorfor

Ønsket var: find producentens billeder af varen i brug, behandl dem, så de
matcher annoncens stil, sæt en tekst på, og læg dem i annoncen. Research
19. oktober ændrede det:

- **Vinted forbyder billeder, sælgeren ikke selv har taget.** »Sellers may
  not use photos they didn't take themselves, or any image that doesn't
  depict the actual item being sold« ([Vinted Help 1120](https://www.vinted.com/help/1120)).
  Gentagelse efter en advarsel kan give permanent udelukkelse. En tekst om,
  at billedet er fra producenten, dokumenterer bruddet i stedet for at
  undskylde det.
- **Ophavsret**: selv et almindeligt produktfoto er beskyttet i dansk ret,
  og videresalg af varen giver ingen ret til butikkens billede. Det gælder
  også DBA og Reshopper.

Derfor, bestemt af dig: **producentens billeder bruges kun i appen, som
forlæg. Intet i annoncerne.** Det, der skal gøre annoncerne bedre, er dine
egne billeder i de poser, der sælger, og pasformen i teksten.

### Hvilke poser (research)

Ingen uafhængige målinger på brugtsalg; det bedste, der findes:

- **På kroppen slår fladt for tøj** — 20-30 % i leverandørtal
  ([nightjar](https://nightjar.so/blog/flat-lay-vs-hero-shot-conversions),
  [photta](https://www.photta.app/resources/flat-lay-vs-on-model)) — fordi
  pasform og fald kan ses.
- **Hele figuren forfra på ensfarvet baggrund** fanger blikket hurtigst
  ([Emerald 2021](https://emerald.com/insight/content/doi/10.1108/APJML-05-2020-0343/full/html)).
- **Uden ansigt fik mere opmærksomhed på varen**, selv om deltagerne sagde,
  de foretrak ansigtet ([atlantis-press](https://www.atlantis-press.com/article/25842459.pdf)).
- Den gængse serie: hele forfra, trekvart, bagfra, nær på stoffet. Forfra og
  bagfra er dét, pasform bedømmes på ([UDel](https://udspace.udel.edu/items/5f0adff0-01c0-4c7f-bcc1-45301e18a6b0)).

Poserækkefølgen, der bruges overalt herunder: **forfra-hel → trekvart →
bagfra → naer**. `pakkeshot` (varen uden person) og billeder af andet
end varen bruges ikke.

## Det, der ikke ændres

- Annoncerne: `drafts.photos` får aldrig et producentbillede. Vinted, DBA og
  Reshopper lægger kun `drafts.photos` op.
- Forfra og Bagfra i optagelsen — coverbilledet viser stadig hele varen.
- Opslagets søgning, model (Haiku 5.5), grænser og prisen fra JSON-LD.
- Billedernes farveregler og fremkaldelsen (`tone`, `ratio`).

## Hvad der er målt

Fire produktsider, opslaget har fundet (nr. 54, 63, 65, 66), hentet med
telefonens brugeragent 19. oktober:

| Side | JSON-LD `image` | Billeder i HTML'en |
|---|---|---|
| teeshoppen.dk (nr. 54) | 1 | »…-sort-set-forfra/-fra-siden/-bagfra.png« + navy og oliven af samme jakke + anbefalinger |
| magasin.dk (nr. 63) | 6 | de 6 |
| ganni.com (nr. 65) | 0 | `/packshots/` og `/model/` for flere varer blandet |
| madsnorgaard.com (nr. 66) | 0 | kun `og:image` + 48 andre |

Ingen fælles navngivning, og siden blander varen med andre varer og farver.
Shopifys `/products/<handle>.json` svarer 404 (Teeshoppen er headless). Kun
en model, der ser billederne, kan vælge rigtigt.

## 1. Find billederne (server)

I `_shared/beskrivelse.ts`, efter at opslaget har fundet en produktside.

- `laesSiden(url)` læser allerede HTML'en. Den returnerer nu også
  **kandidaterne**: alle billedadresser i HTML'en (efter `\/` → `/`,
  `/` → `/`, `&amp;` → `&`), uden forespørgselsdel som nøgle til
  dubletter, og uden `logo`, `favicon`, `icon`, `apple-touch`, `sprite`,
  `placeholder` og `.svg`/`.gif`. Rækkefølge: JSON-LD `image` først, så
  `og:image`, så adresser hvis filnavn deler mindst ét ord på 4+ tegn med
  sidens sti, så resten i sidens rækkefølge. **Højst 12.**
- **`vaelgBilleder(apiKey, kandidater, egne, draftId)`** — ét Haiku 5.5-kald
  med kandidaterne som `image`/`url` (nummererede) og op til 4 af varens egne
  billeder. Værktøjet `angiv_billeder` giver pr. kandidat: `nr`,
  `sammeVare` (samme model OG samme farve som de egne billeder),
  `paaPerson` (varen bæres af en person), `pose`
  (`forfra-hel`/`trekvart`/`bagfra`/`naer`/`pakkeshot`/`andet`).
  Noteres som `opslag:billeder` i `forbrug`.
- Et svar tæller kun for et `nr`, der findes i listen — **en adresse, der
  ikke stod i HTML'en, kan ikke komme ind**. Et kandidatbillede, Anthropic
  ikke kan hente, gør kaldet til en fejl: så prøves én gang uden det
  (fejlbeskeden nævner adressen), ellers ingen billeder.
- Beholdt: `sammeVare && paaPerson && pose ∈ {forfra-hel, trekvart,
  bagfra, naer}`, sorteret efter poserækkefølgen, højst én pr. pose, **højst
  4**. Gemmes som `Opslag.producentBilleder: [{url, pose}]` (url med
  `https:` foran, forespørgselsdelen bevaret, da CDN'er bruger den til
  størrelse) og lander i `drafts.fakta.producentBilleder` ad samme vej som
  `produktside`.
- **Pasform**: `OPSLAG_TOOL` får `pasform` (string|null): »det butikken skriver
  om pasform og modellens højde/størrelse, fx 'normal pasform; modellen er
  178 cm og bærer M'. null hvis siden ikke siger det.« Gemmes i
  `fakta.pasform` (højst 200 tegn).
- Køres kun, når der er en produktside. Fejl i begge trin → bare uden;
  opslaget og analysen må aldrig vælte på det. Skønnet pris 0,03-0,06 $
  pr. vare.
- Begge steder, `slaaOp` kaldes (`analyze-draft`, `vinted-fill-script`
  markedsrunden), skriver `producentBilleder` og `pasform` med.

## 2. Vis dem i appen

På varens side (`renderDetail` i `app.js`), en blok **»Sådan ser den ud
på«** under billederne, når `fakta.producentBilleder` har noget:

- En vandret stribe med de op til 4 billeder (`contain` på papirfarven —
  aldrig `cover`), hvert med en lille pille i øverste venstre hjørne:
  »Fra producenten · teeshoppen.dk« (værten fra `fakta.produktside`, uden
  `www.`). Pillen er HTML/CSS oven på billedet, ikke brændt ind.
- Under hvert billede posens navn: »Forfra, hele figuren«, »Trekvart«,
  »Bagfra«, »Tæt på«.
- Tryk = billedet stort (samme fremviser som varens egne billeder, med
  pillen).
- Under striben, mens varen er **klar** (`fase()`): knappen **»Tag dit eget
  som dette«** (sekundær — ingen accent-knap) og én dæmpet linje: »Kun til
  dig — producentens billeder kommer ikke med i annoncen.«
- Hotlinkede billeder, der ikke kan hentes (`onerror`), skjules; er alle
  væk, skjules blokken.
- Nye klasser får præfikset `.pb-` (korte navne er taget).

## 3. Poserne i optagelsen

`STEPS` i `app.js`:

- **Nyt trin `paa-kroppen`** — »På kroppen« — efter Bagfra, valgfrit som
  Slid (kan springes over). Guide: `G_HEL`. Tekst: »Varen på, hele figuren
  lige forfra — eller fra halsen og ned, ansigtet er ikke nødvendigt. Rolig,
  ensfarvet baggrund, stå lidt til siden for midten.«
- Billeder fra Fotos fordeles stadig på trinene i rækkefølge; et ekstra trin
  flytter fordelingen for den, der vælger 4+ billeder. Det er i orden:
  trinnet er kun en hensigt (CLAUDE.md, »Mærkerne er facit«).
- **Billedbehandlingen**: et billede, hvis `kind` er `paa-kroppen`,
  **isoleres aldrig** (en person på hvidt ligner en udklipning), men
  beskæres til seriens format med `helvare`-luft. Fremkaldes med seriens
  `tone` som alle andre. Rotationen følger den eksisterende regel
  (tyngdekraften, da der ikke er tekst).

## 4. »Tag dit eget som dette«

- Knappen åbner en skærm som optageskærmen, med **producentens billede
  øverst** som forlæg i stedet for rammeguiden, posens navn som overskrift
  og trinnets tekst for den pose (forfra-hel: teksten fra »På kroppen«;
  trekvart: »… drejet en kvart omgang«; bagfra: »… set bagfra«; naer:
  »Stoffet eller detaljen tæt på, som på billedet«). Ét tryk på kameraet
  (`<input type=file capture>` — samme som i dag; iOS' kamera kan ikke få
  et overlay).
- Billedet lægges i Storage som i optagelsen. **Ændret under bygningen
  (review af Task 5):** appen skriver ikke selv `photos` — en gammel kopi
  kunne tabe en optimering eller et billede. Appen kalder `nytFoto` med
  `{id, path, kind}` (`paa-kroppen`, for `naer`: `detalje`); serveren
  tjekker, at filen findes, og lægger den sidst i én sætning
  (`append_draft_photo`, sql/019) — kun når varen er færdiganalyseret
  (status `ny`) og ikke sendt — og optimerer så den plads. Afsnittet
  herunder om `{id, photo: n}` er erstattet af det.
- Så kalder appen `FILL_API` med **`mode:'nytFoto'`, `{id, photo: n}`**.
  `vinted-fill-script` kalder `analyze-draft` med `{id, photo: n}` og
  `x-webhook-secret` — det eksisterende delkald, som optimerer det ene foto
  med seriens tone og format og skriver det tilbage med `set_draft_photo`.
  Appen kan ikke selv kalde analyze-draft (webhook-hemmeligheden).
  `nytFoto` tjekker, at `photos[n]` findes og ikke er optimeret.
- Teksten skrives ikke om, og analysen kører ikke forfra. Billedet ses i
  striben med det samme (råt) og skiftes ud, når det er optimeret
  (realtid/genhentning som i dag).
- **Kun mens varen er klar** — en vare, der er ude, har `fotos_sendt` og
  en parring med Vinteds billed-id'er, og et ekstra billede dér er ikke
  designet. Knappen vises ikke for en vare, der er ude.

## 5. Pasformen i teksten

- `faktaTekst` får linjen: »Butikken skriver om pasformen: <pasform>. Brug
  det, hvis det hjælper køberen med størrelsen — skriv ikke, at det kommer
  fra butikken eller fra et billede.« Så får analysen, Vinteds
  markedsrunde, DBA og Reshopper det.
- Står allerede i `fakta`, så »Skriv beskrivelsen forfra« ser det også.

## CLAUDE.md

I samme omgang som koden:

- **Dine beslutninger**: nyt afsnit »Producentens billeder« — kun i appen,
  aldrig i en annonce (med Vinteds regel), poserækkefølgen, »På kroppen«,
  »Tag dit eget som dette« kun for klar.
- **Delene**: `vaelgBilleder`/kandidaterne i `_shared/beskrivelse.ts`;
  blokken og forlægsskærmen i `app.js`; `mode:'nytFoto'`.
- **Databasen**: `drafts.fakta` får `producentBilleder` og `pasform` på
  linjen for `sql/006-fakta.sql` (ingen migrering — `fakta` er jsonb).
- **Annoncetekst**: pasformen fra butikken.
- **Målt, ikke gættet**: tabellen ovenfor (JSON-LD giver 0-6 billeder,
  HTML'en blander varer, Shopify-JSON 404).

## Afprøvning

1. **Udvælgelsen på rigtige sider**: kør kandidater + `vaelgBilleder` fra en
   midlertidig funktion på nr. 54, 63, 65 og 66 med deres egne billeder, og
   se hvert valgt billede efter: samme farve (navy og oliven hos Teeshoppen
   må ikke komme med), en person bærer varen, rigtig pose. Mindst 3 af 4
   varer med mindst ét billede på person; ingen forkert farve eller forkert
   vare. Notér kostprisen fra `forbrug`.
2. `faktaTekst` med `pasform` — en ny analyse af en vare, hvis side siger
   det, og teksten læst igennem.
3. **Prøvesiden** (`tools/proeve.sh`): blokken med 0, 1 og 4 billeder, et
   billede der ikke kan hentes, en vare der er ude (ingen knap), 375 og
   1280 px, lyst og mørkt; forlægsskærmen; `nytFoto` svarer i mock'en.
4. `nytFoto` mod den udgivne server på et klar-udkast: billedet optimeres
   med seriens format, og `paa-kroppen` isoleres ikke.
5. En review-agent pr. task.

**Ikke afprøvet bagefter (kun telefonen)**: kameraet fra forlægsskærmen og
»På kroppen« i en rigtig optagelse.
