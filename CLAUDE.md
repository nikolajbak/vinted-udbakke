# VintedAuto

PWA der laver Vinted-annoncer ud fra billeder. Appen ligger på GitHub Pages,
analysen og udfyldningen kører som Supabase Edge Functions.

- App: https://nikolajbak.github.io/vinted-udbakke/ (repo `nikolajbak/vinted-udbakke`, dette repo)
- Supabase-projekt: `gjycsqshkvkcupdnvgvf`
- Alle nøgler: `.env.secrets` (chmod 600, gitignored) — `set -a; . ./.env.secrets; set +a`

**Hvor vi er nu: `STATUS.md`.** Denne fil rummer det målte og det besluttede,
som ikke må laves om. `STATUS.md` rummer det, der er i gang — hvad der er
afprøvet, hvad der ikke er, og hvad der står for tur. Læs den først i en ny
session.

Filen har fire dele:

1. **Arbejdsgangen** — udgivelse, commits, afprøvning.
2. **Delene og databasen** — hvor tingene ligger.
3. **Dine beslutninger** — regler for appen og teksterne, bestemt af dig.
4. **Målt, ikke gættet** — tekniske fund, ordnet efter emne. Hvert af dem
   kostede en fejlsøgning; lav dem ikke om uden at måle igen.

## Regler skal stå i denne fil

Denne fil indlæses automatisk i hver ny chat; koden, `STATUS.md` og
samtalen gør ikke. Derfor: **når du beder om en regel — for appen, teksterne,
databasen eller arbejdsgangen — skrives den ind HER i samme omgang**, ikke kun
i koden. Det samme gælder alt, appen bygger på: en ny tabel, kolonne,
funktion, nøgle eller hemmelighed noteres under "Delene" eller "Databasen",
før arbejdet kaldes færdigt. En regel, der kun står i en prompt i koden, er
glemt i næste chat.

Ny beslutning → under »Dine beslutninger«. Nyt fund → under det emne i
»Målt, ikke gættet«, det hører til.

---

# 1. Arbejdsgangen

## Udgivelse

**Udgiv med `./tools/udgiv.sh`, ikke med `functions deploy`.** Supabase gemmer
et versionsnummer og ingen kilde, og `deploy` sender dét, der tilfældigvis
ligger i arbejdstræet — også ukommitteret arbejde. Så er der ingen vej tilbage.
`udgiv.sh` nægter at udgive fra et snavset træ, tjekker at `index.html`s
stempel passer til filerne, kører runner-tjekket, udruller kun det, der er
ændret siden sidste udgivelse, kontrollerer at den udleverede tekst svarer til
git, og sætter et `udgivelse-NNNN`-mærke. Hver udgivelse står i `UDGIVELSER.md`.

```bash
./tools/udgiv.sh                                  # udgiv det, der er ændret
./tools/udgiv.sh dba-fill-script                  # udgiv kun den ene
./tools/tilbage.sh                                # se udgivelserne
./tools/tilbage.sh udgivelse-0003                 # hele udgivelsen tilbage
./tools/tilbage.sh udgivelse-0003 dba-fill-script # kun den ene funktion
./tools/tilbage.sh udgivelse-0003 app             # kun PWAen
python3 tools/tjek-live.py                        # kører telefonen det, git siger?
sh tools/vent-paa-pages.sh                        # er HEAD ude på Pages? (kaldes selv af de to)
```

`tilbage.sh` skriver aldrig historien om. Den henter indholdet fra mærket og
lægger det oven på som et nyt commit, så selve tilbagerulningen også kan
fortrydes.

**`_shared/` bages ind i hver funktion, der importerer den.** `udgiv.sh` og
`tilbage.sh` ved det: ændres `_shared`, udrulles alle, der bruger den.

### GitHub Pages

**Til sidst venter `udgiv.sh` på, at GitHub Pages faktisk har udgivet
commit'et.** Et grønt `udgiv.sh` betød før "pushet og mærket", ikke "live" —
og 22. september stod et commit på `main` i 25 minutter, uden at Pages så
meget som satte et byg i kø. Pages meldte sig "operational"; bygget blev bare
aldrig udløst, og ét `POST .../pages/builds` satte det i gang på under et
minut. Sker det igen, skubber scriptet selv på efter halvandet minut. Den
tjekker to ting, for de er ikke det samme: at Pages har **bygget** commit'et,
og at siden faktisk **udleverer** de stempler, `index.html` bærer — et byg kan
være færdigt, mens kanten stadig har den gamle HTML. Et Pages-problem vælter
aldrig udgivelsen; når vi er der, er der pushet og mærket.

**Et fejlet Pages-byg er som regel ikke en fejl i koden.** 30. september
fejlede fem byg i træk på under et sekund med »Page build failed« og ingen
forklaring — også et commit, der kun tilføjede tekst til `CLAUDE.md`.
`.nojekyll` ændrede intet. Efter elleve minutters ro byggede det samme commit
på 26 sekunder. Pages vil ikke bygge så tæt, når der har været mange
udgivelser lige efter hinanden. `vent-paa-pages.sh` venter derfor og beder om
ét byg til, i stedet for at melde udgivelsen død — og et byg, der fejler, skal
ikke få nogen til at lede efter fejlen i det, der blev skrevet.

## Før en commit

**Kør `./build.sh` før hver commit, der rører `style.css` eller `app.js`.** Den
stempler et indholds-fingeraftryk ind i adresserne (`app.js?v=…`). Uden det
ville opdaterings-banneret tie — det sammenligner `index.html`s ETag — og
GitHub Pages kunne servere ny HTML med gammel JS i op til ti minutter.

**`node tools/check-runner.mjs supabase/functions/*/runner.ts app.js` kører
som en del af `udgiv.sh`.** Den fanger en funktion, der er KALDT og ikke
DEFINERET. `node --check` ser kun syntaks, og runnerne lever oveni købet inde i
en `String.raw`-tekst, som hverken TypeScript eller deploy læser som kode.

Det er sket to gange, begge gange med en tekst-erstatning, der gik fra ét sted
til et andet og slugte alt imellem. Første gang forsvandt `fillCategory`,
`fillSelect`, `choose` og `ventPaaFelt` fra runneren; fejlen dukkede op på
telefonen som "Can't find variable". Anden gang forsvandt `renderDetail` ud af
`app.js` — og dén nåede i produktion, hvor appen ikke kunne åbne et udkast.

**`udgiv.sh` tjekker også syntaksen i hver funktion med esbuild.** Supabase
opdager en parse-fejl først under udrulningen, og scriptet sagde kun »Afbrudt
undervejs«: 8. oktober stod en overskydende `},` i `_shared/beskrivelse.ts`.
Deno findes ikke lokalt, så esbuild er tjekket.

**Lav derfor ikke en erstatning, der spænder fra "her" til "der" i en fil, uden
at vide hvad der ligger imellem.** Erstat den tekst, der skal væk, og ikke
strækningen omkring den.

## Enkeltting uden om udgivelsen

En midlertidig funktion, en migrering:

```bash
npx --yes supabase@latest functions deploy <navn> --project-ref gjycsqshkvkcupdnvgvf
PGPASSWORD="$SUPABASE_DB_PASSWORD" /opt/homebrew/opt/libpq/bin/psql \
  "host=aws-0-eu-central-1.pooler.supabase.com port=6543 dbname=postgres user=postgres.gjycsqshkvkcupdnvgvf sslmode=require" -f fil.sql
```

Deno findes ikke lokalt. Skal noget afprøves i kørselsmiljøet, så deploy en
midlertidig funktion og slet den bagefter.

**En SQL-funktion fejler først, når den kører.** `prisvagt_puls` talte på
`pending_price` i ti dage efter, at 005 havde fjernet kolonnen. Fjernes en
kolonne, så kør de funktioner, der bruger den, i en transaktion, der rulles
tilbage: `begin; select f(); rollback;`.

## Afprøvning

**Udløs analysen som appen gør det: sæt `status` til `afventer`** og vent på, at
den bliver `ny`. Kald ikke `analyze-draft` manuelt oveni — triggeren har
allerede fyret, og to samtidige gennemløb slås om det samme arbejde. Det kostede
en fejlagtig konklusion om, at pipelinen tog tre minutter; et rent gennemløb
med fem billeder tager omkring 25 sekunder.

Browserruden throttler timere, når den er skjult: et gennemløb, der tager 40 s
på telefonen, kan tage flere minutter her. Tiderne i loggen er derfor ikke
retvisende — kun rækkefølgen og udfaldet er.

`window.__UDBAKKE_LOG__` i browseren viser hvert trin. Kør automatikken sådan:

```js
window.__UDBAKKE_API__='<API>?key=<SHORTCUT_KEY>';
var x=new XMLHttpRequest();
x.open('GET', window.__UDBAKKE_API__+'&script=1'); x.onload=function(){(0,eval)(x.responseText)}; x.send();
```

Automatisk tilstand svarer kun, når `selected_at` er sat inden for 30 minutter —
det sker, når appens knap "Udfyld i Vinted" trykkes. Til afprøvning: sæt
`selected_at` på udkastet først, ellers får du `{"empty":true}`.

**Runnerens trin står i tabellen `spor` (`mode:'spor'`).**
Garderobe-kald, foer-nummeret, at formularen forsvandt, når fanen skjules og
vises igen, hvad vagten så, søgningen og prisens udfald (»pris: …«). Slå op
dér, før der gættes på, hvorfor en annonce ikke blev tilknyttet eller ikke
fik en markedspris: `select tid, sti, tekst from spor order by tid desc`.
**Funktionens log taber linjer** — 8. oktober manglede hentningen af både
script og udkast for nr. 49, som beviseligt skete — så en linje, der mangler
i `function_logs`, beviser intet.

---

# 2. Delene og databasen

## Delene

