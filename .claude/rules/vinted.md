---
paths:
  - "supabase/functions/vinted-fill-script/**"
  - "bookmarklet/**"
  - "shortcut/**"
  - "sql/016-billedraekkefoelge.sql"
  - "sql/019-tilfoej-billede.sql"
  - "sql/020-billeder-til-og-fra.sql"
  - "sql/021-billeder-lagt-op.sql"
  - "tools/test-fotoplan.mjs"
  - "tools/check-runner.mjs"
---
# Udfyldningen af Vinted (runner, formular, billeder i annoncen)

Flyttet ordret fra CLAUDE.md 2026-10-22. »Dine beslutninger → X« og »Målt, ikke gættet → X« peger på afsnittet X
i en af regelfilerne (se tabellen i CLAUDE.md). Hvert målt fund kostede en fejlsøgning; lav det ikke om uden at måle igen.

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
- **To `var` med samme navn i runneren overskriver hinanden** — den er ét
  script. Prisvagtens `TILBAGE` (siden, den gik fra) og Mac-webappens
  (fanen i appen) hed begge `TILBAGE`, så efter en godkendt pris kunne
  vinduet ende på `/items/…/menu` (fundet 21. oktober; Mac-webappens hedder
  nu `TIL_APP`). `check-runner.mjs` fanger det ikke.
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
- **En solgt annonce har ingen JSON-LD** (målt 19. oktober på nr. 7 og 17):
  »Opdatér fra Vinted« sagde »Annoncen kunne ikke læses«. Sidens data har
  pluginnet `item_status` på varens eget nummer med `is_closed: true` og
  `item_closing_action: "sold"` (aktiv: `false`/`null`); `laesAnnonceside`
  melder den da væk (solgt).
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
