---
paths:
  - "supabase/functions/vinted-mail/**"
  - "supabase/functions/_shared/forsendelse.ts"
  - "sql/008-vinted-mails.sql"
  - "sql/014-mails-analyseres.sql"
  - "sql/024-forsendelse.sql"
  - "sql/025-maerkat-fra-appen.sql"
  - "tools/test-forsendelse.mjs"
---
# Vinteds mails, synkronisering og forsendelse

Flyttet ordret fra CLAUDE.md 2026-10-22. »Dine beslutninger → X« og »Målt, ikke gættet → X« peger på afsnittet X
i en af regelfilerne (se tabellen i CLAUDE.md). Hvert målt fund kostede en fejlsøgning; lav det ikke om uden at måle igen.

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
    Lukkes kun med Luk og ved navigation. **Vis mærkat står også, efter
    pakken er afleveret** (bestemt af dig 19. oktober), som en almindelig
    knap. Uden fil, men med DAO's
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

## Synkronisering af annoncerne

Bestemt af dig 1. oktober: annoncerne synkroniseres automatisk begge veje,
når der rettes i appen eller på markedspladsen. Kun Vinted — DBA og Reshopper
har ingen række i `listings` endnu.

- **Ingen runde på et ur.** Bestemt af dig 1. oktober: der må ikke tjekkes
  med et fast interval. En baggrundsrunde over alle annoncer blev bygget og
  fjernet igen samme dag. Synkroniseringen sker på hændelser. (Det
  daglige tjek via Genveje, en undtagelse fra 18. oktober, er fjernet
  igen 21. oktober — se »Prisvagten → Ingen tjek-knap«.)
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
  længste titel (mindst seks tegn), der står i mailen, og til sidst på
  titlens ord (`bedsteTitel`: mailens titel og emnet mod appens og Vinteds
  titel, Dice mindst 0,6 og den næstbedste vare mindst 0,15 under). Salgs-
  og forsendelsesmails har intet annoncenummer i linkene, og en titel rettet
  i Vinteds egen app kommer ikke til appen: 19. oktober blev nr. 7 solgt som
  »Teeshoppen Edmund lang parka …«, mens appen kendte »Teeshoppen parka
  vinterjakke …«, og fire mails stod uden annonce. Fundet på ordene skrives
  mailens titel i `published.title` (`price_events` »titlen rettet på Vinted
  (set i mail)«). Prøvet på alle 57 mails: ingen fik en anden annonce end før.
- **Solgt** → annoncen sættes til `solgt` med salgsprisen, hændelse,
  gennemgangen af salgene, og en push. Dit eget køb (»du har købt«, »dit
  køb«) er ikke et salg.
- **Bud** → push, prisen synkroniseres (»i stedet for kr.100.00«), og buddet
  gemmes i `koeber_beskeder` (`intent:'bud'`, allerede »besvaret«) til
  gennemgangen.
- **Favorit** → stille: prisen synkroniseres, og hjerterne tælles én op
  (`favourites`). Ingen push (bestemt af dig 9. oktober).
- **Et hjertetal, der ikke blev fundet, er null, aldrig 0** (21. oktober).
  Tilsynet læste `favourite_count` med ét fast feltmønster og skrev 0, når
  det ikke passede — på telefonen (logget ind som sælger) skete det ved hver
  måling siden 18. oktober, og mailenes hjerter blev nulstillet (tæppet 9 → 0,
  Vinted viste 10). `hjerterPaaSiden` finder tallet i enhver rækkefølge, og
  null får serveren til at beholde sit tal. Logger `hjerterne stod ikke på
  siden`, hvis sælgerens side mangler tallet helt.
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