| Hvad | Hvor |
|---|---|
| App | `index.html` + `style.css` + `app.js` |
| Billedanalyse + optimering | `supabase/functions/analyze-draft/` |
| Udfyldning af Vinted-formularen | `supabase/functions/vinted-fill-script/` |
| Automatikken bogmærket/brugerscriptet kører | `…/vinted-fill-script/runner.ts` |
| Udfyldning af DBA-formularen | `supabase/functions/dba-fill-script/` |
| Vinteds mails → læst af en model og brugt: solgt, bud, besked, favorit, pris (nøgle: `MAIL_KEY`) | `supabase/functions/vinted-mail/` |
| Køberbeskeder fra mail som opgave på forsiden (`SVAR`, `hentSvar`) | `app.js` |
| Prisvagtens beslutning | `…/vinted-fill-script/prisvagt.ts` |
| Reglerne for annoncetekst + opslag af nypris/mål | `supabase/functions/_shared/beskrivelse.ts` |
| Prisen som hele kroner (`helKroner`, `prisTekst`) | `supabase/functions/_shared/pris.ts` |
| Gennemgangen af udfald → erfaringer (`mode:'laer'`) | `…/vinted-fill-script/laering.ts` |
| Erfaringerne lagt ind i prompterne (`hentErfaringer`); rettelserne (`hentRettelser`) | `supabase/functions/_shared/laering.ts` |
| Vinteds bedømmelses-popup lukkes (`vagtPopup`); plaggets mål i Vinteds felter (`fillMaal`) | `…/vinted-fill-script/runner.ts` |
| Varens fase, opgaverne på forsiden, varens side | `fase()`, `tegnOpgaver()`, `pladsRaekke()` i `app.js` |
| »Virker det?« i Mere (`tegnTjek`) — læser `puls` og `vinted_mails` | `app.js`; `puls` skrives af `?script=1` i begge fill-funktioner |
| »Hvad skal jeg købe igen?« (`mode:'indkob'`) — ubrugte varer pr. kategori og produkt | `…/vinted-fill-script/indkob.ts`; skærmen `tegnIndkob()` i `app.js` |
| Brugerscripterne (Vinted + DBA): indlæser, `.user.js`/`.meta.js`, udgave, båndet »ny udgave« | `supabase/functions/_shared/brugerscript.ts`; opsætningen `BRUGERSCRIPT` i hver fill-funktions `index.ts` |
| Hvad hvert modelkald koster (`noterForbrug`) → tabellen `forbrug` | `supabase/functions/_shared/forbrug.ts` |
| Fanelukkeren »Udbakke luk« (`/udbakke-luk.user.js`) og `lukFanen()` | `LUK_SCRIPT` i `…/vinted-fill-script/index.ts`; `lukFanen`/`fraApp` i `…/vinted-fill-script/runner.ts` |

## Databasen

Supabase-Postgres. Ændringer køres med `psql -f` (se »Enkeltting uden om
udgivelsen«) og ligger som filer, så skemaet kan læses uden at spørge basen.
Nye ændringer får næste nummer i `sql/` og en linje her.

| Hvad | Fil |
|---|---|
| Grundskemaet: `drafts`, Storage, webhook | `supabase/schema.sql`, `supabase/update_webhook.sql` |
| Tidlige tilføjelser til `drafts` | `supabase/add_*.sql`, `supabase/set_draft_photo.sql` |
| RLS-låsen og push-abonnementer | `supabase/auth_lockdown.sql`, `supabase/push_subs.sql` |
| Prisvagten: `listings`, `price_events`, `pg_cron` | `sql/001-prisvagt.sql`, `sql/002-prisvagt-puls.sql` |
| Løbenumre: `drafts.nr` fra en sekvens | `sql/003-loebenummer.sql` |
| Annoncens egne ord: `listings.published` | `sql/004-udgivet.sql` |
| Ventende ændringer til annoncen: `listings.pending` | `sql/005-ventende-aendringer.sql` |
| Opslåede fakta om varen: `drafts.fakta` (ny, nypris, mål, fejl, mærkernes tekst `maerker`, farvenavnet `maerkeFarve`) | `sql/006-fakta.sql` |
| Læring: `listings.sold_price`, `koeber_beskeder`, `laerdomme`, ugentligt `laering-puls` (vault: `shortcut_key`) | `sql/007-laering.sql` |
| Vinteds mails, gemt og tolket: `vinted_mails` | `sql/008-vinted-mails.sql` |
| Taget ned efter salg andetsteds: `drafts.taget_ned`; automatikkens sidste hentning: `puls` | `sql/009-lager.sql` |
| Brugerscripternes versionsnumre: `brugerscripter`, `brugerscript_udgave(navn, hash)` | `sql/010-brugerscripter.sql` |
| Runnerens spor, gemt (30 dage): `spor` (tid, draft_id, sti, tekst); hele udfyldningens log kommer med »clear« som `sti = 'udfyldning (log)'` | `sql/011-spor.sql` |
| Hvad hvert modelkald koster: `forbrug` (trin, model, tokens, søgninger, `usd`) og visningerne `forbrug_pr_vare`, `forbrug_pr_trin` | `sql/013-forbrug.sql` |
| Mailens læsning: `vinted_mails.laesning`; køberbeskeder fra mail: `koeber_beskeder.kilde`, `samtale`, `besvaret_at`, `vinted_mail_id` | `sql/014-mails-analyseres.sql` |
| Det, analysen tog fejl af: `rettelser` (kilde `dig` via triggeren `drafts_rettelse`, kilde `vinted` fra »clear«s `afvist`) | `sql/012-rettelser.sql` |

**Udkastet og annoncen er to forskellige ting.** Udkastet (`drafts`) er det, vi
sendte afsted; `listings.published` er annoncens egne ord, læst af annoncen
selv. De skilles ad med vilje: retter du en titel i Vinteds formular, eller
sætter prisvagten prisen ned, skal appen kunne vise BEGGE dele — ellers ved du
ikke, om tallet i appen er det, køberen ser. Udkastet overskrives aldrig af en
synkronisering.

---

# 3. Dine beslutninger

## Annoncetekst

Bestemt af dig 1. oktober. De står i `supabase/functions/_shared/beskrivelse.ts`
(`BESKRIVELSE_REGLER`), og alle fire tekstskrivere læser dem derfra: analysen,
Vinteds markedsrunde, DBA og Reshopper. Ny regel → ret dén fil OG listen her.

- Skriv aldrig noget om bytte.
- Er varen ny, så sig det tydeligt i første linje ("Helt ny med prismærke").
- Er varen ny, så brug nyprisen i teksten. Den læses af prismærket eller slås
  op på nettet. Findes den ikke, nævnes ingen — der opfindes aldrig et tal.
- Skriv aldrig "uden synlige huller/pletter/slid", "umiddelbart", "uden fejl
  der springer i øjnene", "almindelige tegn på brug", "uden pletter eller
  huller" o.l. (de tre sidste set
  på nr. 47, 8. oktober). Det lyder som skjulte fejl. Prompten alene holdt
  ikke, så `udenForbudte()` i `_shared/beskrivelse.ts` (`FORBUDTE_VENDINGER`)
  retter teksten efter modellen i analysen, Vinteds markedsrunde og DBA: én
  omskrivning af de sætninger, ellers fjernes de. Sig det positivt: "står flot", "i fin stand".
- Læg aldrig op til, at du kan tage ekstra billeder eller måle op.
- Mål tastes automatisk, når de kan findes: fra mærkatet, ellers fra mærkets
  størrelsesguide — og teksten siger, hvor de kommer fra.
- Nedton fejl. Modellen har beskrevet mange fejl, der ikke findes. Kun fejl,
  der er sikre og til at se, i én kort sætning sidst. Skygger, folder, krøl og
  fnug er ikke fejl og trækker heller ikke standen ned.
- Positivt sprog og positive superlativer.
- Slut med et stylingforslag.
- **Titlen skrives aldrig udelukkende med store bogstaver** (bestemt af dig
  5. oktober). Reglen står i prompten, og `ingenVersaler()` i
  `_shared/beskrivelse.ts` retter titlen efter modellen i analysen, Vinteds
  markedsrunde og DBA: er der intet lille bogstav, bliver den almindelig
  skrift med stort begyndelsesbogstav og mærket stavet som i `drafts.brand`.
  Størrelser (XL, 2XL) og ord med tal eller & (H&M) står urørt. En titel, du
  selv skriver i appen, røres ikke.
- **Sælges flere ting samlet, nævnes hver del** i titel og tekst (bestemt
  af dig 8. oktober). Nr. 47 var en sweatkjole og et par leggings på samme
  billede; kun »trøjen« blev beskrevet. Analysen registrerer hver del
  (`dele`, gemt i `fakta.dele`).
- **Børneartikler skrives til forælderen, der køber til sit barn** (bestemt
  af dig 9. oktober): holdbart til leg, nemt at vaske, nemt af og på, plads
  at vokse i — kun det, billeder og fakta bærer. Tal om barnet (»klar til
  børnehaven«), ikke om »dig«, og ingen voksenmode-ord.
- **Står materialet på vaskemærket, skrives det præcis sådan** (»95% bomuld,
  5% elastan«), og Vinteds materialefelt får det, der er mest af.
- Spørgsmål fra købere besvares med samme tone (køber-assistenten,
  `mode:'negotiate'`). **Afsendelsen sker stadig først ved dit tryk** — en bot,
  der svarer helt selv, kan få Vinted-kontoen lukket. Skal det ændres, er det
  din beslutning, og hånden (scriptet i samtalen) er ikke bygget endnu.

## Farven står på mærket

Bestemt af dig 2. oktober: **står der et farvenavn på hænge- eller
prismærket, er det facit** for farven i titel, tekst og Vinteds farvefelt.
Nr. 19 var en armygrøn hørskjorte (»Color: Army«) og blev kaldt beige.

- **Mærkerne læses i et eget kald** (`laesMaerker` i `analyze-draft`) med den
  store model og KUN billeder, hvis `kind` indeholder »maerke«. Det giver
  varenummer, modelnavn, stregkode (`fakta.maerker`), farvenavnet
  (`fakta.maerkeFarve`, fx »Army (armygrøn)«) og en trykt pris. Det kører
  side om side med billedanalysen (~3 s).
- `faktaTekst` skriver farven med, så analysen, Vinteds markedsrunde, DBA og
  Reshopper alle bruger den. Kontrollen af Vinteds farvefelt ser også
  mærkebilledet og får at vide, at mærkets farvenavn er facit.

## Mærkerne er facit — alle mærker

Bestemt af dig 8. oktober: **udled alt, der tydeligt og uomtvisteligt står
på vaskemærket og de andre mærker**, og vær præcis om farve og materiale.

- `laesMaerker` (store model) får **alle** billeder, ikke kun trinnet
  »Mærket«: billeder fra Fotos fordeles på trinene i rækkefølge, så trinnet
  siger intet om, hvad billedet viser (nr. 47: leggings under »Mærket«,
  H&M-mærkatet under »Detalje«). Den afskriver også materialesammensætning
  (`fakta.materialer`, facit for materialet), størrelse og tydelige
  egenskaber som økologisk/GOTS/vandsøjle (`fakta.egenskaber`).
- Billedanalysen kører på den store model (før Haiku) og får at vide, at
  trinnavnet kun er en hensigt.
- **Farven lander altid på Vinteds liste** (`vintedFarve`) — »mørkegrå«
  bliver »Grå«, ellers intet. Titel og tekst må gerne bruge den præcise nuance.

## Mål i Vinteds felter

