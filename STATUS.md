# Status — 1. oktober 2026

Hvor projektet står lige nu. `CLAUDE.md` rummer det, der er **målt** og ikke må
laves om; denne fil rummer det, der er **i gang** og går til.

## Virker og er ude

- **Vinted** — hele kæden: kategori, mærke, størrelse, stand, farve, materiale,
  markedsopslag, tekst og billeder. Afprøvet live.
- **DBA** — udfyldningen kørte hele vejen 18. september på en rigtig kladde,
  cirka 38 sekunder. **Rettet siden, og ikke kørt igennem efter rettelserne.**
- **Reshopper** — afskrift. Kun overskrift og beskrivelse på klippebordet,
  resten læses og tastes.
- **Billedbehandlingen** — rotation efter varen (ikke tyngdekraften), hele varer
  isoleres, kantfyldning i baggrundens farve, ét format pr. serie.
- **Appen** — tre markedspladser på én linje, `posted_to` pr. plads, prikker på
  køkortet.

## Ikke afprøvet — start her

0. **Farverne er tro mod varen — rettet 1. oktober.** Tonen blev målt på det
   hvidt indrammede billede, og hver vare kom 7-13 L* for mørk ud (kobaltblå →
   marineblå). Nu måles den på hele scenen, lægges på lysstyrken, og modellen
   rører hverken mætning eller farvetemperatur. Se »Billedernes farver« i
   `CLAUDE.md`. **Afprøvet** lokalt med den rigtige `optimize.ts` under Node på
   originalerne til nr. 10-17: ΔE på varen 1-3 mod 7-15 før (den gule
   regnjakke 6-7, mest lys). **Ikke afprøvet:** et helt gennemløb i Supabase
   med et nyt udkast — og CPU-tiden, da tonen nu lægges på det beskårne
   billede før nedskaleringen (op til ~25 % flere pixels, til gengæld én
   gennemgang i stedet for to). Gamle udkast har en tone uden `v: 2`; den
   genbruges ikke, så en ny analyse måler forfra.

0. **Markedstjekket af prisen virker igen — rettet 1. oktober (udgivelse
   0032 og frem).** Vinted flyttede søgningen til `api.vinted.dk`, og den
   gamle adresse svarede 404. Runneren tav, så alle udkast fra nr. 4 til 17
   fik modellens skøn (`price_grounded = false`). Samtidig læste `hentVare`
   404 som »annoncen er væk«; det er rettet, før en annonce blev meldt solgt
   ved en fejl.

   **Afprøvet** i en browser på vinted.dk (ikke logget ind): søgningen giver
   40 almindelige fund med mærke, størrelse og stand, og annoncen læses både
   af den åbne side og af en hentet side. **Ikke afprøvet:** en hel
   udfyldning på telefonen. Kig efter `marked: N annoncer` i loggen og
   `price_grounded = true` på udkastet bagefter. Udkast 9–17 er allerede lagt
   op med skønnet; prisvagten måler dem mod markedet, når de er tilknyttet.

0. **Synkronisering begge veje + Vinteds mails som push — bygget 1. oktober.**
   Reglerne står i `CLAUDE.md` under »Synkronisering af annoncerne« og
   »Vinteds mails«. Baggrundsrunden over alle annoncer er fjernet igen; der er
   intet ur. `@match` er tilbage på `/items/*`, så brugerscriptet skal IKKE
   geninstalleres.

   **Mangler for at mail-vejen virker — det er dit at sætte op:**
   1. En modtagertjeneste. CloudMailin (gratis, giver en adresse uden eget
      domæne): format **JSON (Normalized)**, mål
      `https://gjycsqshkvkcupdnvgvf.supabase.co/functions/v1/vinted-mail?key=<MAIL_KEY>`
      — nøglen står i `.env.secrets`.
   2. En regel på iCloud.com → Mail → Indstillinger → Regler: fra
      `vinted` → videresend til CloudMailin-adressen.

   **Ikke målt:** Vinteds mails. Emneordene (solgt/bud/besked) og
   beløbsmønsteret er gæt. Når de første mails er kommet, så læs
   `vinted_mails` og ret `slags()` og `beloeb()` efter dem.

