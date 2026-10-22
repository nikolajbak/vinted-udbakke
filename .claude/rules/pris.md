---
paths:
  - "supabase/functions/vinted-fill-script/prisvagt.ts"
  - "supabase/functions/vinted-fill-script/boost.ts"
  - "supabase/functions/vinted-fill-script/indkob.ts"
  - "supabase/functions/_shared/pris.ts"
  - "supabase/functions/_shared/annoncering.ts"
  - "sql/001-prisvagt.sql"
  - "sql/002-prisvagt-puls.sql"
  - "sql/007-laering.sql"
  - "sql/018-prisforslag.sql"
  - "sql/023-annoncering.sql"
  - "tools/test-annoncering.mjs"
---
# Pris, prisvagt, betalt annoncering og salg

Flyttet ordret fra CLAUDE.md 2026-10-22. »Dine beslutninger → X« og »Målt, ikke gættet → X« peger på afsnittet X
i en af regelfilerne (se tabellen i CLAUDE.md). Hvert målt fund kostede en fejlsøgning; lav det ikke om uden at måle igen.

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
baggrunden**, og når du trykker »Tjek priserne nu«.

- **I baggrunden**: hver gang en Vinted-side er åben i Safari, tjekker
  runneren højst tre forfaldne annoncer, højst én gang i timen (som før).
  Appen selv kan ikke nå Vinted — det er en anden side, og Vinted blokerer
  servere. Prøv det ikke.
- **Intet dagligt tjek via Genveje** (bestemt af dig 21. oktober; bygget
  18. oktober): en automation i iPhonens Genveje, der åbnede
  `vinted.dk/#udbakke=vagt` hver dag, er fjernet — det er ikke holdbart,
  at telefonen skal være fremme og låst op, for at den kan køre. Trinnet
  »Dagligt pristjek« i Opsætning, »Slå dagligt tjek til« og
  `puls` `prisvagt-dagligt` er væk, og runneren reagerer ikke længere på
  flaget `vagt`. Byg det ikke igen uden en vej, der ikke kræver telefonen.
- **Manuelt: »Tjek priserne nu«** (bestemt af dig 18. oktober) på
  prisvagtens kort i Mere og i statuskortet på Prisvagt-skærmen. Appen kan ikke selv nå Vinted, så
  knappen åbner `https://www.vinted.dk/#udbakke=vagt-nu` i Safari
  (`VAGT_NU_URL`). `mode:'due'` med `nu` tager **alle** aktive annoncer
  (bestemt af dig 21. oktober; før de 15), de længst utjekkede først,
  **forfaldne eller ej**, uden timegrænsen, og sætter en godkendt ændring.
  Nedsættelser
  bliver forslag til godkendelse som altid. `prisvagt.ts`' spærrer (5 dage
  mellem ændringer, loft over springet) gælder stadig.
  - **Skærmen holdes tændt, til tjekket er færdigt** (bestemt af dig
    21. oktober): `vaagen(3)` fornys for hver annonce, og båndet siger »… — 12 af 46. Lad skærmen være tændt …«.
    Tilsynet sendes i portioner på 5 (`mode:'watch'`), så ét kald ikke
    løber over serverens tid.
  - **Fanen lukkes, og appen bekræfter** (bestemt af dig 21. oktober):
    `mode:'due'` med `nu` skriver `puls` `prisvagt-nu` »i gang: …«, og
    runneren melder til sidst `mode:'vagtNu'` → »færdig: N annoncer tjekket
    — …« (eller »fejl: …«), før `lukFanen`. Appen husker trykket
    (`localStorage` `udbakke-vagtnu`, `tjekPriserNu`) og viser, når den ses
    igen, »Pristjekket er færdigt: …« / »kører stadig« (`vagtNuKvittering`,
    ved `visibilitychange` og ved opstart). På Mac'en sender `lukFanen`
    vinduet tilbage til appen; på iPhonen lukkes Safari-fanen, og du åbner
    selv appen (iOS kan ikke åbne en hjemmeskærms-webapp, se »Fanen lukker
    sig selv«).
  - Sættes en godkendt pris efter tjekket (`selvTil`), kommer fanen tilbage
    med flaget; `VAGT_SLUT` i `sessionStorage` gør, at der så ikke måles
    forfra, men afsluttes.
- **Prisvagt-skærmen** (`tegnVagt`): et statuskort øverst (»Holder øje med N
  annoncer«, sidste tjek, og — er annoncer over et døgn forsinkede — rav
  med »Tjek priserne nu« som primær knap). Så tre grupper med overskrift
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