Bestemt af dig 8. oktober: **skriv mål på, hvor Vinted har felterne.**
Vinted har »Mål (anbefales)« med **Længde** og **Skulderbredde** i cm for
nogle kategorier (fundet i Vinteds oversættelser, `item_upload.measurements.*`).

- Kun plaggets EGNE mål, aldrig kropsmål fra en størrelsesguide og aldrig et
  skøn ud fra et foto. Kilder: dig (Længde/Skulderbredde i udkastets
  redigering, »målt af dig«), eller varens egen produktside via opslaget
  (`slaaOp` → `fakta.laengde`/`skulderbredde`/`plagMaalKilde`). Et sæt får
  ingen.
- Runneren finder felterne på pladsholderen (»Længde (f.eks. 20)«) og rører
  aldrig pakkens mål (`parcel`). **Feltets DOM er ikke målt på en rigtig
  opret-side** — loggen siger »mål: …« og »felt ikke fundet«.

## Vinteds bedømmelses-popup lukkes

Bestemt af dig 8. oktober: popuppen med smileyer, der kommer en gang
imellem, lukkes automatisk på alle Vinted-sider (`vagtPopup`, hvert 1,5 s).

- Vinted viser sine beskeder via **Braze**, tegnet som
  `[data-testid=in-app-message-modal]` med `close-modal-button` (læst i
  Vinteds kode). Netop bedømmelsen er **ikke set** — den genkendes på ordene
  (»hvor tilfreds«, »din oplevelse« …) eller mindst tre smileyer.
- Formularens vælgere rammes ikke: »Tilfredsstillende« er ikke »hvor
  tilfreds«. En Braze-besked, der ikke ligner, lukkes IKKE, men står i
  `spor` som »popup set, ikke lukket: …« — ret mønsteret efter den.

## Systemet lærer af fejl

Bestemt af dig 8. oktober: **lær af fejl og udfordringer — egne og
markedspladsernes — og brug læringen fremover.**

- **Dine rettelser er facit.** Retter du mærke, størrelse, farve, stand,
  materiale eller kategori i et analyseret udkast, noterer triggeren det i
  `rettelser`. De 25 nyeste lægges ind i billedanalysen og skrive-kaldet
  (`hentRettelser`), uden en model imellem.
- **Vinteds afvisninger tæller med.** Et felt, Vinteds formular ikke kunne
  tage, sendes med »clear« (`afvist`) og lægges ind som »brug Vinteds ord«.
- **Ukendte forhindringer noteres i `spor`** (fx »popup set, ikke lukket«),
  så næste rettelse bygger på det, der faktisk skete.
- **For Claude:** hver fejlsøgning slutter med et fund i »Målt, ikke gættet«
  og hver beslutning her — i samme omgang. Læs `rettelser` og `spor` før der
  gættes på, hvorfor analysen eller udfyldningen tog fejl.

## Prisen

### Hele kroner overalt

Bestemt af dig 1. oktober. Teknikken står under »Målt, ikke gættet → Priser«.

**En pris skrives som hele kroner med komma og to nuller: »89,00 kr«**
(bestemt af dig 8. oktober). Det gælder alt, du læser: appen (`kr()` i
`app.js`), udkastets gemte pris og noterne (`kr()`/`prisTekst` i
`_shared/pris.ts`), push-beskederne og annonceteksten (reglen står i
`BESKRIVELSE_REGLER`). Felter, der tastes i, og tallet, der skrives i Vinteds
og DBA's prisfelt, er stadig rene heltal — `helKroner`/`prisTal` læser
»89,00« som 89. Tal i prompterne til modellerne er ikke rettet.

### En ny vare

Bestemt af dig 2. oktober: en ny vare prissættes som en **afvejning af
varens værdi (nyprisen) og hvad markedspladsen kan bære**. En helt ny
Teeshoppen-skjorte til 349 kr blev sat til 35 kr: nyprisen var ikke fundet,
feltet var brugte skjorter til 20-59 kr, og spærren mod medianen trak
modellens 45 kr længere ned. Reglen står i `_shared/pris.ts` (`NYPRIS_REGEL`,
`nyprisRamme`, `iNyprisRamme`) og gælder analysen, Vinteds markedsrunde og DBA.

- **Rammen er 40-75 % af nyprisen** (35 % for »Ny uden prismærker«). Typisk
  40-60 %. **Gulvet vinder over markedets loft**: hellere en ny vare, der
  ligger lidt længere, end en, der er givet væk.
- **Brugte varer er ikke et loft for en ny.** På Vinted regnes spærren mod
  medianen for en ny vare kun på de NYE annoncer i feltet, og er der under
  tre, sættes intet loft fra feltet. DBA's felt kender ikke standen, så dér
  er det rammen alene, der beskytter.
- **Nyprisen skal findes.** Analysen afskriver det, der står på hænge-, pris-
  og nakkemærket (varenummer, modelnavn, farvenavn, stregkode) i
  `fakta.maerker`, og opslaget søger med det. Uden fandt opslaget en anden
  Teeshoppen-skjorte til 500 kr; med fandt det hørskjorten til 349 kr på
  10 s. Mangler en ny vare stadig sin nypris, når Vinteds markedsrunde kører,
  slås den op igen dér, og runneren venter op til 90 s på svaret.
- `maerker` skrives aldrig i annoncen — det er kun til opslaget.

## Billedernes farver

Bestemt af dig 1. oktober: **billederne skal være tro mod varens rigtige farve.**
De optimeres stadig — beskæring, rotation, hvidt/sortpunkt, skarphed — men
farveægtheden går forud. En køber, der får en anden farve end billedet, sender
varen retur. Det står i `measureTone`/`applyTone` i `analyze-draft/optimize.ts`.

- **Ingen mætning og ingen farvetemperatur fra modellen.** Den bliver ikke spurgt.
  Modellens skøn tæller kun som et lille nap i eksponering og kontrast (×0,35).
- **Hvidbalancen læses kun af neutrale lyse flader** (højst 15 % forskel mellem
  kanalerne, ikke udbrændt), aldrig af varen. Er under 2 % af billedet neutralt,
  røres farven ikke. Loft ±6 %, og den må ikke flytte lysstyrken.
- **Kurven lægges på lysstyrken; R, G og B skaleres ens.** Så står nuance og
  mætning, som hvis kameraet havde fået mere lys. Rammer en kanal 255, tages
  det af mætningen i den pixel, ikke af nuancen.
- **Sortpunktet er kun en fod** under 3× sortpunktet. Et lineært sortpunkt
  trak hele mellemtonen ned — der, hvor varens farve er.
- **Gamma gør aldrig billedet mørkere**, og løfter kun en mørk scene (median
  under 118), højst til 0,85.
- Ret ikke på dette uden at måle ΔE på varen mod originalen — på flere varer,
  ikke ét billede.

Hvordan tonen måles og deles i serien: se »Målt, ikke gættet → Billederne«.

## Lageret

Bestemt af dig 3. oktober (gennemgangen af UX, punkt 1-9). Før stod 15 af 16
varer i »køen«, selv om de lå ude på Vinted, og to af dem var solgt.

- **Én fase pr. vare, regnet ud af det, der er sket** (`fase()` i `app.js`),
  aldrig en status, du selv flytter: **klar** (kladde, under analyse, eller
  ikke sendt nogen steder hen), **ude** (en aktiv annonce, eller sendt til en
  plads), **solgt** (annoncen solgt eller taget ned). Forsiden er lageret med
  de tre faner. »Markér som postet«, »Flyt tilbage til køen« og skærmen
  »Afsendte annoncer« er væk. `drafts.status` bruges kun til kladde /
  afventer / ny / kasseret; `afsendt` sættes stadig af serveren, når alle tre
  pladser er sat, og tæller som »ude«. Trykkes Vinted eller DBA på et
  `afsendt` udkast, sættes det tilbage til `ny` — automatikken henter kun `ny`.
- **Et udkast forlader ikke køen, fordi Vinted er klaret.** Med tre
  markedspladser siger "lagt op på Vinted" intet om DBA og Reshopper.
  `drafts.posted_to` noterer hver plads for sig; `mode:'posted'` fra
  Vinted-scriptet sætter kun `vinted`. Hvor varen er, regnes ud af
  `posted_to` og `listings`. Et tryk på en markedsplads noterer, at varen er
  sendt DERHEN — ikke at den er lagt op; kun Vinted-scriptet kan bekræfte det
  sidste.
- **Det, der venter på dig, står øverst på forsiden** som opgaver, vigtigst
  først: solgt på Vinted men stadig ude på DBA/Reshopper → analysen fejlede →
  rettelse venter → salgspris mangler → ikke tilknyttet (over en time efter
  udfyldningen) → tjek mod markedet. Scan og Prisvagt ligger i forsidens fod;
  menuen hedder »Mere«.
- **Solgt ét sted = tag den ned de andre steder.** DBA og Reshopper kan ikke
  tages ned af appen, så push-beskeden om salget siger »Slet den også på DBA«,
  og opgaven står, til du trykker **Taget ned** (`drafts.taget_ned`).
- **Varens side har én række pr. markedsplads**, med status, hjerter, dage
  og handlinger. Mærker til at pille af er væk; »Ikke sendt alligevel« retter
  en fejlmarkering. En vare, der er ude, kan ikke kasseres — den tages ned
  (»Taget ned uden salg« sætter annoncen til `afsluttet`).
- **»Det, der udfyldes« viser kilden og det usikre**: farven »fra mærket« eller
  »skønnet ud fra billedet«, en ny vare uden nypris i rav, målenes kilde.
  Mærke, størrelse, farve, stand og materiale kan rettes i udkastet, så længe
  varen er klar; derefter kun på Vinted.
- **Salgsprisen tastes i et felt på siden**, aldrig i en `window.prompt`.
- **»Virker det?«** øverst i Mere viser notifikationer, hvornår automatikken
  til Vinted og DBA sidst blev hentet (`puls`), og den sidste mail fra Vinted.
- **Optagelsen kan tage flere varer i træk** (»Lav udkast · næste vare«) og
  flere billeder fra Fotos på én gang; de fordeles på trinene i rækkefølge.

## Fanen lukker sig selv

Bestemt af dig 8. oktober: **er Safari-fanen åbnet fra appen, og venter
intet på dig, lukkes den, når runneren er færdig.**

- Kun Vinted, og kun når alt gik igennem: »Tjek« uden nedsættelser,
  »Opdatér fra Vinted«, og en rettelse/prisnedsættelse kvitteret af Vinted
  (sidst i en runde). Fejl, rettelser der ikke gik igennem, udfyldning
  (Upload er dit tryk) og DBA (Udgiv er dit tryk) lader fanen stå.
- »Fra appen« = et `udbakke=`-flag i adressen, husket i fanens
  `sessionStorage` (`fraApp`). Appen sætter `#udbakke=send` på alle sine
  `/edit`-links. En fane, du selv har åbnet, lukkes aldrig.