0. **Læring af salgene — bygget 1. oktober. Der er intet at lære af endnu.**
   Ingen annoncer er tilknyttet (`listings` er tom), intet er solgt, og ingen
   købersamtaler er gemt. Gennemgangen svarer »for tidligt«, indtil der er
   3 solgte og 6 varer at bedømme. **Det, der skal til:** tilknyt nr. 5, 7 og
   9–12 til deres Vinted-annoncer på udkastets side, tast salgsprisen, når
   noget sælger, og brug **Svar en køber** på prisvagt-skærmen.

   **Afprøvet:** gennemgangen i kørselsmiljøet på syv opdigtede jakker (en
   midlertidig funktion med en falsk database). Den fandt det plantede mønster
   (mål i teksten → solgt hurtigt) i tre kørsler ud af tre og foreslog ikke
   den erfaring, der var slået fra. **Ikke afprøvet:** knapperne i appen,
   loggen fra køber-assistenten, og det ugentlige job.

   Samtidig rettet: `prisvagt_puls` (det daglige push) fejlede på den fjernede
   kolonne `pending_price` og ville have været tavs fra i dag.

0. **Nye regler for annoncetekst — bygget 1. oktober.** Alle fire steder, der
   skriver en beskrivelse (analysen, Vinteds markedsrunde, DBA, Reshopper),
   læser nu de samme regler i `_shared/beskrivelse.ts`: positivt sprog, »Helt
   ny« først når varen er ny, aldrig »uden synlige …«, intet om bytte, intet
   tilbud om mål eller flere billeder, fejl kun når de er sikre og kort til
   sidst, og et stylingforslag til slut. Nypris og mål slås op på nettet
   (prismærke og mærkat først) og gemmes i `drafts.fakta`, så de overlever,
   at teksten skrives om.

   **Afprøvet lokalt** på nr. 8 og 12 — reglerne holder, og målene fra
   mærkets størrelsesguide kom med. Nyprisen på nr. 8 (Teeshoppen) blev ikke
   fundet, og så står der ingen — det er meningen. **Ikke kørt gennem hele
   `analyze-draft` på et nyt udkast endnu.**

0. **Tilknyt en annonce, der ikke er lagt op af appen — bygget 30. september.**
   `listings` blev kun fyldt ét sted: af runneren, når den selv havde set
   varen blive lagt op. Fem udkast er markeret »sendt til Vinted«, og der var
   nul rækker i `listings` — så hverken annoncens egne ord, prisvagten eller
   et »solgt« kunne nå tilbage til udkastet. Det var dét, der lå bag
   »der synkroniseres ikke tilbage til appen«.

   Detaljeskærmen har nu et felt til annoncens adresse. Det står kun, når
   udkastet er afsendt eller markeret sendt til Vinted, og der ikke allerede
   er en række. Kun nummeret i adressen bruges. Prisen tages fra udkastet,
   fordi prisvagten skal have en udbudspris at regne fra; annoncens egen pris
   læses straks efter med **Opdatér fra Vinted**.

   **Målt:** insert og select på `listings` og `price_events` går igennem som
   rollen `authenticated` (kørt mod basen og rullet tilbage), og det unikke
   indeks på `(platform, external_id)` fanger en annonce, der allerede hører
   til et andet udkast.

   **Ikke kørt på en rigtig annonce.** Tilknyt nr. 7 eller 9–12, tryk
   **Opdatér fra Vinted**, og læs `window.__UDBAKKE_LOG__`: dét er samtidig
   den første rigtige måling af `hentVare()`s feltnavne, som stadig er gæt.

