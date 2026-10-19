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
MCP'en kan ikke slette en funktion — `vinted-fill-proeve` står som en tom
stub (410) og kan slettes i Supabase.

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

**Se GitHubs status, før der skubbes på igen.** 19. oktober (udgivelse-0141) fejlede ét byg efter et andet, og bygget stod derefter i kø i over 20 minutter: GitHub meldte »Degraded availability for GitHub Actions, GitHub Pages and Webhooks« (`curl -s https://www.githubstatus.com/api/v2/summary.json`). Et `POST …/pages/builds` hvert andet minut afbrød bare det forrige (»cancelled«); bygget i kø kommer af sig selv, når GitHub er oppe igen.

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

**Et manglende `+` mellem to tekststykker på hver sin linje fanges af
ingenting.** JavaScript sætter selv et semikolon, så `"a, "` ⏎ `"b"` er to
gyldige sætninger, og prompten slutter bare efter »a, «. esbuild og
`node --check` tier (17. oktober, `omskriv`). Læs en ændret prompt igennem.

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

**Appen indlogget i browserruden uden adgangskoden: `sh tools/proeve.sh`**
og så `http://localhost:8765/proeve.html` (preview »app«). Den henter
rigtige rækker (kun læst) og svarer selv på alle kald til Supabase, så
intet sendes og intet gemmes. »Køb igen« får et fast eksempel
(`INDKOB` i `tools/proeve-mock.js`) — serverens svar kalder en model.
Mock'en kan fejle (`window.__proeveFejl`), være langsom
(`window.__proeveVent`, eller `localStorage` `proeveVent` til en
genindlæsning), og en PATCH lægges i dens hukommelse, så en genhentning
ser den. Mock'en giver kun de felter i en indlejret `listings(…)`, appen beder om (19. oktober: før gav den alle, og at `draft_id` manglede i `ANNONCE_FELTER`, skjulte den — løbenummeret på mærkatet virkede kun i prøve-appen). Et felt, appen læser på en annonce, skal stå i `ANNONCE_FELTER`. `window.__proeveData` er mock'ens data — læg fx en
køberbesked i `koeber_beskeder` og send `visibilitychange`, så henter
appen igen. Appens service worker serverer gammel CSS på
localhost: afregistrér den i ruden, hvis en ændring ikke slår igennem.

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
| Forsendelsen læst af Vinteds mails (`erForsendelse`, `laesForsendelse`, `fletForsendelse`, `vaelgMaerkat`, rene og testet med `node --test tools/test-forsendelse.mjs`); mærkatet gemt i `vinted-mail` | `supabase/functions/_shared/forsendelse.ts`, `vinted-mail/index.ts` |
| Forsendelsen på varens side (`forsendelseBlok`, `hentMaerkater`, `fristTekst`, `fsHandling`) og opgaverne »Lav fragtmærkatet«/»Send pakken«; mærkatet i fuld skærm (`visMaerkat`, `hentPdfJs`), lagt ind af dig (`laegMaerkatInd`), afleveret (`fsAfleveret`), sporingen (`fsSporLink`) | `app.js`, `#fs-stor`/`#fs-fil` i `index.html`, `.fs-…` i `style.css` |
| Prisvagtens beslutning | `…/vinted-fill-script/prisvagt.ts` |
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
| Opslåede fakta om varen: `drafts.fakta` (ny, nypris, mål, fejl, mærkernes tekst `maerker`, farvenavnet `maerkeFarve`, køn sat af dig `koen`, varens produktside `produktside`/`produktNavn`/`produktTekst`/`produktMaerke`, opslagets tidspunkt `opslaaet`, producentens billeder af varen på en person `producentBilleder` (`[{url, pose}]`, kun links, kun til appen — aldrig i en annonce), butikkens ord om pasformen `pasform`) | `sql/006-fakta.sql` |
| Læring: `listings.sold_price`, `koeber_beskeder`, `laerdomme`, ugentligt `laering-puls` (vault: `shortcut_key`) | `sql/007-laering.sql` |
| Vinteds mails, gemt og tolket: `vinted_mails` | `sql/008-vinted-mails.sql` |
| Taget ned efter salg andetsteds: `drafts.taget_ned`; automatikkens sidste hentning: `puls` (rækkerne `vinted-runner`, `dba-runner`, `prisvagt` = sidste forespørgsel på forfaldne, `prisvagt-dagligt` = sidste daglige tjek) | `sql/009-lager.sql` |
| Brugerscripternes versionsnumre: `brugerscripter`, `brugerscript_udgave(navn, hash)` | `sql/010-brugerscripter.sql` |
| Runnerens spor, gemt (30 dage): `spor` (tid, draft_id, sti, tekst); hele udfyldningens log kommer med »clear« som `sti = 'udfyldning (log)'` | `sql/011-spor.sql` |
| Hvad hvert modelkald koster: `forbrug` (trin, model, tokens, søgninger, `usd`) og visningerne `forbrug_pr_vare`, `forbrug_pr_trin` | `sql/013-forbrug.sql` |
| Mailens læsning: `vinted_mails.laesning`; køberbeskeder fra mail: `koeber_beskeder.kilde`, `samtale`, `besvaret_at`, `vinted_mail_id` | `sql/014-mails-analyseres.sql` |
| Din tekst skal stå: `drafts.tekst_rettet`; tekstrettelser i `rettelser` (felt `title`/`beskrivelse`) | `sql/015-tekstrettelser.sql` |
| Billedernes rækkefølge: `drafts.fotos_sendt` (de billeder, der kom med op, pr. plads), `listings.fotos` (Vinteds billed-id'er parret med appens, `[{id, rod}]`) og `listings.published.fotos`; `pending.fotos` er en ventende rækkefølge | `sql/016-billedraekkefoelge.sql` |
| Appen må læse `forbrug` (til »Konto«) | `sql/017-forbrug-laeses.sql` |
| Prisvagtens forslag til godkendelse: `listings.forslag` | `sql/018-prisforslag.sql` |
| Ét billede lagt sidst i et klar-udkast i én sætning, kun når varen er færdiganalyseret og ikke sendt (`append_draft_photo`, kun service-nøglen) | `sql/019-tilfoej-billede.sql` |
| Billeder lagt til og fjernet: `append_draft_photo` løsnet til færdiganalyseret (`ny`/`afsendt`), ikke solgt og under 20 billeder; `remove_draft_photo` (på roden, aldrig det sidste), `restore_draft_photo` (Fortryd), `set_draft_photo_paa_sti` (optimeringen skriver på stien, ikke pladsen) | `sql/020-billeder-til-og-fra.sql` |
| Runnerens uploads gemt før Gem: `listings.fotos_op` (`[{rod, id}]`); `replace_draft_photo` (beskæringen); låsen i `set_draft_photo_paa_sti`; Fortryd ikke i en solgt vare | `sql/021-billeder-lagt-op.sql` |
| Hvilken model hvert trin bruger: `modelvalg` (`claude`/`skygge`/`gemini`, opslag trin → delen før kolon → `*`); hvert Gemini-forsøg og skyggens to svar: `modelkald` (30 dage) | `sql/022-gemini.sql` |
| Betalt annoncering: `annoncering_ordrer` (én faktura, `vinted_mail_id` unik), `annoncering` (én vares del; `kilde` `mail`/`dig`, `tal` og `dom` fra Vinted, unik på ordre+annonce), `annoncering_maal` (Vinteds tal, én pr. dag) | `sql/023-annoncering.sql` |
| Forsendelsen af en solgt vare: `listings.forsendelse` (status, transportør, sporingskode, fragtkode, frist, pakke, transaktion, samtale, levering, `maerkat`, hændelser); den private Storage-mappe `maerkater` (kun logget ind læser, kun service-nøglen skriver) | `sql/024-forsendelse.sql` |
| Mærkatet lagt ind fra appen: logget ind må lægge filer i `maerkater` | `sql/025-maerkat-fra-appen.sql` |
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
  selv skriver i appen, røres ikke. Samme funktion fjerner »str. ukendt«
  (16. oktober: tre jakker).
- **Opslaget ser op til otte billeder**: nr. 56's hængemærke lå på billede
  7, og mærkelæsningen afskrev det forskelligt hver gang (»SYTRA R20«,
  »SHYKA R09« for »SITKA«).
- **Sælges flere ting samlet, nævnes hver del** i titel og tekst (bestemt
  af dig 8. oktober). Nr. 47 var en sweatkjole og et par leggings på samme
  billede; kun »trøjen« blev beskrevet. Analysen registrerer hver del
  (`dele`, gemt i `fakta.dele`).
- **Børneartikler skrives til forælderen, der køber til sit barn** (bestemt
  af dig 9. oktober): holdbart til leg, nemt at vaske, nemt af og på, plads
  at vokse i — kun det, billeder og fakta bærer. Tal om barnet (»klar til
  børnehaven«), ikke om »dig«, og ingen voksenmode-ord.
- **Børnetøj får en børnestørrelse i cm — aldrig S/M/L** (bestemt af dig
  9. oktober). Nr. 48, et Nike-drengesæt med »L 147-158 cm« på mærket, kom
  på Vinted som »L«; nr. 15 stod med alderen »14«. Prompten alene holder
  ikke, så `boerneStoerrelse()` i `_shared/stoerrelse.ts` regner om efter
  modellen i analysen (`tilBoern`, og igen når kategorien er »Børn«) og i
  Vinted-udfyldningen (også gamle udkast): et cm-interval → den øverste
  ende (147-158 → 158), en alder → cm (2 år = 92, +6 cm pr. år; 14 → 164),
  måneder → babystørrelsen. »str. L« i titlen rettes med. Et bogstav uden
  cm eller alder ved siden af røres ikke — et børne-L er ikke det samme hos
  alle mærker. Børnesko har skonumre og røres ikke.
- **Står materialet på vaskemærket, skrives det præcis sådan** (»95% bomuld,
  5% elastan«), og Vinteds materialefelt får det, der er mest af.
- **Pasformen fra butikken** (19. oktober): opslaget læser, hvad
  produktsiden skriver om pasform og modellens højde/størrelse
  (`fakta.pasform`), og `faktaTekst` giver det til alle fire tekstskrivere —
  uden at nævne butikken eller et billede, og kun som størrelsesråd —
  modellens højde og størrelse gengives ikke (annoncen viser ingen model).
- Spørgsmål fra købere besvares med samme tone (køber-assistenten,
  `mode:'negotiate'`). **Afsendelsen sker stadig først ved dit tryk** — en bot,
  der svarer helt selv, kan få Vinted-kontoen lukket. Skal det ændres, er det
  din beslutning, og hånden (scriptet i samtalen) er ikke bygget endnu.

## Producentens billeder

Bestemt af dig 19. oktober: **producentens billeder af varen på en person
bruges kun i appen, som forlæg — aldrig i en annonce.** Ønsket var at lægge
dem i annoncen med en tekst om, at de er fra producenten; men Vinted
forbyder det: »Sellers may not use photos they didn't take themselves«
(Vinted Help 1120), og gentagelse efter en advarsel kan lukke kontoen.
Produktfotos er desuden ophavsretligt beskyttet, også på DBA og Reshopper.
Spec: `docs/superpowers/specs/2026-10-19-producentbilleder-design.md`.

- **Opslaget finder dem** (se »Målt, ikke gættet → Produktsidernes
  billeder«) og gemmer højst fire links i `fakta.producentBilleder`. De
  ligger aldrig i `drafts.photos`, så ingen markedsplads kan få dem.
- **Poserne** (research 19. oktober — vist på en person sælger tøj bedre
  end fladt, hele figuren forfra fanger blikket, ansigtet er ikke
  nødvendigt): forfra-hel → trekvart → bagfra → nær, én af hver.
- **Varens side** viser dem under billederne som »Sådan ser den ud på«,
  hvert med pillen »Fra producenten · <butik>« (HTML oven på billedet, ikke
  brændt ind) og posens navn. Tryk = stort billede (`#pb-stor`, Esc eller
  tryk lukker) og gør det til forlægget. Et billede, butikken har fjernet,
  skjules; er alle væk, skjules blokken. Valget af forlæg huskes, når
  siden tegnes om (`PB_VALGT`), og billedet lukkes ved enhver navigation.
  På computerskærmen har den faste billedkolonne sin egen rul, når blokken
  er der (`.d-medier:has(.pb-blok)`, loftet 100dvh − 198 px er målt på
  headeren og bundknapperne), så blokken altid kan nås; andre varer er som
  før.
- **Optagelsen** har trinnet **»På kroppen«** efter Bagfra (valgfrit som
  alle trin): varen på, hele figuren forfra eller fra halsen og ned.
  Vælges flere billeder fra Fotos på én gang, springes trinnet over: et
  `paa-kroppen`-billede isoleres aldrig, og et fladt billede nr. 3 skal
  stadig kunne isoleres. Ét billede valgt på trinnet er dit valg.
- **»Tag dit eget som dette«** (under billederne, når varen er
  færdiganalyseret — status `ny`/`afsendt` — og ikke solgt; serverens
  `nytFoto` har samme regel, løsnet 19. oktober, se »Billeder lagt til og
  fjernet«): skærmen `#s-pbtag` viser producentens billede
  som forlæg (iOS' kamera kan ikke få et overlay), posens navn og en kort
  vejledning. Appen lægger dit billede i Storage; serveren lægger det sidst
  i udkastet i én sætning (`paa-kroppen`, for nær `detalje`) og optimerer
  det alene med seriens tone og format. Appen PATCHede før hele listen ud
  fra sin egen kopi — så kunne en optimering eller et billede gå tabt.
  Går du væk midt i, lukker svaret ingen anden skærm, og »Tag dit eget«
  viser den igangværende i stedet for at starte en til.
  Teksten skrives ikke om. Fejler optimeringen, står billedet stadig i
  udkastet (»Billedet er gemt, men ikke optimeret«).

## Billeder lagt til og fjernet

Bestemt af dig 19. oktober: **billeder kan lægges til og fjernes, også i en
annonce, der allerede er ude.** Spec:
`docs/superpowers/specs/2026-10-19-billeder-til-og-fra-design.md`.

- **I appen**, på varens side, når analysen er færdig og varen ikke er
  solgt: **+** ved siden af billedstriben (kamera/Fotos, flere på én gang,
  højst 20 i alt — Vinteds loft) og **Fjern** på beskæringsskærmen (tryk på
  et lille billede). Det sidste billede kan ikke fjernes; beskeden har
  **Fortryd**, og filen bliver i Storage. Et nyt billede optimeres alene med
  seriens tone og format. Teksten skrives ikke om.
- **Appen skriver aldrig selv listen**: serveren lægger til, fjerner,
  lægger tilbage og beskærer i én sætning (`nytFoto`, `fjernFoto`,
  `erstatFoto`, sql/020-021). Mens billeder lægges til, kan der hverken
  beskæres eller fjernes, og »+« og »Tag dit eget« venter på hinanden.
- **Til Vinted** som rækkefølgen: røddernes liste i `pending.fotos`, og
  runneren gør det selv, næste gang en Vinted-side er åben i Safari. Nye
  billeder lægges i `add-photos-input` ét ad gangen, og id'et tages af
  Vinteds svar på netop det upload og meldes straks (`fotoOp` →
  `listings.fotos_op`), før Gem; fjernede id'er (`fotoFjern`) tages ud af
  Gem-kaldets `assigned_photos`. `fotos` ryddes først, når annoncen læst
  frisk har præcis listen (`fuldtSat`).
- **Det, du har gjort på Vinted, røres ikke**: et billede, du har lagt til
  dér, forbliver, og et parret billede, du har slettet dér, lægges ikke op
  igen. Billeder lagt til eller fjernet på Vinted kommer ikke tilbage til
  appen (kun rækkefølgen gør).
- **Skrives `pending.fotos`, lægges ethvert app-billede, Vinted ikke har,
  op** — også et, der aldrig kom med ved udfyldningen. Appens liste er
  facit.
- **Et billede, der ikke kan komme op**, falder ud af listen (`price_events`
  »… kunne ikke lægges op på Vinted …«): uden adresse straks, ellers efter
  to fejlede uploads. Ellers ville runneren gå til redigeringssiden igen og
  igen.
- **DBA og Reshopper**: en annonce, der allerede er ude dér, kan appen ikke
  nå — beskeden siger »Ret selv på DBA«. Listen følger med, når varen sendes
  derhen.
- **Ikke afprøvet på telefonen**: upload og Gem på Vinteds redigeringsside
  (DataDome afviser Gem fra browserruden). Se `spor` »fotos: N af N nye
  billeder lagt op« og »fotos: rækkefølgen lagt i gem-kaldet (…, N fjernet
  → N)«.

## Billedernes rækkefølge

Bestemt af dig 17. oktober: **billedernes rækkefølge kan ændres med træk og
slip i appen og synkroniseres til markedspladserne — og tilbage fra dem.**

- **I appen**: hold fingeren på et lille billede på varens side, til det
  løfter sig, og træk det (`flytbarStribe`). Et kort tryk beskærer stadig.
  Kun når analysen er færdig — under analysen skriver serveren billederne
  pr. plads. Det første billede er hovedbilledet (`image_url`).
- **Det skal kunne ses, hvad der sker** (bestemt af dig 17. oktober):
  billedet trykkes lidt ned, mens du holder, og svæver så OVER fingeren
  (under den er det skjult). Pladsen, det lander på, er en stiplet ramme,
  naboerne glider til side, hver plads har sit nummer (den første hedder
  »Forside«), og en linje under striben siger »Slip her: billede 3 af 12«.
  Ved kanten ruller striben selv. Et afbrudt træk (`touchcancel`, Esc)
  lægger billederne tilbage.
- **iPhonen kan ikke give et haptisk ryk fra appen** (ønsket af dig og
  målt 17. oktober). Safari har ikke `navigator.vibrate`, og det kendte
  greb — slå en `<input type=checkbox switch>` om fra koden — var tavst på
  din telefon i alle former: skjult, uden for skærmen, label eller kontakten
  selv, i et tryk, en timer, `touchmove` og `touchend`. Kun en kontakt, du
  selv slår om med fingeren, gav et ryk, og et træk er ikke et tryk på en
  kontakt. `ryst()` i `app.js` ryster derfor kun på Android. Prøv ikke
  igen uden en ny iOS — og mål da med en testside som `haptik.html`
  (fjernet igen, ligger i git: commit c1e01c7).
- **Ikke ude endnu**: rækkefølgen gemmes i udkastet, og Vinted og DBA får den,
  når de udfyldes (de lægger `drafts.photos` op i rækkefølge).
- **Ude på Vinted**: rækkefølgen lægges i `pending.fotos` som enhver anden
  rettelse, og runneren sætter den selv, næste gang telefonen har en
  Vinted-side åben (som prisvagtens »går selv til«). Den lægges i Vinteds
  eget Gem-kald (`assigned_photos`), ikke i gitteret, og kvitteres på
  annoncens billed-id'er, læst frisk bagefter.
- **Fra Vinted tilbage**: flytter du billederne på Vinted, flyttes udkastets
  billeder efter — set i dit eget Gem-kald på redigeringssiden, når du står
  på annoncen, og når prisvagten måler den. Rettet i Vinteds egen app kommer
  det hjem ved næste besøg på annoncen i Safari. Venter en rækkefølge fra
  appen, vinder den, til den er sat. **Det er den eneste synkronisering, der
  skriver i udkastet** — der er kun én rækkefølge, og begge sider skal vise den.
- **Billederne parres på id**: Vinteds billed-id'er stiger i upload-
  rækkefølge, så sorteret id ↔ de billeder, der faktisk kom med
  (`drafts.fotos_sendt.vinted`, sendt med »clear«). Et billede kendes på sin
  rod (`org || path`), så en beskæring er stadig samme billede. Passer
  antallet ikke (nr. 57: 11 på Vinted, 12 i appen, fra før `fotos_sendt`),
  parres intet, en ventende rækkefølge droppes med en note i historikken,
  og `spor` siger »fotos: … kan ikke parres sikkert« — medmindre
  genkendelsen herunder kan parre dem.
- **Lægger Vinted billederne op på ny, parres de på selve billedet**
  (17. oktober, `genkend` i `vinted-fill-script/fotohash.ts`). Vinteds egen
  app gør det ved Gem: nye id'er, intet at parre på. Runneren sender hvert
  billede som `{id, t}`, hvor `t` er Vinteds miniature (150×210); serveren
  henter den og appens billede i lille udgave og sammenligner et aftryk
  (16×16 felters lysstyrke, afstand = 1 − korrelationen). **Kun entydigt**:
  hvert Vinted-billede skal have ét app-billede på højst 0,15, det
  næstbedste mindst 0,15 længere væk, de to skal være hinandens bedste, og
  intet app-billede bruges to gange. Ellers parres intet. Det prøves, når
  id'erne slet ikke overlapper (før annoncen mærkes `{udskiftet}`), igen
  hver gang på en annonce, der allerede er mærket `{udskiftet}`, og når
  antallet ikke passer ved første parring. Lykkes det, skrives
  `listings.fotos` på ny, og udkastet flyttes efter Vinted;
  `price_events` »billederne genkendt på Vinted (…)«, og funktionens log
  »fotos: genkendt …« med afstandene. Afprøvet på den udgivne server
  17. oktober med nr. 55 (mærket udskiftet): 12 af 12 parret rigtigt og
  udkastet flyttet efter Vinted.
- **DBA og Reshopper**: en annonce, der allerede er ude dér, kan appen ikke
  nå (ingen `listings`-række, ingen runner på DBA's redigering). Rækkefølgen
  følger med, når varen sendes derhen.
- **Appen → Vinted er afprøvet på telefonen** (17. oktober, nr. 55):
  billede 1 og 2 byttet i appen kl. 12.34, en Vinted-side åbnet i Safari,
  og runneren gik selv til redigeringssiden, lagde rækkefølgen i Gem-kaldet
  (»12 af 12«), Vinted gemte (id'erne 342, 337, … i den nye orden), og
  kvitteringen ryddede `pending` på 9 s. Fra browserruden afviste DataDome
  samme Gem (se »Vinted: billederne i en annonce«). **Vinted → appen virker
  ikke på id'erne, når Vinted lægger billederne op på ny** (målt samme dag,
  nr. 55) — det sker, når billederne flyttes i **Vinteds egen app**. Så
  parres de på billedet (se ovenfor); kun hvis det ikke er entydigt, mærkes
  annoncen udskiftet, og flytningen fra appen virker ikke for den annonce
  (appen siger det). Se `spor`
  »fotos: rækkefølgen lagt i gem-kaldet …«, »fotos: gemt på Vinted …« og
  `price_events` »sat på Vinted: billedrækkefølge«.

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
- **Rettelser i titel og beskrivelse lærer også** (bestemt af dig
  16. oktober). I »Redigér udkast« skriver **Skriv beskrivelsen forfra ud
  fra mine rettelser** en ny, komplet beskrivelse (`mode:'omskriv'`,
  `omskriv()` i `vinted-fill-script`): din titel står urørt, det du
  tilføjede skal med, det du fjernede kommer ikke igen. Teksten gemmes
  først ved dit Gem. Knappen står nederst, lige over Gem (bestemt af dig
  17. oktober), og virker, så snart et hvilket som helst felt er rettet:
  titel, tekst, mærke, størrelse, farve, stand, materiale, længde eller
  skulderbredde. De rettede felter (`felter`, ikke gemt endnu) lægges over
  udkastet i prompten som facit, og det, mærkerne/produktsiden sagde om
  samme felt (`maerkeFarve`, `materialer`, `produktMaerke`, `ny`), tages ud.
  **Titlen skrives også forfra** (bestemt af dig 17. oktober), når et felt,
  der kan stå i den, er rettet — mærke, størrelse, farve, stand, materiale —
  og du ikke selv har rettet titlen (`titelRettet`). Har du, står den urørt.
  Er et felt rettet, kaldes den nuværende tekst »udgangspunkt«, ikke facit:
  prøvet på nr. 65 (farve Sort → Hvid) med teksten kaldt »sælgerens rettede
  beskrivelse — facit« blev »i sort« stående.
  - Læringen er kun DIN forskel: appen sender teksten, du startede fra
    (`REDIGERES_GRUNDLAG`), og efter en omskrivning er grundlaget modellens
    tekst. `noterTekstRettelse` gemmer en rettelse pr. gang: `title` (hele
    titlen fra/til) og `beskrivelse` (`fra` = fjernede sætninger, `til` =
    tilføjede, én pr. linje). Ikke via triggeren — serveren skriver også i
    beskrivelsen, og dét er ikke en rettelse.
  - `hentErfaringer([... "tekst" ...])` lægger de 20 nyeste ind
    (`hentTekstRettelser`), så alle fire tekstskrivere får dem: det fjernede
    skrives ikke igen, det tilføjede er en slags oplysning, der tages med,
    når varen bærer det.
  - **Vinteds markedsrunde skriver ikke din tekst over.** Har du gemt en
    rettet titel/beskrivelse (`drafts.tekst_rettet`), sætter runden kun
    prisen. DBA og Reshopper skriver stadig deres egen udgave ud fra den.
- **Vinteds afvisninger tæller med.** Et felt, Vinteds formular ikke kunne
  tage, sendes med »clear« (`afvist`) og lægges ind som »brug Vinteds ord«.
- **Ukendte forhindringer noteres i `spor`** (fx »popup set, ikke lukket«),
  så næste rettelse bygger på det, der faktisk skete.
- **For Claude:** hver fejlsøgning slutter med et fund i »Målt, ikke gættet«
  og hver beslutning her — i samme omgang. Læs `rettelser` og `spor` før der
  gættes på, hvorfor analysen eller udfyldningen tog fejl.

## Gemini først, Claude som reserve

Bestemt af dig 19. oktober: **flyt så mange modelkald som muligt til
Geminis gratisniveau — uden at gå på kompromis med kvaliteten.** Forbilledet
er Kalorietælleren (`~/Kaloriet-ller`, `geminiKald`).

- **Alle kald går gennem `modelKald`** (`_shared/model.ts`) med det samme
  Anthropic-kald som før; svaret kommer tilbage i Anthropics form, så
  prompter, værktøjer og læsningen af svaret er urørte. Nyt modelkald →
  `modelKald`, aldrig `fetch` til Anthropic direkte.
- **`modelvalg` styrer hvert trin** uden en udgivelse: `claude` (kun Claude),
  `skygge` (Claude bruges, Gemini kører ved siden af, og begge svar gemmes i
  `modelkald`), `gemini` (Gemini bruges, Claude ved fejl). Uden
  `GEMINI_API_KEY` er alt `claude`, som før.
- **Et trin skifter først til `gemini`, når skyggen har vist, at Gemini er
  lige så god** på rigtige varer: læs `modelkald` (`skygge = true`), sammenlign
  `gemini_svar` med `claude_svar`, og skift trinnet med
  `update modelvalg …`/`insert`. Start: `*` = `skygge`.
- **Claude tager over** ved en fejl (429, 5xx, timeout), et afskåret eller
  blokeret svar, ugyldig JSON eller et manglende påkrævet felt. Hvert
  forsøg står i `modelkald` (`ok`, `fejl`, `ms`).
- **Modellen**: nyeste Flash (ikke lite, ikke Pro) fra Geminis modelliste,
  hentet én gang i timen pr. isolat; preview tæller lidt mindre. To modeller
  på skift (søgningen én — runneren venter 90 s på hele opslaget), 429/5xx
  giver et minuts pause, 404 en time. Gemini 3 tænker `low` for et
  Haiku-kald og `medium` for Sonnet; 2.5 et budget på 1024/4096.
- **Nøglen lægges ind med `sh tools/gemini-noegle.sh`** (fra udklipsholderen → Supabase-hemmeligheden og `.env.secrets`). Claude må ikke selv håndtere nøglen.
- **Nøglen skal være uden fakturering** — ellers er det ikke gratis.
  Gratisniveauet må bruge data til at forbedre Googles modeller; det er
  varebilleder og annoncetekster. **Vinteds mails bliver hos Claude**
  (`mail` = `claude`): de bærer købernavne, og læsningen koster under
  0,01 $ om måneden.
- **Én frist for hele Gemini-delen** (`geminiMs`, standard 40 s; opslaget
  25 s, producentbillederne 9 s), så Claude altid når at svare bagefter.
  Svaret holdes op mod værktøjets skema (`skemaFejl`: type, enum, indlejrede
  felter) — Claude håndhæver selv sit skema, og et Gemini-svar med en tekst
  i stedet for en liste ville ellers vælte kaldestedet.
- `forbrug` noterer Gemini-kald til 0 $ (`PRIS` `gemini`).
- **Målt 19. oktober med nøglen:**
  - Billeder kan sendes som adresse (`file_data` med Storage-adressen) — ingen base64.
  - **Googles søgning har ingen gratiskvote** (`google_search` → 429 på alle modeller, mens almindelige kald og `url_context` svarede). Derfor er `opslag:nypris_maal` = `claude`.
  - `gemini-2.5-flash` svarer 404 (»no longer available to new users«), og `gemini-3.8-flash` gav 403 fra serveren; begge sættes på pause.
  - Gemini er langsommere end Claude: et billedkald tog 7-52 s og indkøbsanalysen 13 s. Se `ms` i `modelkald`, før et trin, som telefonen venter på (`vinted:*`, `dba:*`), skiftes til `gemini`.

## Forsendelsen

Bestemt af dig 19. oktober: **ved salg hentes fragtmærkatet og det andet,
forsendelsen kræver, ind på varen i appen.** Kun Vinted — DBA og Reshopper
sender ingen mails.

- **Kilden er Vinteds mails** (`vinted-mail`, målt på mail 7-49): salget
  (»Send denne ordre inden for 5 dage«, link til samtalen) starter
  forsendelsen som »mærkatet mangler« med fristen ca. 5 dage efter;
  »… fragtmærkat – skal anvendes inden …« (GLS) og »… Fragtkode: …« (DAO)
  giver transportør, sporingskode, DAO's fragtkode, pakkestørrelse,
  transaktions-id og den rigtige frist; »Ordreopdatering til …« giver på
  vej (med anslået levering), afhentes, modtaget; »Denne ordre er fuldført«
  afslutter. Status går kun frem (`RANG`). Mønstrene står i
  `_shared/forsendelse.ts` og vinder over modellen (emnet afgør — salgsmailen
  nævner også fragtmærkatet).
- **Mærkatet** (vedhæftet mailen) gemmes i den **private** mappe
  `maerkater` (`<listing>/<mail>.pdf`) — det kan bære købers navn og
  adresse, så aldrig i `photos`. Appen henter tidsbegrænsede links
  (6 t, `createSignedUrls`). En PDF vælges før et billede; billeder under
  10 kB er Vinteds logoer. **CloudMailin sender vedhæftningen med**
  (målt 19. oktober, mail 50: »mærkat gemt (pdf)«, 104 kB) — `handling`
  siger ellers »ingen fil vedhæftet (N filer: …)«. `?genlaes` har ingen
  filer. Vinteds GLS-mærkat er én A4-side med et kort øverst: »Scan koden
  for at sende pakken«, GLS, modtagerens navn, QR-koden, et nummer og
  sporingskoden.
- **Adressen, mails sendes videre til**, står i `.env.secrets`
  (`CLOUDMAILIN_ADRESSE`) — ikke i repoet, som er offentligt.
- **Varens side**: blokken »Forsendelse« under Vinted, når varen er solgt:
  status, frist (rav, rød det sidste døgn), hvordan (»GLS · Under 1000 g —
  vis mærkatet i pakkeshoppen« / »sig fragtkoden …«), fragtkode og
  sporingskode med Kopiér, **Vis mærkat**, **Lav mærkatet i samtalen** /
  **Åbn samtalen** og forløbet.
- **Opgaver → Haster**: »Lav fragtmærkatet« og »Send pakken inden …«
  (rød under et døgn til fristen, ellers rav), til en mail siger, at
  pakken er på vej. Ingen push — Vinted har selv sendt mailen.
- **Al administration af forsendelsen kan ske i appen** (bestemt af dig
  19. oktober: »QR-koder og andet relevant … så alt administration kan
  laves i appen«). Mærkat-mailen har INGEN QR-kode i teksten eller
  linkene (målt på mail 10, 41, 48 — kun hjælp/vilkår/privatliv); koden
  står i det vedhæftede mærkat. Derfor:
  - **Vis mærkat** åbner mærkatet i fuld skærm inde i appen (`visMaerkat`,
    `#fs-stor`) på hvid bund, også i mørkt tema, så personalet scanner
    QR-koden af telefonen. En PDF tegnes af pdf.js 3.11.174 fra cdnjs
    (hentet først ved tryk, op til tre sider), et billede vises som det er.
    Appen kan ikke zoomes, så et tryk på mærkatet gør det 2,5 × større.
    **QR-koden står stort øverst i fuld opløsning** (bestemt af dig
    19. oktober; `fremhaevKode`, `moduler`, jsQR 1.4.0 fra jsdelivr): på
    det rigtige mærkat var den ellers ~70 px bred på telefonen. Siden
    tegnes mindst 2400 px bred (~8 px pr. modul), koden aflæses **modul
    for modul** og tegnes som vektor-SVG (`crispEdges`, 4 modulers kant) —
    præcis samme kode, skarp i enhver størrelse. Den tegnede kode læses
    igen (`svgLaest`) og skal give **de samme bytes**; ellers vises
    udsnittet af mærkatet. **Kod den ikke forfra**: GLS-koden er version
    11 med UTF-8 og ECI (modtagerens adresse med æøå, målt på mail 50), og
    qrcode-generator kan ikke skrive ECI. Over koden står løbenummeret
    stort (som på etiketten på pakken), varens titel og pakkestørrelsen, under den **Forsendelsesnummer**
    (sporingskoden) stort. Pakkenummeret under GLS' kode er en del af
    billedet i PDF'en, ikke tekst, og kan ikke læses. Den hvide rest af
    A4-siden skæres fra (`udenHvidt`). Findes koden ikke, vises mærkatet
    bare. Prøvet med mail 50's mærkat: vektorkoden læst i 1200 px gav samme
    bytes som PDF'en. pdf.js tegner ikke, mens browserruden er skjult — tag et
    skærmbillede, før der ledes efter en fejl.
    Lukkes kun med Luk og ved navigation. Uden fil, men med DAO's
    fragtkode: **Vis fragtkoden** stort. Prøvet med et PDF-mærkat med
    QR-kode i prøve-appen: koden læst af `jsQR` fra det tegnede.
  - **Læg mærkatet ind** (`laegMaerkatInd`, `#fs-fil`): PDF'en fra mailen
    eller et skærmbillede af QR-koden, når mærkatet ikke kom med mailen.
    Lægges i `maerkater/<listing>/dig-<tid>.<ext>` (sql/025), og appen
    skriver selv `listings.forsendelse` (`gemForsendelse`, med en hændelse);
    »mangler« bliver »klar«. **Skift mærkatet** lægger et nyt ind.
  - **Send mailen videre**: en mail, du selv videresender (»Fwd:«/»VS:«,
    også med »>«-citat), læses som Vinteds egen (`VIDERE` i
    `_shared/forsendelse.ts`, testet) — så får et gammelt mærkat sin fil,
    hvis tjenesten tager vedhæftningen med.
  - **Afleveret** (`fsAfleveret`) sætter status »på vej« med hændelsen
    »Afleveret i pakkeshoppen (markeret af dig)«, og opgaven forsvinder.
    Vinteds mail bagefter ændrer intet (samme rang).
  - **Følg pakken** (`fsSporLink`): GLS
    `https://gls-group.com/DK/da/find-pakke?match=<kode>`, DAO
    `https://dao.as/find-din-pakke/#q=<kode>` (målt 19. oktober: begge
    svarer 200; DAO's `?stregkode=` sender selv videre til `#q=`). Andre
    transportører: kun i samtalen.

## Betalt annoncering

Bestemt af dig 19. oktober: **betalt boost og anden betalt annoncering
registreres pr. vare og markedsplads og tælles med i statistikkerne, så de
forbliver retvisende** — og Vinteds performancetal, som boostet åbner op
for, bruges. Spec: `docs/superpowers/specs/2026-10-19-betalt-annoncering-design.md`.
Første gang: nr. 55 og 7, boostet 19. oktober i 3 dage for 25,38 kr.

- **Vinted fylder selv ud.** Fakturaen (»Boost af din artikel - din
  faktura«) bliver en ordre uden varer (`laesFaktura`, ingen push). Runneren
  (`boostRunde`, højst én gang i timen pr. fane) henter garderoben, når en
  ordre mangler varer, og melder dem med `promoted: true`; serveren deler
  beløbet ligeligt (12,69 kr hver). Et boost, mailen ikke fangede, og alt på
  DBA/Reshopper registreres på varens side under **Betalt annoncering**
  (`kilde = 'dig'`, kan slettes).
- **Et boost-salg** er solgt under boostet eller op til 7 dage efter `slut`
  (`boostSalg`; appens kopi `erBoostSalg` — ret dem sammen).
- **Konto**: »Annoncering (N varer)«, »Boost: N boostede · M solgt
  under/efter« (kr pr. salg) og »Tilbage efter AI og annoncering«; salget
  mærkes »boostet«. Tid til salg og de andre tal tæller alle salg.
- **Læringen tæller boost-salg med, men mærket** (dit valg 19. oktober):
  gennemgangen af salgene får boost-linjen og at et boostet salg ikke
  beviser, at pris/tekst virkede. **Køb igen**: »sælger let« kræver hurtige
  salg, der ikke alle var boost-salg; boostede varer tæller ikke i hjerter
  pr. dag; udfaldet siger »(boostet)«.
- **Prisvagten holder pause, mens et boost kører** (ingen tilsyn, ingen
  forslag — heller ikke »Tjek priserne nu«); `next_check_at` flyttes til
  `slut` + 1 dag. Bagefter får den boost-linjen med tragten og besked om,
  at hjerterne fra boostet er pustet op.
- **Tallene bruges**: varens side viser »2.397 vist → 54 klik (2,3 %) → 6 ♥
  (11,1 %) → 0 beskeder« og én dom (`boostDom`, regnet af serveren og gemt
  i `annoncering.dom`): solgt → betalte sig; få klik pr. visning →
  forsidebillede/titel/pris i feedet; klik men få hjerter → varens side
  eller prisen; mindst 5 hjerter og intet salg efter boostet → prisen.
  Grænsen er 0,7 × medianen af dine andre boostede varer, når der er
  mindst 5; ellers fast 1,5 % klik og 5 % hjerter (og dommen siger »skøn«).
- **Ikke bygget**: »Fokus på garderobe« (bygges, når en rigtig faktura er
  set — indtil da går den til »ny slags mail«), køb af boost fra appen.

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
- **Varen slås altid op på nettet, og produktsiden er fundamentet for
  annoncen** (bestemt af dig 16. oktober). Nr. 54, en helt ny Teeshoppen
  »Hooded Let Puffer Jakke« til 1.000 kr, kom på Vinted til 70 kr: analysen
  kaldte den »vendbar dunjakke«, opslaget fandt kun kollektionssider, kunne
  ikke åbne dem, og afviste jakken, fordi »vendbar« ikke stod på siden.
  Uden en nypris var der intet gulv, og den brugte median (75 kr) bestemte.
  Nu (`slaaOp` i `_shared/beskrivelse.ts`):
  - Opslaget kører for hver vare med mærke eller mærketekst, ny eller brugt,
    — **aldrig uden mærke eller mærketekst**: prøvet med billederne alene
    16. oktober parrede Haiku fire mærkeløse jakker med tilfældige
    Teeshoppen-varer (nr. 57, en gråbrun softshell, blev »sort puffer
    jakke«) — og ser **op til otte billeder** (ikke valgt efter trinnet;
    nr. 55's »mærke« var jakken bagfra), så det sammenligner med
    produktsiden i stedet for at stole på analysens ord. Mærkets afskrift
    kan være læst forkert (»TEE-20« for »TEE320«), og samme model i en
    anden farve tæller.
  - Det har `web_fetch` (`web_fetch_20250910`, ingen beta-header) ved
    siden af søgningen og åbner butikkens sider. Højst 3 søgninger, 3 sider
    og `max_content_tokens: 5000` — med 12000 kostede ét opslag 261.000
    input-tokens (~0,80 $).
  - **Opslaget kører på Haiku 5.5, ikke Sonnet 5.** Målt 16. oktober på
    nr. 54: Sonnet brugte 64 s og 0,98 $ (414.000 tokens over to runder),
    Haiku 23-25 s og 0,03-0,05 $, med det rigtige fund. Nr. 53 (Nike, brugt)
    fandt Nikes danske side med materiale og stylenummer.
  - **Prisen læses af produktsidens JSON-LD, ikke af modellen**
    (`prisPaaSiden`): kun `Product`→`offers` i DKK. Haiku skrev 999 kr for
    teeshoppen.com, der stod i EUR (133,95 €). Prompten beder om mærkets
    DANSKE webshop (.dk). Svarer siden ikke, bruges modellens tal.
  - Fundet gemmes i `fakta.produktside`/`produktNavn`/`produktTekst`, og
    `faktaTekst` siger, at produktsiden er fundamentet: butikkens navn for
    varen og dens egenskaber går forud for billedanalysen. Adressen skrives
    ikke i annoncen. Appen viser »Produkt … fra teeshoppen.dk«.
  - `fakta.opslaaet` er tidspunktet for opslaget. Mangler det (udkast fra
    før), eller mangler en ny vare sin nypris, slås varen op igen i
    Vinteds markedsrunde.
  - **Mærket og hængemærket læses af mærkerne** (16. oktober, nr. 56: et
    Roly-hængemærke, kaldt »TeeShoppen« i stand »God«). `laesMaerker` giver
    `maerke` (trykt navn) og `haengemaerke`; et hængemærke gør standen til
    »ny med mærke«, og et trykt mærke på mindst tre tegn erstatter
    analysens, når de ikke ligner hinanden. Produktsidens JSON-LD-mærke
    (`fakta.produktMaerke`) vinder til sidst — butikken kan være forhandler.
  - **En ny vare uden fundet nypris sættes ikke ned af markedsrunden**: den
    beholder analysens pris (`holdt` i `analyseMarket`).

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
  de tre tal-felter. »Markér som postet«, »Flyt tilbage til køen« og skærmen
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
- **Det, der venter på dig, står under fanen Opgaver** (19. oktober; før
  øverst på forsiden), vigtigst først: solgt på Vinted men stadig ude på
  DBA/Reshopper (rød kant) → køber skriver → analysen fejlede → en ny
  pris/rettelse, der har ventet over et døgn (`sidderFast`) → ikke
  tilknyttet (over en time efter udfyldningen) (rav) → prisforslag →
  salgspris mangler (stille). `samlOpgaver()` finder dem,
  `tegnOpgaveSkaerm()` tegner dem (se »Appens opbygning → Opgaver«); Lager
  viser kun varerne. **Intet »tjek mod markedet«** —
  prisvagten tjekker selv (se »Prisvagten → Ingen tjek-knap«).
- **Solgt ét sted = tag den ned de andre steder.** DBA og Reshopper kan ikke
  tages ned af appen, så push-beskeden om salget siger »Slet den også på DBA«,
  og opgaven står, til du trykker **Taget ned** (`drafts.taget_ned`).
- **Uden en annonce er »taget ned« det, der gør varen solgt** (17. oktober,
  nr. 45: udfyldt på Vinted, aldrig tilknyttet, solgt — og stod som »ude«
  uden en knap at trykke på). En sendt plads uden `listings`-række har
  **Solgt eller taget ned** (`taget_ned`), og `fase()` giver »solgt«, når
  hver sendt plads er taget ned.
- **Varens side har én række pr. markedsplads**, med status, hjerter, dage
  og handlinger. Mærker til at pille af er væk; »Ikke sendt alligevel« retter
  en fejlmarkering. En vare, der er ude, kan ikke kasseres — den tages ned
  (»Taget ned uden salg« sætter annoncen til `afsluttet`).
- **»Det, der udfyldes« viser kilden og det usikre**: farven »fra mærket« eller
  »skønnet ud fra billedet«, en ny vare uden nypris i rav, målenes kilde.
  Alle markedspladsernes felter kan rettes i udkastet — se »Felterne til
  markedspladserne«.
- **Salgsprisen tastes i et felt på siden**, aldrig i en `window.prompt`.
- **»Virker det?«** er underteksten på Opsætning i Mere (»Alt virker« /
  »N ting skal ses på · …« i rav, `#opsaet-tal`); hvert trin — notifikationer, hvornår automatikken til Vinted og
  DBA sidst blev hentet (`puls`), den sidste mail fra Vinted — står i
  Opsætning med sin vejledning.
- **Optagelsen kan tage flere varer i træk** (»Lav udkast · næste vare«) og
  flere billeder fra Fotos på én gang; de fordeles på trinene i rækkefølge.

## Felterne til markedspladserne

Bestemt af dig 17. oktober: **i »Redigér« kan alle markedspladsernes felter
rettes — intuitivt og let.** Vinted, DBA og Reshopper læser de samme felter
i udkastet; DBA og Reshopper oversætter selv til deres ordlyd.

- **Kategori** (Vinteds sti, `category_path`, skrevet »Kvinder › Tøj ›
  Blazere«; forslag fra dine andre varer), **mærke**, **størrelse** og
  **materiale** er tekstfelter med forslag (`<datalist>`). **Farve** (Vinteds
  29 farver med farveprik), **stand** (Vinteds fem med en kort forklaring) og
  **køn** (DBA og Reshopper: Ikke sat / Pige / Dreng / Unisex) er knapper.
  Længde og skulderbredde står side om side nederst.
- Listerne `FARVER`/`STANDE` i `app.js` er Vinteds ordlyd — ret dem sammen
  med `VINTED_COLORS`/`VINTED_CONDITIONS` i `vinted-fill-script`.
- Køn gemmes i `fakta.koen` og går forud for Reshoppers gæt på både DBA og
  Reshopper; `faktaTekst` nævner det for tekstskriverne.
- Rettes kategorien, bliver `category` dens sidste led. Rettes størrelsen,
  sættes Vinteds fane (`size_scale`): bogstaver → »S/M/L«, to cifre → »EU«,
  ellers som før. Rettes et felt, slettes Reshoppers gemte oversættelse
  (`drafts.reshopper`), så den laves forfra.
- **Felterne kan rettes, også når varen er ude** — de bruges, når varen
  sendes til en ny markedsplads. En annonce, der allerede er på Vinted,
  får dem ikke: Vinteds vælgere kan kun sættes i Vinteds egen formular, og
  skærmen siger det med et link. (Ikke bygget: at runneren sætter dem på
  redigeringssiden — Gem kan ikke afprøves fra browserruden.)
- »Skriv beskrivelsen forfra« ser også rettet kategori og køn.

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
- **På Mac'en (appen som Safari-webapp) vender vinduet tilbage til appen**
  (bestemt af dig 18. oktober). Målt samme dag:
  - `window.open` og et link-klik åbner Vinted i et nyt vindue i webappen
    selv — med Userscripts, så runneren kører — men uden forbindelse
    tilbage (`spor` »luk: … [opener: nej, historik 1]«). GM.closeTab tømte
    det kun, `window.close()` blev afvist, og det stod tomt.
  - `x-safari-https://…` virker på Mac'en og lander i rigtig Safari, hvor
    »Udbakke luk« lukker fanen (udgivelse-0108). Men en side i Safari kan
    ikke åbne webappen: `x-webkit-app-launch` er ikke registreret hos
    macOS, og appens egen adresse åbner i Safari.
  - `location.href` fra koden til Vinted sendte macOS ud til Safari
    (udgivelse-0109) — tjekket kørte, og Safari gav appens adresse
    tilbage til webappen, men Safari åbnede. Ønsket er, at alt bliver i
    appen (bestemt af dig 18. oktober).
  - Derfor går appen som webapp på Mac'en til Vinted i sit **eget vindue**
    med et klik på et link uden `target` og `&tilbage=<fane>` efter
    `#udbakke=…` (`aabnUdad`), og `lukFanen`
    sender vinduet til `…/vinted-udbakke/#fane-<fane>` (`tilbageTil`,
    `aabnFraAdresse`). Adresser uden `#udbakke=` (installationer) går
    stadig til Safari med `x-safari-`.
    **Bekræftet af dig 18. oktober (udgivelse-0110)**: tjekket blev i
    appen og vendte tilbage til Prisvagt.
  - **Webappen er ikke `display-mode: standalone`**, når »Vis
    navigationsknapper« er slået til — en betingelse på standalone ramte
    aldrig, så 0102-0107 kørte alle den gamle vej. Betingelsen er »ikke
    `browser`« (`VISNING`), og versionslinjen i Mere viser tilstanden.
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

## Appens opbygning

Bestemt af dig 17. oktober: Mere-menuen var »komplet uoverskuelig« —
status, værktøjer og lange engangsvejledninger stod i én lang side. Nu:

- **Fire faner i bunden**: Lager, Opgaver, Konto, Mere (`skiftFane`,
  `RODER`; 19. oktober — før var Prisvagt en fane). De er rødder: ingen
  tilbagepil og ingen post i historien. Der er én fanebjælke (`#fanebar`),
  og `flytFanebar` flytter den ind i den skærm, der er fremme. Opgaver har
  sit tal på fanen (`opdaterOpgaveTal`: opgaverne + prisforslagene), Mere
  sit, når noget i opsætningen er gået i stå. **Prisvagt er en underskærm**
  med tilbagepil, åbnet fra Mere; tilbage i Mere hentes prisvagtens kort
  igen (`back()` → `hentMereVagt`). `#fane-vagt` (runnerens vej tilbage på
  Mac'en) lander i Mere; runneren og `aabnFraAdresse` kender også
  `opgaver` — ret de to regex sammen.
- **Nyt produkt** er en svævende knap over listen; Scan sidder øverst til
  højre på Lager.
- **På en computerskærm (fra 960 px bred) er fanerne en sidebjælke**
  (bestemt af dig 18. oktober: »responsivt, så det også passer til en
  computerskærm«). `flytFanebar` lægger `#fanebar` i `#app` i stedet for i
  skærmen (`BRED`), så den står fast — også på varens side og i Redigér.
  Alle fire faner er 1120 px brede, så overskriften ikke hopper:
  - **Lager**: rækkerne i to spalter (se »Rækkerne i lageret«).
  - **Varens side**: billederne til venstre (stående fast), resten til
    højre (`.d-medier`/`.d-info`).
  - **Prisvagt**: statuskortet på én linje (`.vagt-status-tekst` |
    `.vagt-status-knapper`), hver gruppe et gitter af lige høje kort, og
    erfaringerne side om side.
  - **Konto**: to spalter — omsætningen og søjlerne til venstre
    (`.konto-venstre`), nøgletalsrækkerne til højre (`.konto-kv`).
  - **Opgaver**: som Lager — tal-felterne over hele bredden og rækkerne i
    to spalter (19. oktober). En høj række (en køberbesked) gør naboen lige
    så høj; indholdet står øverst (`align-content: start`), så stregerne
    flugter.
  - **Mere**: én spalte på 680 px, venstrestillet i den samme 1120 px-ramme
    — så overskriften står samme sted som på de andre faner (målt x=248 på
    alle fire, 19. oktober).
  - **Redigér**: teksten til venstre, markedspladsernes felter i et panel
    til højre; »Skriv beskrivelsen forfra« står stadig nederst over Gem.
  - **Etiketter** og **Køb igen**: gitter/to spalter. Opsætning er en
    tjekliste med vejledninger og holder 680 px; Scan holder kameraet
    inden for skærmens højde.
  - Knapperne i bunden og beskeden nederst (`.toast`) holder 680 px og
    står midt i indholdet, ikke i vinduet.
  Under 960 px er intet ændret — målt pixel for pixel mod forrige udgave
  på Mere, Prisvagt, Konto og Redigér (18. oktober). Reglerne står sidst
  i `style.css` (»Computerskaermen«).
- **Mere** (19. oktober, redesignets trin 3), ovenfra: **prisvagtens kort**
  (`hentMereVagt`: »Holder øje med N«, pillen »Kører« grøn / »Forsinket«
  rav — regnet af `vagtTilstand`, samme som Prisvagt-skærmen, og skjult,
  hvis `puls` ikke kunne hentes — sidste tjek, dagligt tjek, og **Tjek
  priserne nu**); et tryk på kortet åbner Prisvagt. Så rækker: Opsætning
  (med »Virker det?« som undertekst), Etiketter, Køb igen; Udseende
  (temaets tre knapper); Log ud i rødt. Kun én accent-knap. **Nederst står versionen**
  (bestemt af dig 18. oktober, `tegnVersion`): »udgivelse-NNNN · App
  <stempel> · <visning> · hentet kl. …«. Stemplet er `app.js?v=` i den rude, der kører;
  nummeret er den nyeste udgivelse i `UDGIVELSER.md` (udleveret af Pages)
  med samme stempel. Er en nyere app ude, siger linjen det. **Opsætning** er en tjekliste — hvert trin med
  status og vejledningen foldet ind under sig; bogmærket under »Andre
  måder«. Læg ikke vejledninger tilbage i Mere.
- **Opgaver** er bygget som Lager (bestemt af dig 19. oktober: »samme
  design og udseende som Lager«). Øverst tre tal-felter, der er fanerne:
  **Haster** (det akutte), **Prisforslag** (antal, og under det hvor meget
  de sætter ned i alt) og **Salgspris** (`OPG_FANE`). Hver gang fanen åbnes,
  vælges den første med noget i — Haster, ellers Prisforslag (også når de
  ikke kunne hentes), ellers Salgspris. Under felterne rækker som på Lager
  (`.row.lr.opg-r`): billedet, første linje er det, der skal gøres (rød:
  kan sælges to gange; rav: venter på dig), anden hvorfor, tredje
  løbenummer · varen; knapperne står under teksten (til højre klemte de den). Et
  tryk ved siden af knapperne åbner varen. En køberbesked brydes over flere
  linjer med knapperne under; varen findes på titlen (`udkastMedTitel`).
  Et prisforslag: varen, gammel pris overstreget · begrundelsen, og til
  højre prisen (godkend) med »Afvis« under; »Godkend alle« over listen.
  Hver fane har sin egen tomme tekst; er alt tomt, »Intet venter på dig«.
  Et forslag, der er sendt afsted,
  er låst, til svaret er kommet (`OPG_I_GANG`) — også hvis skærmen tegnes
  om imens. Kan forslagene ikke hentes, står opgaverne stadig, med »Prøv
  igen«. Kun det nyeste svar på hentningen tæller (`OPG_SEQ`): et
  langsomt, ældre svar lagde et forslag, der var godkendt imens, tilbage
  som trykbart (fundet ved den sidste gennemgang 19. oktober).
- **Varens side**: billeder, pris (med størrelse · farve · stand) og
  markedspladserne først. »Tekst og detaljer« (det udfyldte, beskrivelsen,
  prisnoten) er foldet ud, mens varen er klar, ellers sammen; dit valg
  huskes pr. vare (`FOLD`).
- **Farverne** (bestemt af dig 17. oktober: »pænere, mere brugervenligt og
  indbydende«): varm hvid bund (`--paper` #F6F4EF), hvide kort med en blød
  skygge, lyse streger og petrol som accent (`--accent` #0F6E72, mørkt
  #5FC4BE), med `--accent-soft` som pille om den aktive fane. Grøn = ok,
  rav = se på det, rød = galt. Hvert tekst/bund-par holder mindst 4,5:1 i
  begge temaer — mål kontrasten, før en farve rettes. Før var bunden
  grågrøn, kortene beige og accenten aubergine.
- **Redesignet 19. oktober** (spec:
  `docs/superpowers/specs/2026-10-19-redesign-faner-design.md`): hver fane
  ét formål; alt, der kræver dit tryk, står i Opgaver. Kort med skygge kun
  dér, hvor noget skal løftes frem (prisvagtens kort, tal-felterne, en
  opgave med farvet kant), ellers lister med tynde streger; højst én
  accent-knap pr. skærm; forklaringer på én linje.
- **Én skrift i hele appen: Libre Franklin** (18. oktober). Space Mono i
  versaler var overskrifternes og prisernes stemme (»UDKAST: 85,00 KR«) og
  er væk — også fra skrift-linket. Overskrifter over en gruppe (`.label`,
  feltnavne i Redigér, `.chip`) er små, halvfede og skrevet som almindelig
  tekst; tal har `tabular-nums` (`.mono` betyder nu kun det). Læg ikke
  versaler eller en mono-skrift tilbage.
- **Temaet kan vælges** (bestemt af dig 17. oktober): Mere → Udseende,
  »Som enheden« / »Lyst« / »Mørkt«. Valget gemmes kun på telefonen
  (`localStorage` `udbakke-tema`: `enhed`/`lys`/`moerk`) og sættes af
  `saetTema()` i `<head>` i `index.html`, før siden tegnes — ellers blinker
  den i det forkerte tema. Lyst/Mørkt sætter `data-theme` på `<html>` og
  begge `theme-color`, så statuslinjen følger med. Knapperne: `tegnTema` i
  `app.js`. Ret en temafarve to steder: `style.css` og `saetTema`.

## Rækkerne i lageret

Bestemt af dig 19. oktober (redesignet, trin 2; erstatter »Kortene i
listen« fra 2.-3. oktober). `raekkeTekst()` og `raekkePris()` i `app.js`.

- **Tal-felterne øverst er fanerne**: Klar · Ude · Solgt med antal og en
  sum under (`faseSum`): klar = de foreløbige priser, ude = prisen nu,
  solgt = salgsprisen (udbudsprisen, hvis den mangler — som på Konto).
  Det valgte felt er mørkt.
- **Rækker uden kasser**: en tynd streg imellem, billedet 72×96 (`contain`
  på papirfarven), rækken gennemsigtig over kornet. Kassér-knappen bag en
  Klar-række er skjult, til rækken trækkes.
- **Tre linjer til venstre**, hver forkortet med »…«:
  1. Mærke · varetype.
  2. Størrelse · farve · stand — **materialet står kun på varens side**.
  3. Løbenummeret · markedspladsernes prikker · »rettelse venter«.
- **Til højre det tal, der betyder noget**, med en linje under: Klar —
  prisen (ellers »Analyserer …«, »Kladde«, eller »ingen pris« /
  »Analysen mislykkedes« i rav); Ude — prisen nu (mangler den: »ingen
  pris« i rav), under: »♥ 4 · 3 d«;
  Solgt — salgsprisen, under: »12 d« (mangler den: »tast salgsprisen« i
  rav; uden annonce: »taget ned«). Ord i stedet for et tal står mindre
  (`.lille`), så de ikke klemmer varens tekst.
- På computerskærmen står rækkerne i to spalter.
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
  Undtagelse (bestemt af dig 18. oktober): prisvagtens daglige tjek, som
  kører i din egen Safari via Genveje (se »Prisvagten → Ingen tjek-knap«).
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
  trykket. Prisvagtens nedsættelser er forslag, til du godkender dem; det
  godkendte sættes selv, næste gang telefonen har en Vinted-side åben (se
  »Prisvagten → Kun forslag«); ligger der en i forvejen, siger
  redigeringsskærmen, at den går med ud.
- **Udkastet overskrives stadig aldrig af en synkronisering** — kun af dit eget
  Gem. Forskellen mellem udkast og annonce er det, appen viser. Eneste
  undtagelse: billedernes rækkefølge (se »Billedernes rækkefølge«).
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

- **Hver mail gemmes i `vinted_mails`**, også dem, der ikke blev forstået —
  undtagen besked/bud om en vare, der ikke er vores (se »Mails bruges til alt«).
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
  åben — `sw.js` navigerer den åbne rude. Det samme gælder en fane
  (`#fane-opgaver`, prisforslagenes push).

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
- **Kun beskeder og bud på VORES annoncer** (bestemt af dig 16. oktober).
  Vinted sender samme slags mail, når en SÆLGER skriver eller giver et
  tilbud på en vare, du selv har spurgt til (16. oktober: to parykker,
  »Ny besked vedr. …«, »… har lige tilbudt at sælge dig …«). En besked- eller
  bud-mail, der ikke kan knyttes til en annonce i `listings` (nummer i
  linket, ellers titlen), gemmes IKKE, læses ikke af modellen, giver ingen
  push og ingen `koeber_beskeder` (`KOEBERS`/`ikkeVores` i `vinted-mail`).
  `?genlaes` på sådan en sletter den og dens købersamtale. Mail 30-31 og
  deres spor (`koeber_beskeder` 6-7, `forbrug` 164-165) er slettet.

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

## Konto

Bestemt af dig 17. oktober: **en brugervenlig kontooversigt med omsætning og
andet relevant**, fanen »Konto« (`tegnKonto` i `app.js`). Regnes i appen,
hver gang skærmen åbnes; intet gemmes.

- **Omsætningen er Vinteds salg**: `listings.sold_price`, ellers
  udbudsprisen (og det siges). DBA og Reshopper har ingen `listings`-række,
  så deres salg kendes ikke — skærmen siger det, og tæller »taget ned«.
- Opbygningen (19. oktober): **Omsætning i alt** som ét stort tal, under
  det én linje med antal salg, snit og »ca. N kr brugt på AI« (og i rav,
  hvis salg mangler salgspris); søjler for seks måneder (indeværende i
  accent); så rækker med streger (`kontoRk`): Ude nu (antal · kr), Tid til
  salg, Salgspris af udbud, Denne og Sidste måned, Hjerter, AI i alt, AI
  pr. vare, Tilbage efter AI; så Flest hjerter og alle salg (med link til
  varen); noten om DBA/Reshopper er én dæmpet linje. Intet tal fra før
  er forsvundet.
- **Udgifter er kun modelkaldene** (`forbrug.usd`, regnet om med `USD_KR`
  = 6,9 og skrevet »ca.«). Indkøbsprisen kendes ikke og trækkes ikke fra.

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
- **Et billede på kroppen isoleres ikke** (`kind: 'paa-kroppen'`,
  19. oktober): en person på hvidt ligner en udklipning. Siger modellen
  `helvare`, bliver motivet `paakroppen` — samme luft (`PADDING`) og
  seriens tone. Som et nærbillede må det bøje seriens format, når det ikke
  kan rummes (hellere et andet format end hvide bjælker om en person); kun
  når heller ikke dets eget format kan rumme det (fx 9:16 af hele figuren),
  fyldes der ud.
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

## Produktsidernes billeder

Målt 19. oktober på nr. 54, 63, 65 og 66 (to gennemløb hver).

- **Varens billeder står sjældent pænt i sidens data.** JSON-LD `image` gav
  1 (Teeshoppen), 6 (Magasin) og 0 (Ganni, Mads Nørgaard); Shopifys
  `/products/<handle>.json` svarer 404 (Teeshoppen er headless). HTML'en
  blander varen med menuer, kampagner, anbefalinger og samme model i andre
  farver (Teeshoppen: sort, navy og oliven af samme jakke). Derfor vælger
  en model blandt højst 12 kandidater (`vaelgBilleder`, Haiku 5.5,
  ~0,002 $ pr. vare) — kun et nummer fra listen kan vælges.
- **Ganni og Mads Nørgaard tegner galleriet i browseren** — varens egne
  billeder står slet ikke i HTML'en, kun andre varer og kampagner. Modellen
  afviste dem alle (ingen forkerte fund). Magasin viser kun varen liggende
  (pakkeshot), så heller ingen. Resultat: nr. 54 fik forfra, trekvart og
  bagfra, ens i begge gennemløb; de tre andre korrekt ingen.
- **Shopify skalerer efter forespørgslen**: forfra-billedet kom i 360×482
  (`width=360&height=482&crop=center`); de tre fjernes, og `width=1200`
  sættes (fuld størrelse kan være en PNG på flere MB — for stor til
  Anthropic og tung på telefonen).
- **Ét billede, Anthropic ikke kan hente, vælter hele kaldet med 400 — og
  fejlen siger ikke hvilket** (»Unable to download the file«). Derfor
  henter `vaelgBilleder` ved et 400 hver kandidat selv (4 s, parallelt) og
  prøver én gang til med dem, der svarer med et billede. Målt på nr. 54:
  2,5 s uden en død adresse, 4,6 s med, og samme tre fund. Kaldet har en
  grænse på 20 s — markedsrundens runner venter 90 s på hele opslaget.
- **Billederne og pasformen hører til produktsiden**: de skrives sammen med
  `produktside` (og ryddes, når en ny side ingen har), så en tidligere
  vares billeder aldrig bliver stående.
  Samme billede i flere bredder (`_200x`, `_800x`) er ét billede, og
  `{width}`-skabeloner er ikke billeder.
- **Pasform**: modellen skrev »ingen modelhøjde angivet«, når siden intet
  sagde, og læste Teeshoppens skala (»Lille – Størrelsessvarende – Stor«,
  uden markering) som en pasform — så blev teksten »passer lidt lille«, et
  opfundet råd (rigtig analyse, 19. oktober). Prompten siger, at en skala
  uden markering ikke er en pasform, og `pasformEllerIntet`
  (`_shared/producentbilleder.ts`, testet) deler svaret i led og smider de
  led væk, der siger, hvad siden ikke siger (»ikke angivet«, »uden
  tydelig«), eller som er skalaens to ender (både »lille« og »stor«).
  »Normal pasform; modelhøjde ikke angivet« bliver til »Normal pasform«.
  Teksten må ikke nævne, hvor rådet kommer fra.

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

## Vinted: billederne i en annonce

Målt 17. oktober, logget ind i browserruden.

- **`/api/v2/item_upload/items/{id}` svarer for din EGEN annonce** (403 for
  andres og uden login) og giver `item.photos` med `id` i annoncens
  rækkefølge — ~23 kB mod annoncesidens ~1,9 MB. Det er sådan runneren læser
  rækkefølgen (`fotoIds`). `/api/v2/items/{id}` svarer stadig 404.
- **Vinteds billed-id'er stiger i den rækkefølge, de blev lagt op** — på alle
  seks nyeste annoncer. Det er grundlaget for parringen i `fotos.ts`.
- **Gem på redigeringssiden er `PUT /api/v2/item_upload/items/{id}`** med
  `{item: {…, assigned_photos: [{id, orientation}]}}` i gitterets
  rækkefølge (`updateItem` i Vinteds kode). Klienten er axios, altså
  `XMLHttpRequest` — krogen sidder på `XMLHttpRequest.prototype` (og
  `fetch` for en sikkerheds skyld). Gitteret er dnd-kit
  (`aria-roledescription="sortable"`) og flyttes ikke udefra.
- **Garderoben** (`/api/v2/wardrobe/{bruger}/items`) har også `photos` med id
  og rækkefølge, men vejer ~14 kB pr. annonce (20 = 284 kB).
- **Et nyt billede lægges op med `POST /api/v2/photos`** (FormData
  `photo[type]`, `photo[file]`, `photo[temp_uuid]`; læst i Vinteds kode
  19. oktober, `createPhoto`), og svaret har `id` øverst (`{id, url,
  temp_uuid}`). Gitteret lægger hver fil op for sig; billedet hører først
  til annoncen, når Gem sender det i `assigned_photos`. Redigeringssiden har
  samme `add-photos-input` som opret-siden.
- **Gem fra browserruden afvises af DataDome** (17. oktober): runneren lagde
  rækkefølgen i kaldet (»12 af 12«), og `PUT …/item_upload/items/{id}` fik
  403 med en captcha-side (`geo.captcha-delivery.com`). Intet blev gemt.
  Hentninger (GET) fra samme rude gik fint, og telefonen har gemt priser ad
  samme vej (16. oktober). Afprøv derfor alt, der GEMMER på Vinted, på
  telefonen, aldrig fra browserruden — og omgå aldrig captchaen.
- **Flyttes billederne på Vinted, kan Vinted lægge dem ALLE op på ny**
  (17. oktober, nr. 55): efter du flyttede to billeder tilbage og trykkede
  Gem, havde alle 12 nye id'er (…728-…828) og nye adresser, stigende i den
  NYE rækkefølge. Intet binder dem til de gamle, og runneren så ikke det
  Gem (ingen kald fra telefonen). Derfor: en annonce, hvis billed-id'er
  slet ikke overlapper med parringen, mærkes `listings.fotos =
  {udskiftet}` og parres aldrig igen på pladsen — de nye id'er ville parre
  de forkerte billeder. **Det var Vinteds egen app** (bekræftet af dig):
  den lægger alle billeder op på ny ved Gem, og runneren ser det ikke —
  den findes kun i Safari. Om et flyt på redigeringssiden i Safari beholder
  id'erne, er ikke målt.
- **Vinteds billeder har ingen CORS** (`access-control-allow-origin` mangler),
  så de kan ikke sammenlignes med appens på et canvas i siden.
- **Supabase Edge KAN hente Vinteds billeder** (17. oktober): blokeringen af
  datacenter-IP'er gælder sitet, ikke `images1.vinted.net`. Miniaturerne
  står i `photos[].thumbnails` fra `item_upload` (`thumb70x100`,
  `thumb150x210`, `thumb310x430`; adressen har en `?s=`-signatur). 150×210
  svarede 200, ~17 kB, afkodet på 6-10 ms med ImageScript.
- **Appens billeder i lille udgave: Storage's billedtransformation**
  (`/storage/v1/render/image/public/photos/<sti>?width=160&height=160&resize=contain`,
  ~6 kB mod ~490 kB, 2-3 ms at afkode). **Begge mål og `contain`**:
  `?width=150` alene gav 150×1600 — strakt, og sammenligningen faldt til
  6 af 12 rigtige.
- **Aftrykket skiller sikkert** (17. oktober, nr. 55: 12 billeder af den
  samme gule jakke, flere næsten ens): de rigtige par lå på 0,006-0,071,
  det næstbedste på mindst 0,35, og mod 32 billeder af tre andre jakker
  (nr. 54, 56, 57) var intet under 0,37. Hele genkendelsen af 12 mod 12
  tog 150-800 ms. Tærsklerne (0,15 / 0,15) står i `fotohash.ts`; ret dem
  ikke uden at måle på flere annoncer.

## Vinted: boost og dets tal

Målt 19. oktober i browserruden, logget ind.

- **Fakturaen nævner ikke varerne** (mail 44): kun »3-dags lokalt Boost (2
  Artikler)« og »I alt / 25.38 kr.« med punktum som decimaltegn; linkene er
  vilkår og privatliv.
- **Garderoben siger hvilke**: `promoted: true` og `stats_visible: true`
  (ikke boostet: `promoted: false`, `can_push_up: true`). `per_page=96`
  virker; 53 varer på én side.
- **Tallene**: `GET https://api.vinted.dk/vas/items/{id}/bumps/stats?timezone=Europe%2FCopenhagen`
  med cookies og **`Accept-Language: da-DK`**. Uden det hoved — også med
  bare `da` — svarer den 500 `internal server error`; csrf og anon-id er
  ligegyldige. 404 for en vare uden boost. Svaret `bumped_item_stats` har
  `impressions` (»medlemmer nået«), `views` (klik), `favorites`,
  `conversations`, `impression_difference` (×-forskel mod normalt),
  `chart_data` (7 dage), `humanized_hours_left`, `recently_promoted`. Nr. 7
  gik fra 36-112 visninger om dagen til 2.034 på boostdagen.
- `/vas/bumps/orders` (POST) køber et boost — røres aldrig.

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

### Kun forslag — du godkender hver ny pris

Bestemt af dig 18. oktober: **prisvagten må ikke selv ændre priser, men
laver en liste til godkendelse.** Erstatter beslutningen fra 16. oktober
(»sætter selv priserne«).

- Tilsynet (`tilsyn` i `vinted-fill-script/index.ts`) lægger en nedsættelse
  i **`listings.forslag`** (`{price, fra, note, at, median,
  sammenlignelige}`), ALDRIG i `pending`. `pending` er kun dit: rettelser
  fra appen og godkendte priser. Tilsynet rører ikke `pending`, og siger
  et nyt tilsyn »behold«, ryddes et gammelt forslag. Push: »N prisforslag
  venter på din godkendelse«; et tryk åbner Opgaver (`#fane-opgaver`,
  tredje led i `puf`).
- **Appen**: forslagene godkendes under fanen **Opgaver** (19. oktober; før
  en gruppe på Prisvagt-skærmen): tal-feltet »Prisforslag« med en række
  pr. forslag — prisen (godkend), »Afvis« — og »Godkend alle«. Prisvagt-skærmen viser kun »Foreslår X kr —
  venter på dit ja under Opgaver« (med »Venter også: …«, hvis der også
  ligger rettelser i `pending`). **Ingen opgave om forslagene på Lager**
  (bestemt af dig 18. oktober). Varens side: »Prisvagt: foreslår X kr —
  venter på din godkendelse«.
- **Godkend** (`godkendForslag`): prisen lægges i `pending` med
  `pending_note` »Godkendt af dig: …«, `forslag` ryddes, `price_events`
  `godkendt`. Så sætter runneren den selv, næste gang en Vinted-side er
  åben (`selvTil`) — dit ja er trykket.
- **Afvis** (`afvisForslag`): `forslag` ryddes, næste tjek om 7 dage,
  `price_events` `afvist`. `historikLinjer` i `prisvagt.ts` viser modellen
  afvisningen, så den ikke bare foreslår det samme igen.
- **Runneren går aldrig selv til redigeringssiden efter et tilsyn.** Den
  viser et bånd »N prisforslag venter på din godkendelse i appen«; det
  daglige tjek lukker fanen med samme besked. Den lokale kø (`VAGT_KOE`),
  der bar prisvagtens nedsættelser, bruges ikke længere og ryddes på
  redigeringssiden — kun serverens `pending` sættes.
- De 10 nedsættelser, der lå i `pending` 18. oktober kl. 10.25, er flyttet
  til `forslag` (`sql/018-prisforslag.sql`) og blev aldrig sat.

### Ingen tjek-knap — prisvagten tjekker selv

Bestemt af dig 18. oktober: banneret og knappen »Tjek N varer mod markedet«
gav ikke mening og virkede ikke ordentligt. **Priserne tjekkes i
baggrunden, og automatisk dagligt.** Det manuelle tjek er væk fra forsiden
og Prisvagt-skærmen.

- **I baggrunden**: hver gang en Vinted-side er åben i Safari, tjekker
  runneren højst tre forfaldne annoncer, højst én gang i timen (som før).
  Appen selv kan ikke nå Vinted — det er en anden side, og Vinted blokerer
  servere. Prøv det ikke.
- **Dagligt**: en personlig automation i iPhonens **Genveje** (Tidspunkt på
  dagen → Kør straks → Åbn URL'er) åbner `https://www.vinted.dk/#udbakke=vagt`.
  Flaget `vagt` betyder nu kun »dagligt tjek«: runneren tager ALLE
  forfaldne (`mode:'due'` med `alle`, op til 15), uden timegrænsen, laver
  forslag, sætter en godkendt ændring, og lukker fanen
  (»intet at tjekke i dag« / »N annoncer tjekket — N prisforslag venter …«).
  Vejledningen står i Opsætning → **Dagligt pristjek** (`DAGLIGT_URL` i
  `app.js`), og serveren skriver `puls` `prisvagt-dagligt`, så trinnet kan
  vise, hvornår det sidst kørte. Det er det eneste ur, der rører Vinted, og
  det kører i din egen Safari. **Ikke målt:** om Genveje åbner Safari, mens
  telefonen er låst — vejledningen siger at vælge et tidspunkt, hvor
  telefonen er i brug.
- **Manuelt: »Tjek priserne nu«** (bestemt af dig 18. oktober) på
  prisvagtens kort i Mere og i statuskortet på Prisvagt-skærmen. Appen kan ikke selv nå Vinted, så
  knappen åbner `https://www.vinted.dk/#udbakke=vagt-nu` i Safari
  (`VAGT_NU_URL`). Runneren kører det daglige tjek, men `mode:'due'` med
  `nu` tager de 15 længst utjekkede aktive annoncer (`last_check_at`),
  **forfaldne eller ej**, og skriver kun `puls` `prisvagt` — det tæller
  ikke som det daglige tjek. Nedsættelser bliver forslag til godkendelse
  som altid, og fanen lukkes bagefter. `prisvagt.ts`' spærrer (5 dage
  mellem ændringer, loft over springet) gælder stadig.
- **Prisvagt-skærmen** (`tegnVagt`): et statuskort øverst (»Holder øje med N
  annoncer«, sidste tjek, og — er annoncer over et døgn forsinkede uden et
  dagligt tjek — »Slå dagligt tjek til«). Så tre grupper med overskrift
  (forslagene står under Opgaver, se »Kun forslag«): **Ny pris på vej** (pris med den gamle overstreget, begrundelsen, »sættes
  af sig selv, næste gang Vinted er åben«; rav og en primær knap, når den
  har ventet over et døgn), **Holder øje** (seneste dom: »Tjekket for 2
  dage siden · 40 lignende til ca. 150,00 kr« og »Næste tjek: om 3 dage«),
  **Rører ikke prisen** (pause eller stoppet, med grunden og Genoptag/Tjek
  den igen). Mindstepris, pause og »Svar en køber« ligger bag ét fold pr.
  annonce. Titlen åbner varen.
- **Varens side** viser prisvagtens linje under Vinted (`pladsVagt`):
  ny pris på vej, eller »tjekket … · pristjek om N dage«.
- Afprøvet 18. oktober på en prøveside med de rigtige annoncer (46 aktive,
  20 forsinkede); ikke i den indloggede app eller på telefonen.

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
- **Det godkendte sætter prisvagten selv — uden et tryk mere** (bestemt af
  dig 16. oktober, indskrænket 18. oktober: tilsynets nedsættelser er kun
  forslag, se »Kun forslag«). Står der en ændring i `pending`, går runneren
  selv til redigeringssiden, gemmer, kvitterer, tager den næste og sender dig
  tilbage til siden, du stod på (`selvTil`, `mode:'ventende'`). Den rører
  aldrig opret-siden, beskeder, betaling eller indstillinger (`maaSkifteSide`),
  og en annonce, der er prøvet inden for 30 min, springes over. Det kræver
  stadig, at telefonen har en Vinted-side åben i Safari — serveren kan ikke
  selv nå Vinted (se »Telefonen og serveren«). `spor` »vagt: går selv til …«.
- **Efter Gem lander Vinted på `/member/{bruger}` med en rigtig
  sideindlæsning** (målt 16. oktober), ikke på annoncen. Kvitteringen krævede
  annoncens egen side, så tre gemte priser stod som »klar« i appen, og køen
  gik aldrig videre. Nu kvitteres på enhver side undtagen redigeringssiden,
  og runneren kører prisvagten også uden for `/items/`. Gem-knappen kan være
  slået fra et øjeblik efter, prisen er sat; der ventes op til 6 s på den.
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
- **Som hjemmeskærmsapp er `height: 100%` kortere end iPhonens skærm**
  (17. oktober): appen stod rykket op med et tomt bånd under fanerne.
  `@media (display-mode: standalone)` giver `html, body` `100lvh` — i
  standalone er der ingen værktøjslinjer, så den store viewport er hele
  skærmen. I Safari står det urørt (`lvh` ville lægge bunden under
  værktøjslinjen). Bekræftet af dig på telefonen samme dag.
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