- Safari lader ikke en side lukke en fane, den ikke selv har åbnet, og
  `GM.closeTab` findes kun med `@inject-into content` — mens runneren skal
  køre i sidens rum (Reacts data). Derfor et eget lille brugerscript,
  **»Udbakke luk«**, installeret fra Mere: det sætter `data-udbakke-luk` på
  `<html>` og lukker fanen på hændelsen `udbakke-luk`. Uden det står et
  bånd med »Luk selv næste gang«. Læg aldrig andet ind i det.
- **Tilbage til appen kan ikke gøres fra Safari.** iOS har ingen adresse,
  der åbner en hjemmeskærms-webapp; det er »◀ Udbakke« øverst til venstre.
  Prøvet 8. oktober: Genvejes »Åbn app« viser ikke Udbakke, så en genvej
  via `shortcuts://` kan heller ikke gøre det. iPhone-skærmdublering findes
  ikke i EU. Byg det ikke uden at måle forfra på en ny iOS.

## Skærmen holdes tændt

Bestemt af dig 8. oktober: **telefonens skærm må ikke slukke, mens runneren
arbejder.** Slukker skærmen, lægger iOS fanen til at sove, og arbejdet går i
stå. `vaagen(min)`/`slip()` i begge runnere (Screen Wake Lock API).

- Holdes kun med en tidsgrænse og slippes, når arbejdet er gjort:
  udfyldning (10 min, sluppet ved »Udfyldt« — så er det dig, der trykker),
  en fane åbnet fra appen (5 min, sluppet af `lukFanen`), formularen væk
  efter Upload (3 min, sluppet ved tilknytningen), landet efter Upload uden
  for `/items/` (2 min). DBA: valget af Markedspladsen (2 min) og
  udfyldningen (10 min).
- Låsen forsvinder, når fanen skjules, og tages igen, når den vises. Afviser
  Safari den uden et tryk, tages den ved første tryk.
- `spor` »vaagen: …« siger, om den blev holdt, afvist eller ikke findes.
  **Ikke målt på telefonen endnu.**

## Kortene i listen

Bestemt af dig 2. oktober, tredje linje rettet 3. oktober. Lageret bygger
kortet med `kortLinjer()` og `linjeTre()` i `app.js`.

- **Altid tre linjer, på alle kort**, så de er lige høje. En tom linje får et
  hårdt mellemrum. Hver linje er én linje; resten forkortes med »…«.
  1. Mærke · varetype — og løbenummeret helt til højre. Intet andet.
  2. Størrelse · farve · stand · materiale.
  3. Klar: prisen, eller hvor langt udkastet er (»Analyserer …«,
     »Kladde«). Ude: pris nu · ♥ hjerter · dage ude (· »rettelse venter«).
     Solgt: »solgt for X kr« eller »tast salgsprisen« · dage den lå.
- **Én skrift og én størrelse** på kortet (`.kort-l`). Ingen mono, ingen
  chips — kun vægt og farve skiller linjerne ad.
- Løbenummeret står også i toppen af udkastet, i titlens skrift og størrelse.

## Ingen zoom i appen

Bestemt af dig 3. oktober: **appen kan ikke zoomes.** Tre greb, for iOS
ignorerer `user-scalable=no` alene:

- Viewporten har `maximum-scale=1, user-scalable=no` — det stopper også
  Safaris egen zoom, når et felt får fokus.
- `html{ touch-action: manipulation; }` i `style.css` stopper dobbelttrykket.
- `gesturestart/-change/-end` får `preventDefault()` øverst i `app.js` —
  det stopper knibet. Beskæringen bruger touch-hændelser og rammes ikke.

## Synkronisering af annoncerne

Bestemt af dig 1. oktober: annoncerne synkroniseres automatisk begge veje,
når der rettes i appen eller på markedspladsen. Kun Vinted — DBA og Reshopper
har ingen række i `listings` endnu.

- **Ingen runde på et ur.** Bestemt af dig 1. oktober: der må ikke tjekkes
  med et fast interval. En baggrundsrunde over alle annoncer blev bygget og
  fjernet igen samme dag. Synkroniseringen sker på hændelser.
- **Salg, bud og beskeder når serveren som mail fra Vinted** (`vinted-mail`).
  Det er den eneste vej, der virker uden telefonen: Vinted blokerer
  datacenter-IP'er og har ingen webhooks. Se »Vinteds mails« nedenfor.
- **Pris, titel og beskrivelse rettet på Vinted læses af den annonce, du står
  på.** Retter du i Vinteds formular i Safari og trykker Gem, lander du på
  annoncen, og runneren læser den stille. Den stille aflæsning må aldrig
  HENTE annoncesiden (2 MB); den prøver `/api/v2/items/{id}` (som p.t. svarer
  404) og læser ellers kun den side, der allerede er åben (`hentVare(id,
  kunApi)`). Rettes der i Vinteds egen app, sender Vinted ingen mail; så
  kommer det hjem, når du åbner annoncen i Safari, trykker **Opdatér fra
  Vinted**, eller prisvagten måler den.
- **Appen → Vinted sker ved Gem.** Redigeringen starter fra annoncens egne ord
  (`published`), ikke udkastets, og kun det, der afviger fra ANNONCEN, sendes
  ud — en titel rettet på Vinted skrives ikke tilbage, fordi du bagefter rettede
  prisen i appen. Gem lægger ændringen i `pending` og åbner straks
  redigeringssiden, hvor runneren skriver den ind og gemmer. Trykket på Gem ER
  trykket. Prisvagtens egne nedsættelser kræver stadig et tryk fra
  Prisvagt-skærmen; ligger der en i forvejen, siger redigeringsskærmen, at den
  går med ud.
- **Udkastet overskrives stadig aldrig af en synkronisering** — kun af dit eget
  Gem. Forskellen mellem udkast og annonce er det, appen viser.
- **En pris rettet på Vinted noteres som `aendret` (»rettet på Vinted«) og
  sætter `last_change_at`.** Ellers ville prisvagten ikke holde sin ro efter en
  håndrettet pris, og gennemgangen af salgene ville ikke se nedsættelsen.
  Rettet titel/beskrivelse noteres som `rettet`.
- **Står et ventende felt allerede i annoncen, fjernes det fra `pending`.** Har
  du skrevet det ind på Vinted selv, er der intet at sende.
- **En rettelse er først sendt, når Vinted har kvitteret** (bestemt af dig
  5. oktober). Efter Gem læser runneren annoncen frisk (`/items/{id}`,
  JSON-LD — titel, HELE beskrivelsen og pris), og `mode:'anvendt'` rydder kun
  de felter af `pending`, der faktisk står i annoncen; resten står stadig som
  klar. Runneren bliver på siden efter Gem (`efterGem`), for Vinted skifter
  adresse uden at genindlæse — før ventede kvitteringen på en sideindlæsning,
  der aldrig kom, og 12 gemte rettelser stod som »klar« i appen. Viser
  redigeringsformularen allerede ændringen, kvitteres der uden at gemme igen.
  »Send N rettelser« åbner med `?udbakke=ret`, og runneren går selv videre til
  den næste (`naeste` i svaret; besøgte annoncer springes over). Gem-knappen
  er den SIDSTE »Gem« uden for vælgerpanelerne — i et bredt vindue har hvert
  panel sin egen.
- **Historiklisten viser annoncens pris og »solgt«**, ikke udkastets pris.

## Vinteds mails

En mailregel sender Vinteds mails videre til en modtagertjeneste
(CloudMailin, Postmark eller en Cloudflare Email Worker), som POSTer dem til
`vinted-mail?key=<MAIL_KEY>`. Funktionen forstår alle tre formater.

- **Hver mail gemmes i `vinted_mails`**, også dem, der ikke blev forstået.
  Ret aldrig et mønster uden at have set en rigtig mail. Mønstrene for solgt,
  bud og favorit er målt (herunder) og vinder over modellens læsning.
- **Bud-mailen er målt** (9. oktober, første mail): afsender
  `no-reply@vinted.dk`, emnet er på **tysk** (»Neues Angebot für <titel>«),
  teksten dansk (»… vil gerne købe … til en lavere pris«, »Ny pris:
  kr.80.00 i stedet for kr.100.00«). Beløbet står som `kr.80.00` med punktum
  som decimaltegn og læses med `helKroner`, efter at links og
  videresendelsens `>` er fjernet. Linkene er base64-sporingsadresser
  (`links.vinted.com/t/…`), så annoncenummeret står ikke som `items/…` —
  mailen blev knyttet på titlen.
- **Salgsmailen er målt** (9. oktober): emnet »Du har solgt en artikel på
  Vinted«, teksten »<køber> har købt / <titel> / 80.00 kr.«. Beløbet er det,
  varen blev solgt FOR (et accepteret bud), og gemmes som
  `listings.sold_price` — så skal salgsprisen ikke tastes. Mangler beløbet,
  beder push'en stadig om det. Besked-mailen er ikke målt.
- **Favorit-mailen er målt** (9. oktober): »Din <titel> er lige blevet
  markeret som favorit«, teksten »<køber> har markeret din "<titel>" som
  favorit!« med varens AKTUELLE pris (»150.00 kr.«). Prisen i den kan
  afvige fra appens: Acne-trøjen stod til 450 i appen og 150 i mailen —
  rettet i Vinteds egen app, som ikke sender nogen mail om det.
- **Annoncenummeret står kun i HTML'en**, når mailen kommer direkte (ikke
  videresendt): så er der ingen tekstdel, og `udenTags` fjerner linkene.
  Vinteds links er `links.vinted.com/t/<base64>`, hvor base64 er
  `https://www.vinted.dk/e/item?id=<nr>|…`; `annonceNumre` pakker dem ud.
  HTML'en gemmes ikke i `vinted_mails`, kun teksten — de udpakkede links
  gemmes i `laesning.links`.
- **Mailen knyttes til annoncen på nummeret i et link**, ellers på den
  længste titel (mindst seks tegn), der står i mailen.
- **Solgt** → annoncen sættes til `solgt` med salgsprisen, hændelse,
  gennemgangen af salgene, og en push. Dit eget køb (»du har købt«, »dit
  køb«) er ikke et salg.
- **Bud** → push, prisen synkroniseres (»i stedet for kr.100.00«), og buddet
  gemmes i `koeber_beskeder` (`intent:'bud'`, allerede »besvaret«) til
  gennemgangen.
- **Favorit** → stille: prisen synkroniseres, og hjerterne tælles én op
  (`favourites`). Ingen push (bestemt af dig 9. oktober).
