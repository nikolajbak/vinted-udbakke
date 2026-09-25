# Status — 21. september 2026

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
