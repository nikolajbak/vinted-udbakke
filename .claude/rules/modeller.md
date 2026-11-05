---
paths:
  - "supabase/functions/_shared/model.ts"
  - "supabase/functions/_shared/gemini-oversaet.ts"
  - "supabase/functions/_shared/forbrug.ts"
  - "sql/013-forbrug.sql"
  - "sql/022-gemini.sql"
  - "tools/test-gemini.mjs"
---
# Modelkald: Gemini, Claude og forbrug

Flyttet ordret fra CLAUDE.md 2026-10-22. »Dine beslutninger → X« og »Målt, ikke gættet → X« peger på afsnittet X
i en af regelfilerne (se tabellen i CLAUDE.md). Hvert målt fund kostede en fejlsøgning; lav det ikke om uden at måle igen.

## Gemini først, Claude som reserve

Bestemt af dig 19. oktober: **flyt så mange modelkald som muligt til
Geminis gratisniveau — uden at gå på kompromis med kvaliteten.** Forbilledet
er Kalorietælleren (`~/Kaloriet-ller`, `geminiKald`).

- **Alle kald går gennem `modelKald`** (`_shared/model.ts`) med det samme
  Anthropic-kald som før; svaret kommer tilbage i Anthropics form, så
  prompter, værktøjer og læsningen af svaret er urørte. Nyt modelkald →
  `modelKald`, aldrig `fetch` til Anthropic direkte.
- **`modelvalg` styrer hvert trin** uden en udgivelse: `claude` (kun Claude),
  `skygge` (Claude bruges, Gemini kører ved siden af, og begge svar gemmes i
  `modelkald`), `gemini` (Gemini bruges, Claude ved fejl). Uden
  `GEMINI_API_KEY` er alt `claude`, som før.
- **Et trin skifter først til `gemini`, når skyggen har vist, at Gemini er
  lige så god** på rigtige varer: læs `modelkald` (`skygge = true`), sammenlign
  `gemini_svar` med `claude_svar`, og skift trinnet med
  `update modelvalg …`/`insert`. Start: `*` = `skygge`.
- **Claude tager over** ved en fejl (429, 5xx, timeout), et afskåret eller
  blokeret svar, ugyldig JSON eller et manglende påkrævet felt. Hvert
  forsøg står i `modelkald` (`ok`, `fejl`, `ms`).
- **Modellen**: nyeste Flash (ikke lite, ikke Pro) fra Geminis modelliste,
  hentet én gang i timen pr. isolat; preview tæller lidt mindre. To modeller
  på skift (søgningen én — runneren venter 90 s på hele opslaget), 429/5xx
  giver et minuts pause, 404 en time. Gemini 3 tænker `low` for et
  Haiku-kald og `medium` for Sonnet; 2.5 et budget på 1024/4096.
- **Nøglen lægges ind med `sh tools/gemini-noegle.sh`** (fra udklipsholderen → Supabase-hemmeligheden og `.env.secrets`). Claude må ikke selv håndtere nøglen.
- **Nøglen skal være uden fakturering** — ellers er det ikke gratis.
  Gratisniveauet må bruge data til at forbedre Googles modeller; det er
  varebilleder og annoncetekster. **Vinteds mails bliver hos Claude**
  (`mail` = `claude`): de bærer købernavne, og læsningen koster under
  0,01 $ om måneden.
- **Én frist for hele Gemini-delen** (`geminiMs`, standard 40 s; opslaget
  25 s, producentbillederne 9 s), så Claude altid når at svare bagefter.
  Svaret holdes op mod værktøjets skema (`skemaFejl`: type, enum, indlejrede
  felter) — Claude håndhæver selv sit skema, og et Gemini-svar med en tekst
  i stedet for en liste ville ellers vælte kaldestedet.
- `forbrug` noterer Gemini-kald til 0 $ (`PRIS` `gemini`).
- **Målt 19. oktober med nøglen:**
  - Billeder kan sendes som adresse (`file_data` med Storage-adressen) — ingen base64.
  - **Googles søgning har ingen gratiskvote** (`google_search` → 429 på alle modeller, mens almindelige kald og `url_context` svarede). Derfor er `opslag:nypris_maal` = `claude`.
  - `gemini-2.5-flash` svarer 404 (»no longer available to new users«), og `gemini-3.8-flash` gav 403 fra serveren; begge sættes på pause.
  - Gemini er langsommere end Claude: et billedkald tog 7-52 s og indkøbsanalysen 13 s. Se `ms` i `modelkald`, før et trin, som telefonen venter på (`vinted:*`, `dba:*`), skiftes til `gemini`.