- **Besked** → står købers ord i mailen, skriver køber-assistenten et udkast
  (`mode:'negotiate'` med `kilde:'mail'`), og forsiden viser opgaven »Køber
  skriver om …« med **Kopiér svaret**, **Åbn samtalen** og **Klaret**
  (`koeber_beskeder.besvaret_at`). Står ordene ikke i mailen, kommer opgaven
  uden udkast. Besked-mailen er ikke målt endnu.
- **Prisen fra en mail noteres som enhver pris rettet på Vinted** (`synkPris`):
  `aendret` med »rettet på Vinted (set i bud-/favorit-mail)«,
  `last_change_at`, `published.price`, og et ventende prisfelt, der allerede
  står i annoncen, ryddes.
- **Alt andet** → modellens slags (forsendelse, udbetaling, bedømmelse,
  eget_koeb, konto, reklame, andet) og resumé gemmes; første gang en slags
  dukker op, kommer en push »Ny slags mail fra Vinted«. »andet« meldes hver
  gang. Så beslutter vi, hvad slagsen skal bruges til.
- **`?genlaes=<id>`** læser en gemt mail igen og bruger den — uden push og
  uden at tælle hjerter op igen. Til når reglerne er rettet.
- **Samme mail to gange er én mail** (`message_id` er unik). Tjenesterne
  sender igen, hvis de ikke fik svar i tide.
- **En push med en vare åbner varen** (`#v<nr>`), også når appen allerede er
  åben — `sw.js` navigerer den åbne rude.

## Mails bruges til alt, de kan

Bestemt af dig 9. oktober: **hver indgående mail fra Vinted analyseres
automatisk og bruges til det, den kan — vi lærer af alle hændelser. Stil
spørgsmål ved tvivl.**

- Hver mail læses af en model (`laesMail` i `vinted-mail`, Haiku 5.5, kun
  tekst, ~$0,0005 pr. mail), og læsningen gemmes i `vinted_mails.laesning`.
  De målte mønstre går forud for modellen.
- Det, en mail kan bruges til, bruges: salgspris, aktuel pris, hjerter,
  bud og købers ord (se »Vinteds mails«).
- En ny slags mail meldes med en push første gang, og så spørger Claude dig,
  hvad den skal bruges til. **For Claude:** ved en ny slags i `vinted_mails`,
  læs mailen, foreslå en brug, og spørg — gæt ikke.
- Afsendelse til en køber sker stadig kun ved dit tryk.

## Læring af salgene

Bestemt af dig 1. oktober: appen skal lære af, hvad der sælger, og bruge det i
næste annonce. Sådan hænger det sammen:

- **Udfaldet måles på annoncen** (`listings`): solgt eller ej, dage ude,
  hjerter, nedsættelser, og `sold_price` — fordi et bud, du tog imod, ligger
  under udbudsprisen. Den læses af Vinteds salgsmail, ellers taster du den
  ved **Markér som solgt**. Et salg uden salgspris ved gennemgangen om.
- **Købernes spørgsmål gemmes** (`koeber_beskeder`) hver gang køber-assistenten
  bruges — fra **Svar en køber** på prisvagt-skærmen og fra Vinteds
  besked-mails — og hvert bud fra en bud-mail. Svaret kopieres; appen sender
  aldrig selv.
- **Gennemgangen** (`mode:'laer'`) kører mandag kl. 5.30 UTC, efter hvert salg
  og ved tryk. Den siger »for tidligt«, indtil der er **3 solgte og 6 varer at
  bedømme** (solgt, eller ude i 14 dage) — eller 5 købersamtaler. En erfaring
  skal pege på **mindst 3 varer, der kan bedømmes**; serveren smider resten
  væk. En vare ude i under 14 dage uden salg tæller ikke.
- **Erfaringerne er ikke regler.** De lægges ind EFTER `BESKRIVELSE_REGLER`
  med besked om, at reglerne går forud. Tekst og pris går til analysen og
  Vinteds markedsrunde, tekst til DBA og Reshopper, pris til prisvagten,
  kommunikation til køber-assistenten. Billed-erfaringer går ingen steder hen
  — de er til dig, når du fotograferer.
- **Du kan slå en erfaring fra.** Så foreslås den ikke igen; en ny gennemgang
  erstatter kun dem, der er slået til.
- **Pris-erfaringer er relative** (»10 % under medianen«) og må aldrig lægge en
  pris over medianen — Vinted skjuler solgte varer.
- **En erfaring skal skille.** Første prøve på opdigtede varer gav »brug
  mindst 3 billeder« — men de stille varer HAVDE også tre billeder, og den
  eneste med ét var tre dage gammel. Derfor tæller kun varer, der kan bedømmes,
  og prompten siger, at et træk, der findes lige så meget blandt de stille, ikke
  er en erfaring. Den, der skriver annoncen, kan heller ikke slå noget op: en
  erfaring om »altid at skrive mål« uden »når de findes« får den til at opfinde
  dem.

## Hvad skal jeg købe igen?

Bestemt af dig 5. oktober: en analyse af, hvilke **ubrugte** varer (stand
»Ny …« eller `fakta.ny`) der er lette at sælge igen — som indkøbsliste. Den
ligger i Mere og regnes af `indkob.ts` (`mode:'indkob'`), hver gang skærmen
åbnes. Intet gemmes.

- **Kun dine egne salg**, ikke Vinted som helhed. Grundlaget er `listings`
  (Vinted) med udkastets mærke, varetype og nypris. Annoncer `afsluttet`
  (taget ned uden salg) tæller ikke.
- **To niveauer**: kategori = `drafts.category` (varetypen), produkt =
  mærke + varetype (»Teeshoppen · Jakker«, mærket uden hensyn til store og
  små bogstaver), med de enkelte varer under hvert produkt. Brugte varer
  vises kun som sammenligning.
- **En vare bedømmes, når den er solgt eller har været ude i 14 dage** — som
  i gennemgangen af salgene. Dommene: **sælger let** (solgt, median højst 7
  dage til salg, mindst halvdelen af de bedømte solgt), **sælger**,
  **lovende** (intet solgt, men ≥ 0,5 hjerter/dag), **træg** (bedømt, intet
  solgt), **for tidligt** (intet bedømt). Hver gruppe siger, hvor mange varer
  den bygger på; én vare er »et fingerpeg, ikke et mønster«.
- **Tallene er kode; modellen skriver kun anbefalingen.** Serveren smider
  ethvert navn væk, der ikke står i tabellen, og tillader kun »Køb igen« for
  sælger let/sælger/lovende og »Lad være« for træg — på første prøve lagde
  modellen fire dage gamle varer under »lad være«. Uden en eneste bedømt ny
  vare kaldes modellen slet ikke.
- **Indkøbsprisen kendes ikke**, så der regnes ikke på fortjeneste —
  kun salgspris og % af nyprisen, når nyprisen er fundet.
- Vinteds søgning (til en eventuel markedsanalyse senere) filtrerer kun med
  `attribute_ids[catalog]=…&attribute_ids[status]=6`; `catalog_ids`/
  `status_ids` ignoreres stille (målt 5. oktober). Annoncens status kan ikke
  læses billigt: `/api/v2/items/{id}` og `/details` svarer 404/403.

---

# 4. Målt, ikke gættet

Hver af disse kostede en fejlsøgning. Lav dem ikke om uden at måle igen.

## Telefonen og serveren

- **Vinted blokerer datacenter-IP'er.** Hele markedsopslaget, al måling af
  annoncer og al udfyldning sker derfor fra telefonens egen session, ikke fra
  serveren.
- **Prisvagten kan ikke køre på serveren alene.** Den kan huske og beslutte,
  men den kan hverken se markedet eller ændre en pris: prisen sidder i Vinteds
  egen formular. Derfor er delingen fast — serveren beslutter, telefonen måler
  og skriver. En Render-tjeneste eller et andet ur ændrer ikke på det; det er
  døren, ikke klokken, der er problemet. `pg_cron` er uret, og det er nok.
- **`runner.ts` serveres fra `?script=1`.** Både bogmærket og brugerscriptet
  (`/udbakke.user.js`) er kun indlæsere, der henter den derfra ved hver
  sideindlæsning, så rettelser i runner rammer telefonen uden geninstallation.
  Brugerscriptet bar før runneren indbagt og ventede på, at Userscripts
  opdaterede: 2. oktober blev nr. 19-21 lagt op med en runner to udgivelser
  bagud, og en rettelse så ud til ikke at virke, fordi den aldrig var nået ud.
  **Læg aldrig runneren ind i brugerscriptet igen** — gælder også DBA.
- **Et gammelt brugerscript med runneren indbagt kan stadig ligge i
  Userscripts — og vinde.** 8. oktober fra ca. 14:20 UTC fik nr. 24, 25, 41,
  48-51 den foreløbige pris: den gamle runner kørte synkront, satte vagten
  `__UDBAKKE_RAN__`, og den friske runner fra `?script=1` gav straks op. Den
  gamle søgte på `/api/v2/catalog/items` (404) og sendte ingen spor. Samme
  runner gav i browserruden en markedspris på 14 s. Derfor har runneren sin
  egen vagt (`__UDBAKKE_RAN2__`), viser et bånd og sporer »en anden runner
  kørte først«, hvis nogen havde sat den gamle, og hvert kald bærer `&r=2`
  (`RUNNER_GEN` i `index.ts`): et kald fra vinted.dk uden afvises og noteres i
  `spor` som »forældet runner«. Hæv tallet kun sammen med `runner.ts`.
- **`window.__UDBAKKE_*` må ikke omdøbes.** Et installeret bogmærke sætter dem,
  før det henter automatikken; et andet navn brækker det uden varsel.
- **Alt, der skal åbne i RIGTIG Safari, skal have `x-safari-` foran.** I den
  installerede PWA åbner en almindelig `https://`-adresse inde i appens egen
  webvisning, og dér findes Userscripts-udvidelsen ikke: man ser koden, men der
  er ingen ᴀA-menu at installere fra. Knappen ser ud til ikke at virke. Gælder
  både installations-knapperne og "Udfyld i …".
- **Userscripts (iOS) installerer kun fra en URL, hvis STIEN ender på
  `.user.js`**, og filen skal udleveres som `text/plain`, ellers henter Safari
  den ned i stedet for at vise den.
- **Ændrer du `@match` i et brugerscript, skal det installeres forfra.** Listen
  er bagt ind ved installationen; Userscripts henter først den nye, når den
  opdaterer, og indtil da fyrer scriptet ikke på de nye adresser.