0. **Synkronisering UD til markedspladsen — bygget i dag.** Detaljeskærmen har
   nu **Redigér annonce** (titel, pris, beskrivelse). Gemmer du, opdateres
   udkastet, og ændringen lægges i `listings.pending` — den samme postkasse,
   prisvagten bruger. Næste gang annoncens redigeringsside åbnes, skrives
   felterne ind og gemmes, og kvitteringen sendes først, når ændringen er læst
   TILBAGE fra annoncen. Felt for felt: gik prisen igennem og titlen ikke,
   siger beskeden hvilket af dem der mangler.

   `pending_price` er afløst af `pending` (jsonb). Tabellen var tom, så der var
   intet at flytte.

   **Kun titel, pris og beskrivelse.** Det er dem, Vinteds redigeringsformular
   har som almindelige tekstfelter. Kategori, mærke og størrelse er vælgere og
   hører til, når annoncen oprettes.

   **Ikke kørt på en rigtig annonce.** Især: at `#title` og `#description`
   findes på `/items/{id}/edit` og ikke kun på `/items/new`. Gør de ikke det,
   siger banneret det, og prisen går igennem alene.


0. **Synkronisering tilbage fra Vinted — bygget i dag.** `listings.published`
   rummer annoncens egne ord (pris, titel, beskrivelse, mærke, størrelse,
   stand, farve), læst af annoncen selv. Den fyldes tre steder: lige efter
   Upload, ved hvert pristilsyn, og på opfordring via **Opdatér fra Vinted**
   på udkastet (åbner annoncen med `?udbakke=synk`). Detaljeskærmen viser
   annoncens pris som det store tal og lister de felter, der afviger fra
   udkastet.

   **Det usikre er feltnavnene.** `hentVare()` prøver flere navne pr. felt
   (`brand_title`/`brand`/`brand_dto`, `size_title`/`size`, `status`/
   `condition` …) og skriver i `window.__UDBAKKE_LOG__`, hvilke der IKKE blev
   fundet. Et felt, der ikke findes, vises bare ikke — der opfindes ingenting.
   Kør én rigtig synkronisering og læs loggen; så kan listen skæres ind til de
   navne, Vinted faktisk bruger.

   Særligt `status`: den bruges både som gæt på stand OG i tjekket for, om
   varen er solgt. Viser loggen, at den betyder det ene, skal det andet
   bruge et andet felt.


0. **Løbenumre, QR og etiketter — bygget i dag.** Hver vare har nu et
   løbenummer fra en sekvens (`drafts.nr`, de fem eksisterende er nummereret
   1–5), og QR-koden er det samme nummer som en adresse ind i appen.
   Tre nye steder: **Scan etiket** (kamera + jsQR, med tastefelt som reserve),
   **Etiketter** (listen med nummer og QR, afkrydsning og udskrivning), og
   selve arket, der deles i sider på 21 og printes med `window.print()`.

   **Målt:** etiketten er 63,5 × 38,1 mm, arket 194 × 266,7 mm — det passer på
   A4 med de margener, `@page` sætter. QR-koden er tegnet i 25 mm ved 300 dpi
   og læst korrekt tilbage med `jsQR`, også ned til en fjerdedel af den
   størrelse.

   **Ikke målt — kør det igennem:**
   - **Kameraet i den installerede PWA på iOS.** `getUserMedia` virker i
     Safari, men en PWA på hjemmeskærmen er en anden sag. Går det galt, siger
     skærmen det og peger på tastefeltet — men afprøv det.
   - **Selve udskrivningen.** `window.print()` åbner ikke altid et printpanel
     i en installeret PWA. Print første ark fra Macen, og hold et rigtigt
     etiketark op imod det, før du printer mange.
   - **Scanning med telefonens eget kamera.** QR-koden åbner appens adresse i
     Safari, ikke nødvendigvis i den installerede PWA — og Safari har sin egen
     login-session.


