# VintedAuto

PWA, der laver annoncer til Vinted, DBA og Reshopper ud fra billeder. Appen ligger på GitHub Pages; analysen,
udfyldningen, mails og prisvagten kører som Supabase Edge Functions.

**Hvor vi er nu: `STATUS.md`** — det, der er i gang, afprøvet eller står for tur. Læs den først. Denne fil og
`.claude/rules/` rummer det besluttede og det målte, som ikke må laves om.

## Overblik

| | |
|---|---|
| Repo | `nikolajbak/vinted-udbakke` · lokalt `~/Claude/Vinted` · direkte på `main`; hver udgivelse får et `udgivelse-NNNN`-mærke (`UDGIVELSER.md`) |
| Kører på | GitHub Pages → https://nikolajbak.github.io/vinted-udbakke/ · Supabase edge-funktioner `analyze-draft`, `vinted-fill-script`, `dba-fill-script`, `reshopper-draft`, `vinted-mail`, `push-send`, `push-subscribe` + pg_cron · Actions `Udgivelsesmaerke` |
| Data | Supabase `gjycsqshkvkcupdnvgvf` (`public`-skemaet; Storage) — projektet deles med maerkedag, foraeldreoversigt og tesla_watch |
| Stack | Vanilla JS-app (`index.html`, `app.js`, `style.css`, `sw.js`), ingen framework · funktioner i Deno/TypeScript, fælles kode i `_shared/` · runner som brugerscript/bogmærke på telefonen · tests med `node --test tools/test-*.mjs` |
| Betalte API'er | Gemini (gratis, først) · Anthropic (reserve og prisvagt) · CloudMailin (mails ind) |

## Kommandoer

```bash
./tools/udgiv.sh [funktion]           # udgiv det ændrede (eller én funktion) — aldrig `functions deploy`
./tools/tilbage.sh [mærke] [del]      # se udgivelser / rul tilbage som nyt commit
python3 tools/tjek-live.py            # kører telefonen det, git siger?
./build.sh                            # før hver commit, der rører app.js eller style.css
node --test tools/test-*.mjs          # de rene funktioners tests
sh tools/proeve.sh                    # prøve-appen på http://localhost:8765/proeve.html (se afproevning.md)
set -a; . ./.env.secrets; set +a      # nøglerne i miljøet
```

## Arkitektur

