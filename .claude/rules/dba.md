---
paths:
  - "supabase/functions/dba-fill-script/**"
  - "supabase/functions/reshopper-draft/**"
---
# DBA og Reshopper

Flyttet ordret fra CLAUDE.md 2026-10-22. »Dine beslutninger → X« og »Målt, ikke gættet → X« peger på afsnittet X
i en af regelfilerne (se tabellen i CLAUDE.md). Hvert målt fund kostede en fejlsøgning; lav det ikke om uden at måle igen.

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