0. **Prisvagten — bygget i dag, intet af den er kørt på en rigtig annonce.**
   Hele kæden er ude: tabellerne `listings` og `price_events`, beslutningen i
   `prisvagt.ts`, fire nye tilstande i `vinted-fill-script`
   (`due`, `watch`, `pending`, `repriced`), tilsynet og prisændringen i
   runneren, Prisvagt-skærmen i appen, og et dagligt `pg_cron`-job, der sender
   en push, når noget er forfaldent.

   **Tre ting er gættet og skal måles på første kørsel** — alle tre står i
   `window.__UDBAKKE_LOG__`, så én rigtig runde afgør dem:
   - **Hvordan en annonce læses.** `hentVare()` prøver `/api/v2/items/{id}`
     først og annoncens egen side bagefter. Loggen siger hvilken der svarede
     (»målt via api« eller »målt via annoncesiden«). Svarer ingen af dem,
     virker intet andet.
   - **Hvordan en solgt vare ser ud.** Koden dømmer på `is_closed`,
     `is_hidden`, `is_sold` og 404. Hvilken af dem Vinted faktisk sætter, ved
     jeg ikke — sælg en vare og se, om den flytter sig til »solgt«.
   - **Gem-knappen på `/items/{id}/edit`.** Den findes på sin tekst
     (gem/upload/opdater/save/update). Findes den ikke, sætter scriptet prisen
     i feltet og beder dig trykke selv — det er den sikre fejl, ikke en stille.

   **Sådan kører du den første gang:** læg en annonce op med automatikken (så
   registreres den), sæt derefter `next_check_at` tilbage i tiden på den række
   i `listings`, åbn appen → Indstillinger → Prisvagt → »Tjek … mod markedet«.

   **DBA og Reshopper er ikke med endnu.** Tabellen kan rumme dem, men DBA's
   annoncenummer efter offentliggørelse og DBA's redigeringsside er ikke målt,
   og Reshopper har ingen webformular overhovedet. Vinted først, hvor hele
   kæden allerede er kendt.


0. **Web-push — bygget, mangler test på en rigtig iPhone.** Hele kæden er ude:
   `sw.js` + `manifest.webmanifest`, opt-in i Indstillinger, `push-subscribe`
   (gemmer abonnementet, RLS-låst tabel `push_subs`), `push-send` (fanout via
   `npm:web-push`, rydder døde abonnementer), og `analyze-draft` fyrer en push
   ("Udkast klar") når status bliver `ny`. VAPID-nøgler ligger i `.env.secrets`
   og som Supabase-hemmeligheder. Server-siden er verificeret (funktionerne
   booter, abonnement gemmes, fanout kører); selve LEVERINGEN kan kun testes i
   en installeret PWA på iOS — det er den eneste kontekst iOS tillader web-push.

   **Test sådan:** læg appen på hjemmeskærmen (Del → Føj til hjemmeskærm), åbn
   den DERFRA, Indstillinger → **Slå notifikationer til**, giv lov. Lav så et
   udkast (eller sæt et udkast til `afventer`) — når det bliver `ny`, skal der
   komme en notifikation. Kun "udkast klar" og påmindelser kan pushes; ikke
   køber-bud (serveren kan ikke se Vinteds indbakke).

0. **Køber-assistenten (svar + modbud).** Server-hjernen er bygget og afprøvet:
   POST `mode:'negotiate'` med `{item, buyerMessage?, offer?, platform}`. Den er
   **platform-bevidst** — `platform:'vinted'|'dba'|'reshopper'` styrer marked og
   tone, fordi DBA ligger højere end Vinted (Sophie Schnoor: 175 Vinted, 225
   DBA — ikke en fejl). Modbuddet forankres i den udbudspris, runneren læser på
   siden, og tvinges over buddet og på/under egen pris.
   **Mangler: hånden.** Userscripts, der læser samtalen og indsætter svaret til
   ét-tryks-afsendelse — én til Vinted, én til DBA (shadow-DOM). Måle-sonder er
   sendt; vælgerne skal måles på en rigtig samtale, før hånden bygges. Runneren
   SKAL sende `platform` med. Reshopper får ingen hånd (native app).