| Hvad | Hvor |
|---|---|
| App | `index.html` + `style.css` + `app.js` |
| Billedanalyse + optimering | `supabase/functions/analyze-draft/` |
| Udfyldning af Vinted-formularen | `supabase/functions/vinted-fill-script/` |
| Automatikken bogmærket/brugerscriptet kører | `…/vinted-fill-script/runner.ts` |
| Udfyldning af DBA-formularen | `supabase/functions/dba-fill-script/` |
| Vinteds mails → læst af en model og brugt: solgt, bud, besked, favorit, pris (nøgle: `MAIL_KEY`) | `supabase/functions/vinted-mail/` |
| Mailens titel parret med annoncen, når titlen er rettet på Vinted (`bedsteTitel`, `titelLighed`, `emneTitel`, rene og testet med `node --test tools/test-titellighed.mjs`) | `supabase/functions/_shared/titellighed.ts` |
| Køberbeskeder fra mail som opgave på forsiden (`SVAR`, `hentSvar`) | `app.js` |
| Forsendelsen læst af Vinteds mails (`erForsendelse`, `laesForsendelse`, `fletForsendelse`, `vaelgMaerkat`, rene og testet med `node --test tools/test-forsendelse.mjs`); mærkatet gemt i `vinted-mail` | `supabase/functions/_shared/forsendelse.ts`, `vinted-mail/index.ts` |
| Forsendelsen på varens side (`forsendelseBlok`, `hentMaerkater`, `fristTekst`, `fsHandling`) og opgaverne »Lav fragtmærkatet«/»Send pakken«; mærkatet i fuld skærm (`visMaerkat`, `hentPdfJs`), lagt ind af dig (`laegMaerkatInd`), afleveret (`fsAfleveret`), sporingen (`fsSporLink`) | `app.js`, `#fs-stor`/`#fs-fil` i `index.html`, `.fs-…` i `style.css` |
| Prisvagtens beslutning | `…/vinted-fill-script/prisvagt.ts` |
| »Tjek priserne nu«: alle annoncer, kvitteringen i appen (`tjekPriserNu`, `vagtNuKvittering`; runnerens `vagtNuMeld`; `mode:'vagtNu'` → `puls` `prisvagt-nu`) | `app.js`, `runner.ts`, `…/vinted-fill-script/index.ts` |
| Reglerne for annoncetekst + opslag af nypris/mål | `supabase/functions/_shared/beskrivelse.ts` |
| Producentens billeder af varen på en person (kun til appen): kandidaterne fra produktsidens HTML og udvælgelsen (`billedKandidater`, `udvaelg`, rene og testet med `node --test tools/test-producentbilleder.mjs`); modelkaldet `vaelgBilleder` | `supabase/functions/_shared/producentbilleder.ts`; `vaelgBilleder` i `_shared/beskrivelse.ts` |
| »Sådan ser den ud på« på varens side (`producentBlok`, `producentKoblOp`, `visProducentStor`, `POSE_NAVN`), »Tag dit eget som dette« (`aabnForlaeg`, `gemForlaegsbillede`, `POSE_TEKST`) og trinnet `paa-kroppen` i `STEPS` | `app.js`; `#pb-stor` og `#s-pbtag` i `index.html`; `.pb-…` i `style.css` |
| Ét nyt billede i et færdiganalyseret, ikke solgt udkast (`mode:'nytFoto'` med `{id, path, kind}`, kind `paa-kroppen`/`detalje`/`ekstra`): lægges sidst med `append_draft_photo` (afviser `ikke_klar`) og optimeres alene af delkaldet `analyze-draft {id, photo}` med webhook-hemmeligheden; svarer med den friske `photos`, og `ikke_optimeret`, når delkaldet ikke fik det optimeret; et fejlet delkald rører ikke prisnoten. Appen skriver aldrig selv `photos` her | `…/vinted-fill-script/index.ts` |
| Billeder lagt til og fjernet (`mode:'fjernFoto'` `{id, rod}` / `{id, fortryd:{foto, plads}}`; `mode:'erstatFoto'` til beskæringen; `mode:'fotoOp'` fra runneren); planen mod Vinted (`fotoPlan`, `fuldtSat`, `medNye`, `glemFjernede`, testet med `node --test tools/test-fotoplan.mjs`); upload på redigeringssiden (`laegFotoerOp`, `meldOp`); appens »+« og »Fjern« (`tilfoejFotos`, `fjernFoto`, `fotosTilVinted`) | `…/vinted-fill-script/index.ts`, `…/vinted-fill-script/fotoplan.ts`, `fotos.ts`, `runner.ts`; `app.js` |
| Prisen som hele kroner (`helKroner`, `prisTekst`) | `supabase/functions/_shared/pris.ts` |
| Børnestørrelser i cm (`boerneStoerrelse`, `erBoernetoej`) | `supabase/functions/_shared/stoerrelse.ts` |
| Gennemgangen af udfald → erfaringer (`mode:'laer'`) | `…/vinted-fill-script/laering.ts` |
| Erfaringerne lagt ind i prompterne (`hentErfaringer`, med tekstrettelserne `hentTekstRettelser`); rettelserne (`hentRettelser`); `noterTekstRettelse` | `supabase/functions/_shared/laering.ts` |
| Vinteds bedømmelses-popup lukkes (`vagtPopup`); plaggets mål i Vinteds felter (`fillMaal`) | `…/vinted-fill-script/runner.ts` |
| Varens fase, opgaverne på forsiden, varens side | `fase()`, `tegnOpgaver()`, `pladsRaekke()` i `app.js` |
| »Virker det?« i Mere og Opsætning (`tegnTjek`) — læser `puls` og `vinted_mails` | `app.js`; `puls` skrives af `?script=1` i begge fill-funktioner |
| Fanerne i bunden (`skiftFane`, `flytFanebar`, `RODER`) | `app.js`, `#fanebar` i `index.html` |
| Fanen »Konto« (`hentKonto`, `tegnKonto`) — omsætning, salg pr. måned, AI-udgifter; læser `listings` og `forbrug` direkte | `app.js` |
| »Hvad skal jeg købe igen?« (`mode:'indkob'`) — ubrugte varer pr. kategori og produkt | `…/vinted-fill-script/indkob.ts`; skærmen `tegnIndkob()` i `app.js` |
| Brugerscripterne (Vinted + DBA): indlæser, `.user.js`/`.meta.js`, udgave, båndet »ny udgave« | `supabase/functions/_shared/brugerscript.ts`; opsætningen `BRUGERSCRIPT` i hver fill-funktions `index.ts` |
| Hvad hvert modelkald koster (`noterForbrug`) → tabellen `forbrug` | `supabase/functions/_shared/forbrug.ts` |
| Hvert modelkald: Gemini (gratis) eller Claude pr. trin (`modelKald`, nøgle: `GEMINI_API_KEY`); oversættelsen Anthropic ↔ Gemini (`tilGemini`, `fraGemini`, ren og testet med `node --test tools/test-gemini.mjs`) | `supabase/functions/_shared/model.ts`, `_shared/gemini-oversaet.ts` |
| Billedernes rækkefølge mellem appen og Vinted (`fotoSynk`, `lavKort`, `omordn`); genkendelse på billedet (`genkend`, `aftryk`) | `…/vinted-fill-script/fotos.ts`, `…/vinted-fill-script/fotohash.ts`; krogen i Gem-kaldet `fotoKrog`/`fotoKald` og `fotoIds` i `runner.ts`; træk og slip `flytbarStribe`/`gemRaekkefoelge` i `app.js` |
| Fanelukkeren »Udbakke luk« (`/udbakke-luk.user.js`) og `lukFanen()` | `LUK_SCRIPT` i `…/vinted-fill-script/index.ts`; `lukFanen`/`fraApp` i `…/vinted-fill-script/runner.ts` |
| Betalt annoncering: fakturaen, tragten og dommen (`laesFaktura`, `tragt`, `boostDom`, `boostSalg`, `boostLinje`, rene og testet med `node --test tools/test-annoncering.mjs`) | `supabase/functions/_shared/annoncering.ts` |
| Boost-fakturaen fra mail → ordre (slags `boost`) | `vinted-mail/index.ts` |
| Fakturaens varer fundet i garderoben, Vinteds tal gemt, dommene, prisvagtens pause (`mode:'boost'`, `boostKoerer`, `boostLinjer`); runnerens `boostRunde` | `…/vinted-fill-script/boost.ts`, `runner.ts` |
| Betalt annoncering på varens side (`annBlok`, `hentAnnoncering`, `gemAnnoncering`, `annTragt`, `erBoostSalg`) og på Konto | `app.js`, `.ann-…` i `style.css` |

