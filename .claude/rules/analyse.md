---
paths:
  - "supabase/functions/analyze-draft/**"
  - "supabase/functions/_shared/beskrivelse.ts"
  - "supabase/functions/_shared/producentbilleder.ts"
  - "supabase/functions/_shared/laering.ts"
  - "supabase/functions/_shared/stoerrelse.ts"
  - "supabase/functions/_shared/titellighed.ts"
  - "supabase/functions/vinted-fill-script/laering.ts"
  - "sql/006-fakta.sql"
  - "sql/012-rettelser.sql"
  - "sql/015-tekstrettelser.sql"
---
# Annonceteksten, fakta og læring af fejl

Flyttet ordret fra CLAUDE.md 2026-10-22. »Dine beslutninger → X« og »Målt, ikke gættet → X« peger på afsnittet X
i en af regelfilerne (se tabellen i CLAUDE.md). Hvert målt fund kostede en fejlsøgning; lav det ikke om uden at måle igen.

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