0. **Appen i Safari på Mac.** Det iOS-specifikke er gjort betinget:
   `x-safari-` bruges kun på iOS (på Mac åbnes et nyt faneblad, og vinduet
   åbnes *mens* klikket står på, ellers spærrer Safari det), kameraknappen
   hedder "Vælg billede", "Gem billeder i Fotos" lægger dem i Overførsler,
   Reshopper-deeplinket springes over, og opsætningsvejledningerne peger på
   Macens menuer. Browserens tilbageknap og Escape er koblet til routeren.
   Prøvet i en Chromium-rude, ikke i Safari — **kør den igennem på Macen**:
   log ind, opret et udkast, beskær med musen, og tryk Vinted og DBA.

1. **DBA: gemmes pris og billedtekster, når man går gennem *Fortsæt*?**
   Felterne bliver fyldt, men de indgår ikke i den `PUT`, trin 1 sender. Enten
   commits de ved trinskiftet, eller også går de tabt. Det er den vigtigste
   ubekendte.

   **Instrumentet er bygget og udrullet — nu mangler kun at køre det.** Runneren
   lytter på DBAs egne kald og læser annoncen tilbage fra
   `GET /recommerce/create/api/item/{id}`, ikke fra DOM'en. Den melder tre
   gange: hvad serveren har lige efter udfyldningen, hvad hvert af sidens egne
   kald bar med sig, og hvad der står bagefter. Grøn banner = alt gemt, brun =
   noget mangler; hele forløbet står i `window.__UDBAKKE_DBA_LOG__`.
   Kontrollen leder efter selve VÆRDIEN i svaret i stedet for et gættet
   feltnavn, så den også fortæller, hvad DBA kalder felterne.

   Navigerer DBA ved *Fortsæt*, dør lytteren med siden; derfor lægges det
   forventede i `sessionStorage`, og næste kørsel på samme annonce melder i
   stedet for at udfylde igen.

   **Vælg en vare, der har mindst fire sammenlignelige annoncer på DBA.**
   Billedteksterne kommer KUN fra markedsanalysen — `captions` findes ikke i
   den `GET`, runneren henter udkastet med, så `d.captions` er altid
   `undefined`. Falder markedsopslaget igennem, er der ingen billedtekster at
   måle på, og den halvdel af spørgsmålet står ubesvaret hen.
2. **DBA-brugerscriptet efter rettelserne.** To ting kom til bagefter: valget af
   annoncetype på `/create-item/start`, og fire funktioner (`fillCategory`,
   `fillSelect`, `choose`, `ventPaaFelt`), der var slettet ved et uheld og er
   sat tilbage. Hele gennemløbet er ikke kørt siden.
3. **Markedsanalysens gren for varer uden mærke.** To-lags-tilfældet (få af
   mærket + kategorien) er afprøvet; grenen uden mærke er bygget efter samme
   mønster, men ikke målt.
4. **Reshopper-deeplinket.** Om `reshopper://` faktisk åbner appen fra PWAen.

## Beslutninger, der er truffet

- **Kantfyldning frem for hvid ramme.** Sømmen er synlig, fordi ét gennemsnit
  ikke kan ramme et forløb i baggrunden — men en tynd stribe, der næsten
  matcher, er mindre påfaldende end en tyk hvid bjælke.
- **Formatet er hovedbilledets**, ikke medianen af serien. Prisen er brede bånd
  i siden på et nærbillede i portrætfacon. Medianen ligger som alternativ, hvis
  det bliver for grimt.
- **Formularvejen til DBA, ikke API-vejen.** `PUT /recommerce/create/api/item/{id}`
  ville være markant enklere, men blev blokeret af værktøjets klassificerer to
  gange. Vilkårsspørgsmålet er i øvrigt det samme for begge veje.
- **Et udkast forlader ikke køen, fordi Vinted er klaret.** Se `CLAUDE.md`.

## Værd at vide om opsætningen

- Skills i `~/.claude/skills/` er symlinks til `~/.agents/skills/`, hvor
  `npx skills add` lægger dem. Uden linkene ser Claude Code dem ikke.
- `full-output-enforcement` er bevidst koblet fra — den trak mod længere svar
  uden at løse et problem, projektet havde.