## Udrulning

### Udgivelse

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

**Fra en cloud-session** findes `.env.secrets` ikke, og git-forbindelsen
tager kun grene, ikke mærker (16. oktober: 403 på `udgivelse-0074`). Så
udrulles funktionen med Supabase-MCP'en fra et rent `main`, noten skrives med
`tools/udgivelse-note.py` (versionerne fra `list_edge_functions`), og commit'et
hedder »Udgivelse udgivelse-NNNN« som altid. Mærket sætter GitHub selv:
`.github/workflows/udgivelsesmaerke.yml` sætter hvert manglende mærke fra
`UDGIVELSER.md` på sit »Udgivelse …«-commit, når filen ændres på `main`.

**Fra en cloud-session sendes kilden ikke gennem MCP'en.** 17. oktober
(udgivelse-0082): i stedet for at skrive 257 kB af i hånden er indgangsfilen
én linje, `import "https://raw.githubusercontent.com/nikolajbak/vinted-udbakke/<fuld sha>/supabase/functions/<navn>/index.ts"`.
Supabase henter og bager hele træet ind ved udrulningen (også `../_shared`
og `npm:`), så det, der kører, er præcis det pushede commit. Prøv først på en
midlertidig funktion. Cloud-sessionen kan ikke selv kalde supabase.co
(proxy 403), så tjek med `net.http_get` fra databasen og læs
`net._http_response`; nøglen tages fra vault (`shortcut_key`) inde i SQL'en.
MCP'en kan ikke slette en funktion; den midlertidige slettes bagefter lokalt med
`supabase functions delete <navn> --project-ref gjycsqshkvkcupdnvgvf`.

`tilbage.sh` skriver aldrig historien om. Den henter indholdet fra mærket og
lægger det oven på som et nyt commit, så selve tilbagerulningen også kan
fortrydes.

**`_shared/` bages ind i hver funktion, der importerer den.** `udgiv.sh` og
`tilbage.sh` ved det: ændres `_shared`, udrulles alle, der bruger den.

GitHub Pages' særheder under udgivelsen: `.claude/rules/udgivelse.md`.

### Før en commit

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

**Et manglende `+` mellem to tekststykker på hver sin linje fanges af
ingenting.** JavaScript sætter selv et semikolon, så `"a, "` ⏎ `"b"` er to
gyldige sætninger, og prompten slutter bare efter »a, «. esbuild og
`node --check` tier (17. oktober, `omskriv`). Læs en ændret prompt igennem.

**Lav derfor ikke en erstatning, der spænder fra "her" til "der" i en fil, uden
at vide hvad der ligger imellem.** Erstat den tekst, der skal væk, og ikke
strækningen omkring den.

### Enkeltting uden om udgivelsen

En midlertidig funktion, en migrering:

```bash
npx --yes supabase@latest functions deploy <navn> --project-ref gjycsqshkvkcupdnvgvf
PGPASSWORD="$SUPABASE_DB_PASSWORD" /opt/homebrew/opt/libpq/bin/psql \
  "host=aws-0-eu-central-1.pooler.supabase.com port=6543 dbname=postgres user=postgres.gjycsqshkvkcupdnvgvf sslmode=require" -f fil.sql
```