- **Userscripts opdaterer kun til et STØRRE versionsnummer — og ikke
  pålideligt af sig selv.** Dens egen README siger, at opdateringen ikke er
  færdigbygget. Før var versionen `1.0.<hash>`, og et nyt hash kan være
  mindre end det gamle: så ville en ny udgave aldrig blive set som ny. Nu
  (8. oktober, `_shared/brugerscript.ts`):
  - Versionen er `2.0.<n>`, hvor `n` kommer fra `brugerscript_udgave`: nyt
    indhold (hoved + indlæser) får næste nummer, samme indhold beholder sit.
    Ret aldrig versionen i hånden, og gå aldrig tilbage til et hash.
  - `@updateURL` peger på `.meta.js` (kun hovedet), `@downloadURL` på
    `.user.js`.
  - Indlæseren sætter sin udgave (`__UDBAKKE_VER__` / `__UDBAKKE_DBA_VER__`)
    og sender den med som `&v=`. Er den ikke den nyeste — eller mangler den,
    som i brugerscripter fra før 8. oktober — viser siden et bånd med
    **Opdatér**, der åbner `.user.js`; lukkes båndet, kommer det igen om seks
    timer. Bogmærket får aldrig båndet. `puls.detalje` siger »brugerscript
    forældet«, og appens »Virker det?« viser det med rødt.
- **Begge brugerscripter er kun indlæsere** — også DBA's, som til 8. oktober
  bar runneren indbagt og derfor skulle opdateres ved hver rettelse. Kun en
  ny `@match` eller en ændret indlæser kræver en ny udgave.

## Billederne

### CPU og format

- **Supabase måler CPU pr. kald, og billedbehandling er dyr.** Ét foto på
  1800×1350 fylder en mærkbar del af budgettet; fem i samme kald gav
  "CPU Time exceeded", og analysen hang uden at fejle synligt. `analyze-draft`
  kalder derfor sig selv med `{id, photo: n}` — ét foto pr. invokation,
  sekventielt. Læg aldrig flere fotos tilbage i ét kald, og undgå ekstra
  afkodninger: dekodningen er det dyre trin, ikke opløsningen.
- **Send billeder til modellen som URL, ikke base64.** De ligger offentligt i
  Storage. Base64 kostede både CPU og det meste af ventetiden.
- **Vinteds billedformat er målt på Vinted selv.** Hver annonce vises med 800 px
  på den lange kant; kopien de beholder til zoom er 1200×1600 og aldrig større.
  Derfor `MAX_EDGE = 1600` og portræt helt ned til 3:4. Deres egne filer vejer
  220–690 kB, så kvalitet 88 er rigeligt — de koder alligevel om.
- **Hele serien får ÉT format, målt på det første billede** og gemt i
  `drafts.ratio` — samme greb som fremkaldelsen. De to hensyn trækker hver sin
  vej: et format pr. billede gør varen størst, men giver fem forskellige facons
  i én annonce; et fast format (før: altid 3:4) er ens, men kostede en bred
  cardigan to tredjedele af rammen. Målestokken er nu hovedbilledet, altså varen
  selv, i stedet for et tal vi har valgt. Prisen er, at et nærbillede i
  portrætfacon får brede bånd i siden.
- **Et nærbillede må bøje seriens format; en hel vare må ikke.** Et hængemærke
  er højere, end billedet er bredt, og kan aldrig ligge i en kvadratisk ramme —
  målt til 43-46 % bjælke. Hele varer bøjer ikke: de ses i gitteret.

### Rotation

- **ImageScript `rotate()` drejer MOD uret.** Værktøjet spørger modellen om
  grader MED uret, så koden kalder `rotate((360 - rot) % 360)`. Målt i
  kørselsmiljøet, ikke læst i dokumentationen.
- **Beskæringsrammen skal med rundt** ved rotation (`rotateBox`) — den er sat i
  det oprindelige billede, men bruges efter rotationen.
- **Rotationen handler om varen, ikke om tyngdekraften.** Telefonen kan holdes på
  højkant eller på hovedet, så hvad der vendte opad under optagelsen siger intet.
  Spørgsmålet er, hvilken af de fire drejninger der viser varen som i en butik.
  **Er der tekst i billedet, er læseretningen facit**; står det ikke i
  prompten, vender mærkater tilfældigt. Uden tekst er tyngdekraften facit.
- **Retningskontrollen skal pege på kraven, ikke gætte grader.** Bad man den om
  et gradtal og skrev "svar 0 ved tvivl", kom produkt 8's forfra-billede ud på
  hovedet med kontrollens accept. Nu svarer den, hvor den ende ligger, der bæres
  øverst — krave, halsåbning, skulderlinje, linning — og koden regner graderne.

### Beskæring og isolering

- **Beskæringen er motivbevidst.** Luften omkring motivet afhænger af, hvad det
  ER: en hel vare tåler en stram ramme, et mærkat eller et logo gør ikke —
  klistret op ad kanten læser det som en fejl. Var motivet allerede skåret af i
  originalen, lægges rammen bredt, så det afskårne ikke springer i øjnene.
  Værdierne står i `PADDING` i `optimize.ts`.
- **KUN hele varer isoleres — aldrig nærbilleder.** Et hovedbillede skal ligne
  et produktfoto i gitteret, og en hel vare har ingen gavn af den flade, den
  ligger på. Et nærbillede beholder sine omgivelser: stoffet omkring et mærkat
  er sammenhængen, ikke rod. Beskåret stramt mister det den sidste linje
  tekst: `backgroundClutter` slog isoleringen til på vaskemærkatet, og dets
  højre kant blev klippet af.
- **Isolering koster det, den fylder op — og prisen afhænger af faconen.** En
  høj parka i et kvadrat koster 6 % af højden i bræmme, en bred bomberjakke i
  det SAMME kvadrat koster 35-42 %. Målt på produkt 7 og 8. Derfor isoleres en
  hel vare kun, når baggrunden er rodet (`backgroundClutter`), når det koster
  højst 15 % af rammen (`spild <= 0.15`), eller når billedet ikke kan rumme
  formatet (`isoler` i `optimize.ts`).
- **Rammen vokser ikke ud i rod.** For at ramme formatet skal beskæringen vokse,
  og den vokser ud i dét, der ligger omkring varen. Er baggrunden rolig, er det
  fint. Er der fødder, sengekant eller møbler tæt på (`backgroundClutter`),
  beskæres der stramt om varen, og resten fyldes med **hvidt** — varen står
  isoleret som på et produktfoto, og formatet er alligevel præcist. Uden det
  greb hentede formatjusteringen præcis dét ind igen, beskæringen skulle af med.
- **Isolerer vi, skal beskæringen være TÆT.** Den hvide ramme leverer luften.
  Lægger beskæringen også sin egen til, får man begge dele: en bræmme sengetøj
  klemt inde mellem varen og det hvide, som læser som en fejl. Målt på et rigtigt
  foto — første forsøg så præcis sådan ud.
- **Rammen kan sjældent glide fri af rodet.** Prøvet: lad rammen lægge sig,
  hvor der er mindst uro (forskellen mellem nabopixels, række for række). Det
  virker kun, når der ER et roligt sted at lægge den. På produkt 8 er der 120 px
  roligt lagen over jakken og 1315 px ramme at fylde, så hver eneste placering
  tager gulvet med. Målingen ligger i `uroAkser`/`roligstePlads` og bruges, når
  rammen vokser.
- **Bræmmen får farven fra den side, den rører.** Hjørnefarven er ét tal for
  hele rammen og gav en synlig søm — helt hvidt op ad et lagen, der er cremet og
  skygget. Med `sideFarve` pr. side forsvinder sømmen: en bræmme på 35 % kan
  ikke ses på det færdige billede, selv om den kan måles.

### Tone (fremkaldelsen)

Reglerne for farveægthed står under »Dine beslutninger → Billedernes farver«.

- **Hele serien fremkaldes ens.** Hvidbalance, sort-/hvidpunkt og gamma måles på
  det FØRSTE billede, gemmes i `drafts.tone` og genbruges på resten. Måler hvert
  billede sit eget, får den samme jakke forskellig farve alt efter hvor meget
  gulv der er i rammen — forfra blev oliven og udvasket, bagfra næsten sort.
  Derfor kører foto 0 alene først, resten parallelt bagefter. En tone uden
  `v: 2` er målt efter den gamle opskrift og genbruges ikke — foto 0 måler forfra.
- **Tonen måles på hele scenen, FØR beskæringen — aldrig på det færdige
  billede.** Målt på det isolerede billede var de lyseste 10 % den hvide ramme:
  hvidbalancen blev `[1,1,1]`, medianen skød op, gamma ramte loftet på 1,25, og
  hver vare kom 7-13 L* for mørk ud (ΔE 7-15 på nr. 10-17). Den kobaltblå
  sweater blev marineblå. Tonen lægges på lige efter beskæringen og før rammen,
  så rammen får det fremkaldte billedes farve og hvidt forbliver 255.

### At måle en billedrettelse

- **Billedmodellens svar svinger fra kørsel til kørsel.** Samme foto gav på fire
  gennemløb forskellig rotation, forskelligt `backgroundClutter` og forskellig
  motivkasse. Nærbillederne er stabile; hovedbilledet er det ikke. Mål derfor
  aldrig en billedrettelse på ét gennemløb.
- **Dømm ikke en bjælke på en nedskaleret kopi.** `sips -Z` + fremvisning
  skjulte en hvid bræmme på 42 %, som lå der. Mål pixels, eller se den fulde
  fil.

## Modellerne

- **Hvert kald til Anthropic noteres i `forbrug`** — via `noterForbrug(svar,
  trin, draftId)` lige efter `res.json()`. Et nyt kald uden den er usynligt i
  regningen. Prisen pr. model står i `PRIS` i `_shared/forbrug.ts`; ret den,
  når en model skiftes. Spørg `forbrug_pr_trin`, før der gættes på, hvad
  noget koster.
- **Et foto koster ~3.200 input-tokens på Sonnet 5** (1350×1800, målt med
  `count_tokens` 8. oktober) — det samme på Sonnet 5.5, Haiku 5.5 og Opus
  5.5; Haiku 4.5 nedskalerer til ~1.576. Fotoene er det meste af regningen:
  skønnet var ~$0,45 pr. vare, heraf ~70 % billeder.
- **Anthropic-API'et her tager ikke assistant-prefill** → brug `tool_choice`.
- **Modellen leverer af og til en indlejret liste som tekst** i et
  værktøjssvar (`erfaringer: "[{…}]"`). Første kørsel af gennemgangen væltede
  på `.map`. `laering.ts` parser en tekst, før den bruger den.
- **Haiku kan ikke læse et lille mærke blandt fem billeder.** På nr. 19
  læste den »TEF35« og »Atrm« to gange ud af tre, og selv da den havde læst
  »Army«, kaldte den skjorten sandfarvet. Sonnet på mærkebillederne alene
  læste alt rigtigt tre ud af tre. Læg derfor aldrig afskrift af mærker
  tilbage i billedanalysen.
