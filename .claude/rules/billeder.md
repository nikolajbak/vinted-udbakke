---
paths:
  - "supabase/functions/analyze-draft/**"
---
# Billedbehandlingen i analysen

Flyttet ordret fra CLAUDE.md 2026-10-22. »Dine beslutninger → X« og »Målt, ikke gættet → X« peger på afsnittet X
i en af regelfilerne (se tabellen i CLAUDE.md). Hvert målt fund kostede en fejlsøgning; lav det ikke om uden at måle igen.

## Billedernes farver

Bestemt af dig 1. oktober: **billederne skal være tro mod varens rigtige farve.**
De optimeres stadig — beskæring, rotation, hvidt/sortpunkt, skarphed — men
farveægtheden går forud. En køber, der får en anden farve end billedet, sender
varen retur. Det står i `measureTone`/`applyTone` i `analyze-draft/optimize.ts`.

- **Ingen mætning og ingen farvetemperatur fra modellen.** Den bliver ikke spurgt.
  Modellens skøn tæller kun som et lille nap i eksponering og kontrast (×0,35).
- **Hvidbalancen læses kun af neutrale lyse flader** (højst 15 % forskel mellem
  kanalerne, ikke udbrændt), aldrig af varen. Er under 2 % af billedet neutralt,
  røres farven ikke. Loft ±6 %, og den må ikke flytte lysstyrken.
- **Kurven lægges på lysstyrken; R, G og B skaleres ens.** Så står nuance og
  mætning, som hvis kameraet havde fået mere lys. Rammer en kanal 255, tages
  det af mætningen i den pixel, ikke af nuancen.
- **Sortpunktet er kun en fod** under 3× sortpunktet. Et lineært sortpunkt
  trak hele mellemtonen ned — der, hvor varens farve er.
- **Gamma gør aldrig billedet mørkere**, og løfter kun en mørk scene (median
  under 118), højst til 0,85.
- Ret ikke på dette uden at måle ΔE på varen mod originalen — på flere varer,
  ikke ét billede.

Hvordan tonen måles og deles i serien: se »Målt, ikke gættet → Billederne«.

## Billederne

### CPU og format

- **Supabase måler CPU pr. kald, og billedbehandling er dyr.** Ét foto på
  1800×1350 fylder en mærkbar del af budgettet; fem i samme kald gav
  "CPU Time exceeded", og analysen hang uden at fejle synligt. `analyze-draft`
  kalder derfor sig selv med `{id, photo: n}` — ét foto pr. invokation,
  sekventielt. Læg aldrig flere fotos tilbage i ét kald, og undgå ekstra
  afkodninger: dekodningen er det dyre trin, ikke opløsningen.
- **Send billeder til modellen som URL, ikke base64.** De ligger offentligt i
  Storage. Base64 kostede både CPU og det meste af ventetiden.
- **Vinteds billedformat er målt på Vinted selv.** Hver annonce vises med 800 px
  på den lange kant; kopien de beholder til zoom er 1200×1600 og aldrig større.
  Derfor `MAX_EDGE = 1600` og portræt helt ned til 3:4. Deres egne filer vejer
  220–690 kB, så kvalitet 88 er rigeligt — de koder alligevel om.
- **Hele serien får ÉT format, målt på det første billede** og gemt i
  `drafts.ratio` — samme greb som fremkaldelsen. De to hensyn trækker hver sin
  vej: et format pr. billede gør varen størst, men giver fem forskellige facons
  i én annonce; et fast format (før: altid 3:4) er ens, men kostede en bred
  cardigan to tredjedele af rammen. Målestokken er nu hovedbilledet, altså varen
  selv, i stedet for et tal vi har valgt. Prisen er, at et nærbillede i
  portrætfacon får brede bånd i siden.
- **Et nærbillede må bøje seriens format; en hel vare må ikke.** Et hængemærke
  er højere, end billedet er bredt, og kan aldrig ligge i en kvadratisk ramme —
  målt til 43-46 % bjælke. Hele varer bøjer ikke: de ses i gitteret.

### Rotation

- **ImageScript `rotate()` drejer MOD uret.** Værktøjet spørger modellen om
  grader MED uret, så koden kalder `rotate((360 - rot) % 360)`. Målt i
  kørselsmiljøet, ikke læst i dokumentationen.
- **Beskæringsrammen skal med rundt** ved rotation (`rotateBox`) — den er sat i
  det oprindelige billede, men bruges efter rotationen.
- **Rotationen handler om varen, ikke om tyngdekraften.** Telefonen kan holdes på
  højkant eller på hovedet, så hvad der vendte opad under optagelsen siger intet.
  Spørgsmålet er, hvilken af de fire drejninger der viser varen som i en butik.
  **Er der tekst i billedet, er læseretningen facit**; står det ikke i
  prompten, vender mærkater tilfældigt. Uden tekst er tyngdekraften facit.
- **Retningskontrollen skal pege på kraven, ikke gætte grader.** Bad man den om
  et gradtal og skrev "svar 0 ved tvivl", kom produkt 8's forfra-billede ud på
  hovedet med kontrollens accept. Nu svarer den, hvor den ende ligger, der bæres
  øverst — krave, halsåbning, skulderlinje, linning — og koden regner graderne.

### Beskæring og isolering