Deno findes nu lokalt (`/opt/homebrew/bin/deno`, set 2026-10-22), men kørselsmiljøet afprøves stadig
sikrest med en midlertidig funktion, der slettes bagefter.

**En SQL-funktion fejler først, når den kører.** `prisvagt_puls` talte på
`pending_price` i ti dage efter, at 005 havde fjernet kolonnen. Fjernes en
kolonne, så kør de funktioner, der bruger den, i en transaktion, der rulles
tilbage: `begin; select f(); rollback;`.

## Data og hemmeligheder

- Skemaet ligger som filer: `supabase/*.sql` (det tidlige) og `sql/0NN-*.sql` (nummereret). Nye ændringer får næste
  nummer i `sql/` og en linje i `.claude/rules/database.md`.
- **Udkastet og annoncen er to forskellige ting.** `drafts` er det, vi sendte; `listings.published` er annoncens egne
  ord. Udkastet overskrives aldrig af en synkronisering (detaljer i `database.md`).
- `forbrug` læses også af `nikolajbak/drift` — omdøb ikke tabellen eller `tid`/`model`/`usd`.
- Alle nøgler: `.env.secrets` (chmod 600, gitignored). I Supabase: `GEMINI_API_KEY`, `MAIL_KEY` m.fl.; i vault:
  `shortcut_key`.

## Konventioner

- **Regler skal stå i `CLAUDE.md` eller `.claude/rules/`.** Koden, `STATUS.md` og samtalen indlæses ikke i næste chat.
  Når Nikolaj beder om en regel — for appen, teksterne, databasen eller arbejdsgangen — skrives den ind i samme omgang,
  ikke kun i koden. En ny tabel, kolonne, funktion, nøgle eller hemmelighed noteres i »Arkitektur« her eller i
  `database.md`, før arbejdet kaldes færdigt.
- Ny beslutning eller nyt målt fund → under sit emne i den regelfil, emnet hører til (tabellen herunder). Et nyt emne
  får en ny regelfil med `paths:`. Ret ikke et målt fund uden at måle igen.
- Dansk i brugerflade, navne og commits.
- **Tokenforbrugende kørsler ligger uden for Anthropics spidstid** (Nikolaj 2026-10-23): hverdage 05–11 PT ≈ 14–20 dansk tid. En planlagt kørsel, der kalder en model (routine, Actions, pg_cron → edge-funktion), startes ikke man–fre kl. 12:00–18:59 UTC (dækker både sommer- og vintertid); weekenden er fri. Brugerudløste og tidskritiske kørsler (kundebeskeder, ordrer, påmindelser på et fast klokkeslæt) er undtaget. pg_cron: `prisvagt-puls` 08 UTC og `laering-puls` man 05:30 UTC; analyse af kladder er brugerudløst.

## Mere

Regelfilerne indlæses automatisk, når du åbner de filer, der står i deres `paths:`. **Ændrer du pris-, billed-, felt-
eller mail-logik i `app.js`, eller arbejder du via SQL/Bash uden at åbne filerne, så læs regelfilen selv** — kun
`app.md` følger med `app.js`. Henvisninger som »CLAUDE.md »X«« i koden og `STATUS.md` peger på afsnittet X,
som nu oftest står i en regelfil: `grep -rn '^## X' .claude/rules`.

| Regelfil | Emner | Følger med |
|---|---|---|
| `analyse.md` | annoncetekst, producentens billeder, farve og mærker, læring af fejl | `analyze-draft/`, `_shared/beskrivelse.ts` m.fl. |
| `billeder.md` | billedbehandling: farver, rotation, beskæring, tone | `analyze-draft/` |
| `modeller.md` | Gemini først, Claude som reserve; modellernes fund | `_shared/model.ts`, `gemini-oversaet.ts`, `forbrug.ts` |
| `vinted.md` | runneren, formularen, felter, billeder i annoncen, fanelukker, telefon/server | `vinted-fill-script/`, bogmærke, genvej |
| `pris.md` | prisen, prisvagten, betalt annoncering, salgslæring, køb igen | `prisvagt.ts`, `boost.ts`, `indkob.ts`, `_shared/pris.ts` |
| `mails.md` | Vinteds mails, synkronisering, forsendelse | `vinted-mail/`, `_shared/forsendelse.ts` |
| `app.md` | appens opbygning, lager, visning, konto, etiketter | `app.js`, `index.html`, `style.css`, `sw.js` |
| `dba.md` | DBA og Reshopper | `dba-fill-script/`, `reshopper-draft/` |
| `database.md` | hver tabel og kolonne → migrationsfil | `sql/`, `supabase/*.sql` |
| `afproevning.md` | prøve-appen, udløs analysen, spor | `proeve*`, `tools/proeve*` |
| `udgivelse.md` | GitHub Pages under udgivelsen | `tools/udgiv.sh` m.fl. |