- **Kontrollen af et valg må ikke se titel eller beskrivelse.** Gør den det,
  gentager den deres fejl — den forkastede både "Vindjakker" og "Regnjakker" for
  den samme jakke. Den dømmer på billederne alene.
- **Nypris og mål slås op med `web_search_20250305`, ikke `20260209`.** Den nye
  variant filtrerer resultaterne med kode og brugte 34-140 s på det samme fund,
  som den simple fandt på 21 s. Og `max_tokens` under ~4000 slap op midt i
  søgningen og gav et tomt svar. Opslaget kører side om side med
  markedssøgningen i `analyze-draft`, så det ikke lægger sin tid oveni.

## Vinted: formularen

- **Vinteds vælgere**: dialogen er `.ReactModal__Content`, rækkerne er `div`'er
  med en React-`onClick` (ikke `<button>`). Feltet åbnes ved at klikke selve
  `input`'et. Bladet i kategoritræet skal bekræftes med **Gem** — Gem på et
  mellemniveau kasserer valget.
- **Vælgerne ser forskellige ud efter vinduets bredde.** Smalt (telefon): en
  dialog, `.ReactModal__Content`. Bredt (computer): panelerne er indlejret i
  siden og står åbne hele tiden — åbent og lukket ser ens ud i DOM'en. Feltet
  peger selv på sit panel: `data-testid` på inputtet med `-input` skiftet ud med
  `-content`. Det gælder alle seks felter.
- **`#brand`, `#size`, `#condition`, `#color`, `#material` findes ikke i DOM'en,
  før en kategori er valgt.** Derfor er kategorien altid første trin.
- **Vinteds kategorinavne er dens egne** ("Tøj til drenge", ikke "Drengetøj").
  Ingen model gætter dem. Telefonen sender de punkter, der står på skærmen, og
  serveren vælger et nummer.
- **Fotoupload tegner formularen om**, så billederne lægges ind til sidst. En
  vælger, der skiftes ud midt i et klik, åbner ikke.
- **Billeder kan lægges i `[data-testid="add-photos-input"]`** via `DataTransfer`
  — en side må ikke åbne filvælgeren, men godt fylde feltet.
- **Prisfeltet skrives med `setPris`, aldrig `setv`.** Det er et valutafelt,
  der kun tager et råt tal, mens det har fokus. Uden fokus bliver teksten
  formateret som valuta: på redigeringssiden (»149,00 kr.«) gav »120« en TOM
  pris i formularen, og Gem fejlede med »Pris skal være større end eller lig
  med 8.0«. Alle prisvagtens nedsættelser fejlede sådan. `setPris` sender
  `focusin` → værdi → `focusout`, for React lytter på dem, og `el.focus()`
  fyrer ikke, når fanen ikke har fokus. Målt 8. oktober på formularens egen
  værdi (fiberens `value`), ikke på det, feltet viser.

## Vinted: søgning og annoncens data

- **Vinteds søgning ligger på `https://api.vinted.dk/svc-catalogue/items`.**
  `/api/v2/catalog/items` svarer 404 (målt 1. oktober), og fordi runneren
  tav om en tom søgning, blev INGEN pris markedstjekket siden mindst 25.
  september: hvert udkast stod med `price_grounded = false` og modellens
  skøn. Den nye adresse tillader kald fra www.vinted.dk med cookies. Svaret
  har ikke `brand_title`, `size_title`, `status` eller `path`: mærket står i
  `item_box.first_line`, `second_line` er »størrelse · stand«, og adressen er
  `url`. Fremhævede annoncer (`content_source` med »promoted«) er betalt plads
  og kan være helt ved siden af søgningen — de sorteres fra, og der hentes 96,
  fordi op til 36 af 40 på side 1 kan være fremhævede. Søgningen logger nu sin
  statuskode, så den ikke kan tie igen.
- **Søgningen kan fejle på telefonen alene.** 8. oktober om eftermiddagen
  kom der ingen markedsrunde i fire udfyldninger (nr. 24, 25, 50, 51), mens
  formiddagens tre fik en. Den første skete med samme runner som om
  formiddagen, så det var ikke koden. Den samme søgning gav 96 annoncer fra
  Mac'en, også med telefonens brugeragent og på `/items/new`. Runneren gik
  videre til kategorien under et sekund efter udkastet, så kaldet fejlede
  med det samme. Uden cookies svarer søgningen
  403, og Vinted kører DataDome (cookien `datadome`), så en afvist eller
  udløbet session var det første gæt — men søgeadressen åbnet direkte i
  Safari på telefonen gav søgeresultatet, ingen robottest. Samtidig nåede
  INGEN spor fra opret-siden frem, mens kategorivalgene og »clear« gjorde;
  derfor sendes udfyldningens hele log nu med »clear«. **Årsagen var en
  gammel runner** — se »Et gammelt brugerscript …« under »Telefonen og
  serveren«. Derfor går
  hver fejlet søgning til serverens log (spor »søgning »…« forsøg N: …«),
  der prøves én gang til efter 2,5 s, og slutbeskeden siger »Prisen er IKKE
  tjekket mod markedet« med grunden. **Omgå aldrig botbeskyttelsen.** Vinteds
  egen katalogside henter ikke længere fra `svc-catalogue/items` i browseren;
  resultaterne kommer med siden (3,7 MB), for tungt som reserve.
- **Vinted skjuler solgte varer.** Det, søgningen viser, er dét, der IKKE er
  solgt, så feltet skævvrider opad. Prisen skal derfor lægge sig under medianen
  af de sammenlignelige — spærren i `analyseMarket` håndhæver det.
- **`/api/v2/items/{id}` svarer 404 — på alle annoncer.** En 404 derfra
  siger derfor intet om annoncen. Den blev læst som »væk«, og så ville hver
  tilknyttet annonce være meldt solgt ved første tilsyn. Kun annoncesidens
  egen 404 betyder væk. Varens data læses af sidens JSON-LD (`Product` med
  `offers`; den åbne side først, da den er gratis) — resten af siden er
  React-data med `\"` overalt, hvor »title« og »amount« lige så godt kan høre
  til en oversættelse. JSON-LD har ikke størrelse eller Vinteds standtekst, og
  prisen står i sælgerens valuta (en svensk annonce: 299 SEK), så kun DKK
  bruges. Kun `SoldOut`/`OutOfStock` tæller som solgt.
- **En Vinted-vareside vejer ~2 MB.** Tekstprøver til beskrivelsen er derfor
  skåret til to og springes over på en målt forbindelse.
- **`favourite_count` er brugbar, `view_count` er altid 0.** Mange hjerter på en
  vare, der stadig ligger der, er et loft, ikke et mål.

## Vinted: at finde den nye annonce

- **Efter Upload skifter Vinted adresse UDEN at genindlæse siden (Next.js).**
  Et brugerscript kører kun ved en rigtig sideindlæsning, så det fyrer aldrig
  på annoncesiden, man lander på. Fire udkast blev 1. oktober lagt op via
  appen uden at blive tilknyttet: loggen sluttede med `clear` og intet
  bagefter. Derfor holder runneren selv øje i op til en time, efter den har
  fyldt formularen. Det samme gælder alt andet, der skal ske »på næste side« —
  vent ikke på, at scriptet starter forfra.
- **…men 8. oktober landede Upload med en RIGTIG sideindlæsning uden for
  `/items/`.** Fanens vagt døde uden at melde »formularen er væk« (den ville
  have gjort det inden for et sekund ved et adresseskift i siden), og ingen
  runner blev hentet bagefter, for brugerscriptet matchede kun `/items/*`.
  Nr. 36 og 44 blev ikke meldt; nr. 36 blev først fundet af efterløbet ved
  næste udfyldning. Derfor matcher brugerscriptet nu **hele vinted.dk**, og
  uden for `/items/` gør runneren KUN to ting: melder markøren (fanens
  `sessionStorage` overlever sideskiftet) med op til 2 min. venten på
  garderoben, og kører efterløbet. Prisvagt og synkronisering kører stadig
  kun på `/items/`. Begge veje er dækket: skifter Vinted i siden, ser vagten
  det; indlæser den en ny side, starter runneren dér.
- **Den nye annonce findes i garderoben, ikke på en adresse.** At Vinted
  sender en videre til annoncens side efter Upload, var et gæt, og det holdt
  aldrig: ingen af nr. 5-20 blev tilknyttet ad den vej, og Safari bliver
  stående efter Upload. Lige efter udfyldningen noterer runneren det nyeste
  nummer i garderoben (`/api/v2/wardrobe/{bruger}/items?per_page=5&order=newest_first`,
  Vinted-kladder `is_draft` tæller ikke), og dukker der et nyere op, er det den
  nye annonce. Brugeren er `VINTED_BRUGER` i `index.ts` og følger med udkastet
  som `vintedBruger`. Fem rækker vejer ~60 kB, så der kigges kun tæt, når
  formularen (`#title`) er væk — hvert 3. sekund i to minutter, siden hvert
  halve minut — og ellers én gang i minuttet. Står fanen på `/items/{id}`,
  bruges det nummer også; serveren afviser det, hvis det ikke er det nye.
- **Fanen alene er ikke nok — derfor efterløbet (`mode:'efterloeb'`).** Nr. 22
  lå i garderoben, men fanen, der fyldte den ud, meldte intet efter Upload
  (den nye runner kørte; om iOS lagde fanen til at sove, kunne loggen ikke
  sige). Hver gang runneren kører på en Vinted-side, spørger den serveren, om
  et udkast er udfyldt (`posted_to.vinted` inden for 14 dage) uden at være
  tilknyttet. Kun da hentes garderoben (10 rækker), og serveren parrer de
  annoncer, der er nyere end den nyeste tilknyttede, med udkastene **på
  titlen** (`titelLighed`: fælles ord, mindst 0,5 og klart bedst — Vinteds
  markedsrunde kan have rettet titlen). Hellere en annonce uden udkast end en
  på det forkerte. `listed_at` sættes til udfyldningen, ikke til fundet.
  Hændelsen hedder »fundet i garderoben (efterløb)«, så det kan ses, at
  fanen ikke klarede det.
- **Markøren for »lige lagt op« hører til FANEN, ikke til Vinted.** Den lå i
  `localStorage`, som alle faner deler, og `meldPostet` tog den første
  annonceside, der viste sig. 2. oktober blev nr. 18 meldt med nr. 10's
  sandaler, fordi en fane med dem blev indlæst lige efter Upload. Serveren
  fandt sandalerne allerede tilknyttet og oprettede ingenting, og den rigtige
  annonceside fandt ingen markør. Nu ligger markøren i `sessionStorage`, og
  `mode:'posted'` afviser (`afvist`) en annonce, der hører til et andet udkast
  eller er ÆLDRE end den nyeste tilknyttede — Vinteds numre stiger. Ved en
  afvisning lægges markøren tilbage, og runneren venter videre.