- **Skyggen gennemgået 22. oktober** (kald fra 19.-21. oktober): 38 par i alt,
  og **intet trin er skiftet til `gemini`**. Der er ikke analyseret en eneste
  ny vare siden 19. oktober, så billedanalysen, mærkerne, teksten, `dba:*`
  og resten af `vinted:*` har ingen par endnu.

  | Trin | Par | Fejl | ms (median) | Dom |
  |---|---|---|---|---|
  | `vinted:saet_ny_pris` | 34 | 102 | 7.200 (3-19 s) | **dårligere** → sat til `claude` |
  | `indkob` | 2 | 2 | 13.600 | for få data (begge par lige så gode) |
  | `laering` | 0 | 4 | — | for få data |
  | `vinted:ny_beskrivelse` | 0 | 1 | — | for få data |
  | analysen, mærkerne, `dba:*` | 0 | 0 | — | ikke kørt |

  - **Prisvagten (`saet_ny_pris`)**: 10 af 34 gange en anden handling end
    Claude, og Gemini sænker mindre (nr. 54: 130 mod 75 kr, median 45;
    nr. 121: 130 mod 99). Tre gange »stop«/»tag den hjem« med 30 dage, hvor
    Claude lavede et stort spring (id 55, 70), og én gang (id 10) sænkede
    Gemini en vare, hvor Claude rigtigt sagde, at prisen ikke var problemet
    (0 hjerter under medianen). Begrundelserne er kortere og nævner sjældent
    tallene. Den er sat til `claude` — skyggen gav ikke mere at vide, og den
    brugte kvoten.
  - **Gratiskvoten slipper op ved et pristjek af alle annoncer.** 21. oktober
    kl. 9.24 og 21.26 (»Tjek priserne nu«) svarede alle modeller 429 »You
    exceeded your current quota« efter ~20 kald, og 3.8 Flash løb 20 gange
    ind i fristen på 40 s. Ellers 503 »high demand« (19. og 21. oktober).
    Kun 34 af 136 forsøg lykkedes. Et trin i `gemini`, der kører i byger,
    ville derfor ofte vente 40 s og så gå til Claude — telefonen venter.
  - Næste gennemgang, når der er analyseret varer: `select trin, count(*)
    from modelkald where skygge group by 1`.