- **Beskæringen er motivbevidst.** Luften omkring motivet afhænger af, hvad det
  ER: en hel vare tåler en stram ramme, et mærkat eller et logo gør ikke —
  klistret op ad kanten læser det som en fejl. Var motivet allerede skåret af i
  originalen, lægges rammen bredt, så det afskårne ikke springer i øjnene.
  Værdierne står i `PADDING` i `optimize.ts`.
- **Et billede på kroppen isoleres ikke** (`kind: 'paa-kroppen'`,
  19. oktober): en person på hvidt ligner en udklipning. Siger modellen
  `helvare`, bliver motivet `paakroppen` — samme luft (`PADDING`) og
  seriens tone. Som et nærbillede må det bøje seriens format, når det ikke
  kan rummes (hellere et andet format end hvide bjælker om en person); kun
  når heller ikke dets eget format kan rumme det (fx 9:16 af hele figuren),
  fyldes der ud.
- **KUN hele varer isoleres — aldrig nærbilleder.** Et hovedbillede skal ligne
  et produktfoto i gitteret, og en hel vare har ingen gavn af den flade, den
  ligger på. Et nærbillede beholder sine omgivelser: stoffet omkring et mærkat
  er sammenhængen, ikke rod. Beskåret stramt mister det den sidste linje
  tekst: `backgroundClutter` slog isoleringen til på vaskemærkatet, og dets
  højre kant blev klippet af.
- **Isolering koster det, den fylder op — og prisen afhænger af faconen.** En
  høj parka i et kvadrat koster 6 % af højden i bræmme, en bred bomberjakke i
  det SAMME kvadrat koster 35-42 %. Målt på produkt 7 og 8. Derfor isoleres en
  hel vare kun, når baggrunden er rodet (`backgroundClutter`), når det koster
  højst 15 % af rammen (`spild <= 0.15`), eller når billedet ikke kan rumme
  formatet (`isoler` i `optimize.ts`).
- **Rammen vokser ikke ud i rod.** For at ramme formatet skal beskæringen vokse,
  og den vokser ud i dét, der ligger omkring varen. Er baggrunden rolig, er det
  fint. Er der fødder, sengekant eller møbler tæt på (`backgroundClutter`),
  beskæres der stramt om varen, og resten fyldes med **hvidt** — varen står
  isoleret som på et produktfoto, og formatet er alligevel præcist. Uden det
  greb hentede formatjusteringen præcis dét ind igen, beskæringen skulle af med.
- **Isolerer vi, skal beskæringen være TÆT.** Den hvide ramme leverer luften.
  Lægger beskæringen også sin egen til, får man begge dele: en bræmme sengetøj
  klemt inde mellem varen og det hvide, som læser som en fejl. Målt på et rigtigt
  foto — første forsøg så præcis sådan ud.
- **Rammen kan sjældent glide fri af rodet.** Prøvet: lad rammen lægge sig,
  hvor der er mindst uro (forskellen mellem nabopixels, række for række). Det
  virker kun, når der ER et roligt sted at lægge den. På produkt 8 er der 120 px
  roligt lagen over jakken og 1315 px ramme at fylde, så hver eneste placering
  tager gulvet med. Målingen ligger i `uroAkser`/`roligstePlads` og bruges, når
  rammen vokser.
- **Bræmmen får farven fra den side, den rører.** Hjørnefarven er ét tal for
  hele rammen og gav en synlig søm — helt hvidt op ad et lagen, der er cremet og
  skygget. Med `sideFarve` pr. side forsvinder sømmen: en bræmme på 35 % kan
  ikke ses på det færdige billede, selv om den kan måles.

### Tone (fremkaldelsen)

Reglerne for farveægthed står under »Dine beslutninger → Billedernes farver«.

- **Hele serien fremkaldes ens.** Hvidbalance, sort-/hvidpunkt og gamma måles på
  det FØRSTE billede, gemmes i `drafts.tone` og genbruges på resten. Måler hvert
  billede sit eget, får den samme jakke forskellig farve alt efter hvor meget
  gulv der er i rammen — forfra blev oliven og udvasket, bagfra næsten sort.
  Derfor kører foto 0 alene først, resten parallelt bagefter. En tone uden
  `v: 2` er målt efter den gamle opskrift og genbruges ikke — foto 0 måler forfra.
- **Tonen måles på hele scenen, FØR beskæringen — aldrig på det færdige
  billede.** Målt på det isolerede billede var de lyseste 10 % den hvide ramme:
  hvidbalancen blev `[1,1,1]`, medianen skød op, gamma ramte loftet på 1,25, og
  hver vare kom 7-13 L* for mørk ud (ΔE 7-15 på nr. 10-17). Den kobaltblå
  sweater blev marineblå. Tonen lægges på lige efter beskæringen og før rammen,
  så rammen får det fremkaldte billedes farve og hvidt forbliver 255.

### At måle en billedrettelse

- **Billedmodellens svar svinger fra kørsel til kørsel.** Samme foto gav på fire
  gennemløb forskellig rotation, forskelligt `backgroundClutter` og forskellig
  motivkasse. Nærbillederne er stabile; hovedbilledet er det ikke. Mål derfor
  aldrig en billedrettelse på ét gennemløb.
- **Dømm ikke en bjælke på en nedskaleret kopi.** `sips -Z` + fremvisning
  skjulte en hvid bræmme på 42 %, som lå der. Mål pixels, eller se den fulde
  fil.