## Priser

- **Vinteds pris er hele kroner — aldrig decimaler.** Prisen kan komme tre
  steder fra: markedsopslaget, kontrolrunden mod sammenlignelige annoncer, og
  udkastets egen foreløbige pris fra billedanalysen. Kun de to første var
  rundet af, og en model svarer gerne `7,5` eller `12.50`. Derfor sidder
  `vintedPris` som sidste gate i runneren, lige før feltet, hvor alle tre veje
  mødes — og i `index.ts` på de to serverveje, så appen viser det samme tal,
  som Vinted får. Afrundingen sker FØR mindsteprisen, så `7,6` bliver til `8`
  ad én vej og ikke to. En tom eller ulæselig pris får lov at stå: den skal
  falde i øjnene, ikke erstattes af et opfundet tal.
- **En pris er hele kroner overalt — ikke kun på Vinted** (bestemt af dig
  1. oktober). Prisen gemmes som tekst (`drafts.price`), og DBA, Reshopper og
  appen læste den ved at slette alt andet end cifre: »89,50 kr« blev til
  8950 kr. Vinted-vejen læste »1.200 kr« som 1,2. Nu fortolkes tallet først og
  rundes bagefter, ét sted: `_shared/pris.ts`. Står komma og punktum begge, er
  det sidste decimaltegnet; står kun det ene foran præcis tre cifre, er det
  tusinder (»1.200«), ellers decimaler (»12,50«). Analysen gemmer prisen som
  »89 kr«. Runneren (`helKroner`) og `app.js` (`prisTal`) har hver en kopi,
  fordi de ikke kan importere — **ret alle tre sammen**. Læs aldrig en pris
  med `replace(/[^0-9]/g, '')` eller `parseFloat` igen.

## Prisvagten

Delingen mellem server og telefon: se »Telefonen og serveren«.

- **En prisvagt skal kunne holde OP.** Uden den spærre ender enhver automatisk
  nedsættelse på bunden: hver runde finder en grund til at gå lidt længere ned.
  Derfor er historikken en del af grundlaget — en nedsættelse, der ikke rykkede
  hjerterne, er et argument MOD at sænke igen. `prisvagt.ts` har både en
  mindstepris, et loft over springet (18 %), en mindste afstand mellem to
  ændringer (5 dage) og en nedre grænse for, hvor lille en nedsættelse må være,
  før den bare brænder en runde af.
- **Målingen af en annonce sker mod Vinted, ikke mod appens hukommelse.** Både
  pris og hjerter læses af annoncen selv ved hvert tilsyn, og en prisændring
  kvitteres først, når den nye pris er læst TILBAGE fra annoncen. Samme lære
  som fra DBA: DOM'en lyver, kilden gør ikke.
- **En prisændring kræver et tryk.** Tilsynet måler stille, når der alligevel
  er en Vinted-side åben, men det navigerer kun til en redigeringsside, når
  adressen bærer `?udbakke=vagt` — altså når trykket kom fra appen. Et script,
  der retter priser på et rigtigt marked i forbifarten, er ikke automatik, det
  er et uheld der venter.
- **Appens flag står efter `#`, ikke `?`** (`#udbakke=vagt`, `#udbakke=synk`).
  Vinted omdirigerer `/items/{id}?…` til `/items/{id}-titel` og smider
  ?-delen væk; #-delen følger med (målt 8. oktober). Med `?` vidste runneren
  aldrig, at du havde trykket »Tjek«, og havde telefonen kørt et tilsyn inden
  for en time, skete der intet. Runneren læser begge (`flag()`). Et tryk viser
  nu et bånd, mens der måles, og et bånd, hvis tjekket ikke blev til noget.
- **Redigeringssiden spørger serveren, ikke browserens kø.** Køen i
  `localStorage` udløber efter to timer; beslutningen står i databasen, til den
  er gennemført. Uden `mode:'pending'` kunne en pris kun sættes i direkte
  forlængelse af det tilsyn, der besluttede den.

## DBA

- **DBA er Schibsteds FINN-platform, ikke DBA's egen kode.** Hele opret-formularen
  er Warp-webkomponenter, og den ligger i shadow DOM — `document.querySelector`
  finder ingenting. Opslag skal gå gennem hver shadow-rod undervejs.
- **DBA's opret-side er to sider, ikke én.** `/create-item/start` spørger først
  om annoncetype; selve formularen ligger på `/recommerce/create/{id}` og findes
  slet ikke før valget. Brugerscriptet skal derfor matche BEGGE — ellers står man
  på "Ny annonce" og venter på felter, der aldrig kommer. Valget sker ved at
  indsende formularen med `adType=recommerce`, og kun når der faktisk venter et
  udkast, så et tilfældigt besøg ikke opretter en kladde.
- **DBA's felter kan ikke peges på.** Hvert tekstfelt har id `textfield`, hver
  vælger `select_id`, og kun overskriften har et `name`. Feltet findes derfor på
  den ETIKET, der står ved siden af det — enten `label` på værten (Pris,
  Postnummer) eller som første barn i en forfader. Vejen op går både gennem
  almindelige forældre OG shadow-værter.
- **Begivenheder til DBA skal være `composed: true`.** Uden det slipper de ikke
  ud af shadow-roden, komponenten opdager aldrig ændringen, og intet bliver
  gemt — mens feltet på skærmen ser helt rigtigt ud. Målt, ikke læst.
- **DBA's comboboxer (størrelse, mærke, materiale) gemmer på `change` +
  `focusout`.** Et `input` alene sætter kun teksten på skærmen. DBA slår selv
  teksten op og gemmer sit eget nummer — "Name It" blev til `9270`.
- **DBA's comboboxer kan ikke fyldes ved at sætte en værdi.** De åbner først
  deres forslagsliste ved rigtige TASTETRYK. Et programmeret `input`
  efterlader listen lukket, og så er der intet at gemme — feltet står rigtigt
  på skærmen, mens serveren gemmer ingenting. Opskriften er: tast tegn for
  tegn (`keydown` + `InputEvent` + `keyup`, ~110 ms), vent ~1,4 s på listen,
  og vælg med **piletast ned + retur**. Et klik på forslaget virker IKKE. Det
  kostede tre prøvekørsler, hvor DOM'en så perfekt ud hver gang.
- **DBA's kategori er tre vælgere, der hænger sammen.** Underkategorien fyldes
  først, når hovedkategorien er valgt, og produktkategorien først efter den. Slå
  feltet op på ny for hvert trin.
- **DBA's kategorinumre står i deres offentlige søgning.** `sub_category=1.68.3913`
  er det samme `3913`, som kladden gemmer. Ingen af dem skal gættes.
- **DBA's billedfelt er et almindeligt `input[type=file]` i den normale DOM.**
  Samme `DataTransfer`-greb som på Vinted virker uændret.
- **Kontrollér DBA mod serveren, ikke mod DOM'en.** `GET
  /recommerce/create/api/item/{id}` viser, hvad der faktisk er gemt. Tre felter
  så udfyldte ud og var tomme på serveren.
- **DBA-grundlaget bygges i trin: mærket først, kategorien som reserve.** Er der
  færre end otte annoncer med samme mærke, siger de få priser mere om
  tilfældigheder end om markedet, og der hentes annoncer fra samme kategori
  oveni. Modellen får at VIDE, hvad den kigger på — hver annonce er mærket
  `[mærke]` eller `[kategori]`. Uden den skelnen læser den det hele som ét felt
  og trækker prisen mod kategoriens midte, også når mærket ligger klart over
  eller under den.

## Appen og dens visning

- **Ingen `object-fit: cover` på et annoncebillede nogen steder i appen.** Et
  bredt billede klippet ned i en høj kasse ser ud, som om billedbehandlingen har
  strakt det. Køkort, billedstribe og historik viser `contain` på papirfarven.
- **Vis billedet i appen præcis som filen er.** Beholderen må hverken have fast
  højde eller påtvunget format: `aspect-ratio: 3/4` sammen med `max-height`
  gjorde elementet bredere end billedet, og så lyste appens egen baggrund
  igennem i siderne. Det lignede en fejl i billedbehandlingen og var en fejl i
  CSS'en.
- **Korte klassenavne i `style.css` er allerede taget.** `.label` er appens
  versal-overskrift, og `.h` er beskæringens hjørnehåndtag (`position:
  absolute` med en hvid firkant). Begge blev genbrugt ved et uheld: hver
  etikettitel kom ud med store bogstaver, og "ændret" blev tegnet som en hvid
  firkant oven i nøgleordet. Nye dele får et præfiks — `.etiket-…`, `.ud-…`,
  `.vagt-…`, `.lbl-…`.
- **iOS' eget kamera kan ikke få et overlay.** Appen bruger
  `<input type="file" capture>`, og en webside må ikke tegne oven på
  systemkameraet. Rammeguiden står derfor på optageskærmen lige FØR trykket. Et
  rigtigt overlay ville kræve `getUserMedia` og et eget kamera — og dét koster
  billedkvalitet på iOS.

## Etiketter og løbenumre

- **Løbenummeret kommer fra en sekvens, ikke fra `max(nr)+1`.** Nummeret står
  på en etiket, der er klistret på en pakke — det skal betyde det samme om et
  år, også når udkastet er kasseret. To udkast oprettet samtidig ville med
  `max+1` få det samme nummer og dermed to pakker med samme etiket.
- **QR-koden peger på appens egen adresse (`…/#v<nr>`), ikke på et nummer.**
  Så virker iPhonens indbyggede kamera som scanner uden at der skal åbnes
  noget først. Adressen er hardkodet til produktionen: en etiket printet fra
  en Mac skal pege samme sted hen som en printet fra telefonen.
- **`qrcode-generator`s `margin` regnes i samme enhed som `cellSize`, ikke i
  moduler.** `margin: 4` med `cellSize: 4` gav én modulbredde hvid kant, hvor
  standarden beder om fire — og en kode uden ordentlig kant er den slags fejl,
  der først viser sig som en etiket, telefonen ikke vil læse. Det skal være
  `margin: cellSize * 4`. Målt på den færdige SVG, og koden er afprøvet hele
  vejen: tegnet i 25 mm ved 300 dpi og læst igen med `jsQR`.
- **Etiketarket deles op i sider i koden, ikke af browseren.** 21 pr. A4
  (3 × 7 af 63,5 × 38,1 mm, som passer i 194 × 271 mm). En grid, der selv skal
  finde sideskiftet, sætter før eller siden en række hen over kanten, og så er
  de etiketter spildt.