- **Skyggen gennemgået 5. november** (kald fra 22. oktober-3. november): 39 par af 265 Claude-kald i
  skygge, 414 fejlede Gemini-forsøg. **Kun `tekst:uden_forbudte` er skiftet til `gemini`.** »Par/kald« er par mod
  Claude-kald (`forbrug`). Claude er ikke facit: en afvigelse viser, at trinnet ikke er bevist lige så godt.

  | Trin | Par/kald | Forsøg, der fejlede | ms (median) | Dom |
  |---|---|---|---|---|
  | `tekst:uden_forbudte` | 6/6 | 0 | 5.600 (4,5-8 s) | **lige så god** → `gemini` |
  | `analyse:skriv_annonce` | 12/12 | 0 | 10.100 (6-24 s) | **dårligere** |
  | `analyse:tjek_billede` | 11/70 | 110 | 5.900 (3-20 s) | **dårligere** |
  | `analyse:vurder_billede` | 4/70 | 128 | 19.000 (13-33 s) | **dårligere**, få par |
  | `analyse:registrer_vare` | 2/12 | 19 | 18.500 | for få data (1 af 2 forkert varetype) |
  | `dba:marked` | 1/9 | 14 | 25.800 | for få data |
  | `dba:valg kategori`/`stand`/`pasform` | 1/26, 1/9, 1/8 | 40, 15, 12 | 2-11 s | for få data (samme valg i alle tre) |
  | `analyse:maerker`, `vinted:skriv_annonce`, `vinted:saet_vinted_felter`, `laering`, `opslag:billeder`, `dba:valg farve`, `indkob`, `vinted:ny_beskrivelse` | 0 par | 23, 25, 12, 9, 3, 2, 1, 1 | — | for få data |
  | `vinted:saet_ny_pris`, `opslag:nypris_maal`, `mail` | — | — | — | står på `claude` |

  - **`tekst:uden_forbudte`**: rettelserne er næsten ordrette og uden forbudte vendinger. Koden afviser selv et svar,
    der er for kort eller bærer vendingen, og ved en fejl tager Claude over. Forbehold: alle 6 par er fra samme
    eftermiddag. Hænger Gemini, venter trinnet op til 40 s, også på telefonen (`vinted:*`, `dba:*`). Trinnet er dog ikke
    kaldt fra dem siden 22. oktober, kun fra analysen.
  - **`analyse:skriv_annonce`**: størrelsen mangler 2 af 12 gange, hvor Claude og annoncen har den (nr. 83 S, nr. 84 M).
    Standen er ét trin højere 8 af 12 gange: 4 gange endte annoncen på Claudes »God«, 4 gange blev den rettet op. Det er
    uafgjort, men »God« → »Meget god« lover køberen for meget. Gemini opfinder også (nr. 85 »tørrer lynhurtigt«), og
    prompten skinner igennem (nr. 89 »præcis som angivet på vaskemærket«). Til Geminis fordel: 0 forbudte vendinger mod
    Claudes 6 af 12, og færre XML-rester. Claude havde `</description>` i 2 af 12 svar, men `cleanText` fjerner dem, og
    0 kladder har dem. **Skal prøves igen først**, når størrelsen er på plads.
  - **Billedtrinnene drejer forskelligt**: `tjek_billede` er helt enig 5 af 11 gange. Rotationen er modsat eller
    forskellig i id 318 (90 mod 270) og 292 (90 mod 0), og i `vurder_billede` id 232 (90 mod 270). Hvem der har ret, er
    ikke målt. En forkert drejning ødelægger billedet, så de bliver hos Claude.
  - **Kvoten er problemet, ikke kun kvaliteten.** Af 453 forsøg gav 356 fejlen 429, 41 løb ind i fristen og 17 gav 503.
    Analysen sender omkring 140 billedkald i byger (12 varer 1. november), så 429 rammer alle modeller, og
    `vinted:*`/`dba:*` får næsten ingen par. Siden 1. november kl. 21 dansk tid er 0 forsøg lykkedes (3.7 og 3.8).
    `modeller()` prøver kun de to nyeste, og `gemini-3-flash-preview` (14 ok, 0 429) nås kun, når de andre er i
    karantæne i samme isolat. Kun 3.8 og 3.7 løb ind i fristen på korte tekstkald (`dba:valg …`).
  - Næste gennemgang: `select trin, count(*) from modelkald where skygge group by 1`.

## Modellerne

- **Hvert kald til Anthropic noteres i `forbrug`** — via `noterForbrug(svar,
  trin, draftId)` lige efter `res.json()`. Et nyt kald uden den er usynligt i
  regningen. Prisen pr. model står i `PRIS` i `_shared/forbrug.ts`; ret den,
  når en model skiftes. Spørg `forbrug_pr_trin`, før der gættes på, hvad
  noget koster.
- **Et foto koster ~3.200 input-tokens på Sonnet 5** (1350×1800, målt med
  `count_tokens` 8. oktober) — det samme på Sonnet 5.5, Haiku 5.5 og Opus
  5.5; Haiku 4.5 nedskalerer til ~1.576. Fotoene er det meste af regningen:
  skønnet var ~$0,45 pr. vare, heraf ~70 % billeder.
- **Anthropic-API'et her tager ikke assistant-prefill** → brug `tool_choice`.
- **Modellen leverer af og til en indlejret liste som tekst** i et
  værktøjssvar (`erfaringer: "[{…}]"`). Første kørsel af gennemgangen væltede
  på `.map`. `laering.ts` parser en tekst, før den bruger den.
- **Haiku kan ikke læse et lille mærke blandt fem billeder.** På nr. 19
  læste den »TEF35« og »Atrm« to gange ud af tre, og selv da den havde læst
  »Army«, kaldte den skjorten sandfarvet. Sonnet på mærkebillederne alene
  læste alt rigtigt tre ud af tre. Læg derfor aldrig afskrift af mærker
  tilbage i billedanalysen.
- **Kontrollen af et valg må ikke se titel eller beskrivelse.** Gør den det,
  gentager den deres fejl — den forkastede både "Vindjakker" og "Regnjakker" for
  den samme jakke. Den dømmer på billederne alene.
- **Nypris og mål slås op med `web_search_20250305`, ikke `20260209`.** Den nye
  variant filtrerer resultaterne med kode og brugte 34-140 s på det samme fund,
  som den simple fandt på 21 s. Og `max_tokens` under ~4000 slap op midt i
  søgningen og gav et tomt svar. Opslaget kører side om side med
  markedssøgningen i `analyze-draft`, så det ikke lægger sin tid oveni.
