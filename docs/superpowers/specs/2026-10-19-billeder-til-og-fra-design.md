# Tilføj og fjern billeder i en eksisterende annonce — design

Bestemt af dig 19. oktober: »Gør det muligt at tilføje og fjerne billeder til
en eksisterende annonce.« Designet er godkendt i samtalen samme dag.

## Appen

- Varens side, når analysen er færdig (`ny`/`afsendt`) og varen ikke er solgt:
  en **+**-celle sidst i billedstriben åbner kamera/Fotos (flere på én gang),
  højst 20 billeder i alt (Vinteds loft).
- Hvert billede lægges i Storage og sendes med `mode:'nytFoto'` (kind
  `ekstra`) — serveren lægger det sidst i én sætning og optimerer det alene
  med seriens tone og format. Teksten skrives ikke om.
- **Fjern billedet** på beskæringsskærmen (tryk på et lille billede).
  Det sidste billede kan ikke fjernes. `mode:'fjernFoto'` fjerner det i én
  sætning på roden (`org || path`), og beskeden nederst har **Fortryd**, der
  lægger det tilbage på sin plads (`mode:'fjernFoto'` med `fortryd`). Filen
  bliver i Storage.
- Reglen for at lægge et billede til (`append_draft_photo`) løsnes fra
  »klar og ikke sendt« til »færdiganalyseret og ikke solgt« — også for
  »Tag dit eget som dette«.

## Til Vinted

- Ligger varen ude på Vinted (aktiv/pause, parret), lægger appen den nye
  liste (røddernes rækkefølge) i `pending.fotos` — samme vej som
  rækkefølgen.
- `mode:'pending'` giver runneren en plan (`fotoPlan` i `fotoplan.ts`):
  `fotos` er Vinteds id for kendte billeder og `{ny, url}` for billeder,
  Vinted ikke har; `fotoFjern` er id'er, der skal ud. Et billede, der er
  parret, men som du har slettet på Vinted, lægges ikke op igen. Billeder,
  du har lagt til direkte på Vinted (ukendte id'er), røres ikke.
- Runneren lægger hvert nyt billede i `add-photos-input` ét ad gangen og
  fanger id'et fra Vinteds svar på `POST /api/v2/photos` (målt i Vinteds kode
  19. oktober: `createPhoto` → `{id, url, temp_uuid}`). Gem-kaldets
  `assigned_photos` får ønsket rækkefølge uden de fjernede.
- Kvitteringen sender parrene `{rod, id}` med (`fotoNye`); serveren lægger
  dem i `listings.fotos`, og `fotos` ryddes først, når annoncen læst frisk
  har præcis listen (`fuldtSat`): ingen fjernet tilbage, intet nyt mangler,
  rækkefølgen ens.
- Gik en kvittering tabt, så Vinted har et nyt billede, appen ikke kender,
  prøves genkendelsen (`genkend`) på de ukendte mod de nye, før noget lægges
  op igen — ellers kunne det samme billede komme op to gange.

## Ikke med

- DBA og Reshopper: en annonce, der allerede er ude dér, kan appen ikke nå.
  Listen følger med, når varen sendes derhen.
- Billeder tilføjet eller fjernet på Vinted kommer ikke tilbage til appen
  (kun rækkefølgen gør, som før).

## Optimeringen skriver på stien, ikke pladsen

`set_draft_photo` skrev på en plads. Fjernes et billede, mens et andet
optimeres, ville det optimerede lande på den forkerte plads. Delkaldet
skriver nu på originalens sti (`set_draft_photo_paa_sti`), og findes stien
ikke længere, skrives intet.

## Afprøvning

Appen på prøvesiden (375 og 1280 px). `fotoplan.ts` med `node --test`.
Serverens modes live mod en kopi. Selve Gem kan kun afprøves på telefonen
(DataDome afviser Gem fra browserruden).

## Rettet efter gennemgangen (samme dag)

- Runneren melder hvert upload straks (`mode:'fotoOp'` → `listings.fotos_op`),
  før Gem, så en tabt kvittering ikke giver et dobbelt billede; en fejl
  meldes også, og efter to fejl (eller uden adresse) tages billedet ud af
  listen, så den ikke venter for evigt.
- Beskæringen går gennem serveren (`mode:'erstatFoto'`, `replace_draft_photo`)
  og bruger billedets sti; Fjern bruger roden — ikke pladsen.
- Når listen er sat, glemmes par, hvis billede er fjernet begge steder, så
  Fortryd senere lægger billedet op igen.
- `set_draft_photo_paa_sti` låser rækken først.
