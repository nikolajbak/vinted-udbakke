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

1. **DBA: gemmes pris og billedtekster, når man går gennem *Fortsæt*?**
   Felterne bliver fyldt, men de indgår ikke i den `PUT`, trin 1 sender. Enten
   commits de ved trinskiftet, eller også går de tabt. Det er den vigtigste
   ubekendte.
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
