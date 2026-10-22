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
