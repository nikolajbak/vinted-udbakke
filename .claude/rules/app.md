---
paths:
  - "app.js"
  - "index.html"
  - "style.css"
  - "sw.js"
  - "proeve.html"
  - "sql/003-loebenummer.sql"
  - "sql/009-lager.sql"
---
# Appen: opbygning, lager, visning, konto og etiketter

Flyttet ordret fra CLAUDE.md 2026-10-22. »Dine beslutninger → X« og »Målt, ikke gættet → X« peger på afsnittet X
i en af regelfilerne (se tabellen i CLAUDE.md). Hvert målt fund kostede en fejlsøgning; lav det ikke om uden at måle igen.

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
  rav, når en annonce er over et døgn forsinket — regnet af
  `vagtTilstand`, samme som Prisvagt-skærmen — sidste tjek, og **Tjek
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
