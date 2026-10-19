# Betalt annoncering — boost og andet betalt synlighed

19. oktober 2026. Godkendt af dig i samtalen samme dag.

## Formål

Hver krone, der bruges på synlighed, registreres pr. vare og pr.
markedsplads, så statistikkerne forbliver retvisende: udgiften trækkes fra
på Konto, og et salg eller hjerter under et boost læses ikke, som om prisen
eller teksten gjorde det. Vinteds performancetal (vist → klik → hjerter →
beskeder), som boostet åbner op for, bruges til at sige, hvor en vare taber.

Anledningen: 19. oktober kl. 05.53 blev nr. 55 (10409100133) og nr. 7
(10190049037) boostet i 3 dage for 25,38 kr i alt.

## Målt 19. oktober (browserruden, logget ind)

- **Fakturaen kommer som mail** (`vinted_mails` 44): emnet »Boost af din
  artikel - din faktura«, teksten »3-dags lokalt Boost (2 Artikler) /
  28.20 kr. / Discount / -2.82 kr. / I alt / 25.38 kr. / Apple Pay«. Den
  nævner IKKE varerne; linkene er kun vilkår og privatliv.
- **Garderoben siger hvilke**: `/api/v2/wardrobe/{bruger}/items` har
  `promoted: true` og `stats_visible: true` på de boostede — af 53 varer
  præcis 55 og 7. En ikke-boostet har `promoted: false`, `can_push_up: true`.
- **Tallene**: `GET https://api.vinted.dk/vas/items/{id}/bumps/stats?timezone=Europe%2FCopenhagen`
  med cookies og **`Accept-Language: da-DK`**. Uden det hoved (også med
  `da`) svarer den 500 `internal server error`; csrf og anon-id er
  ligegyldige. 404 for en vare, der ikke er boostet. Svaret:
  `bumped_item_stats {chart_data:[{date, highlighted, impressions}] (7 dage),
  conversations, favorites, humanized_hours_left, impression_difference,
  impressions, item_id, promotion_ended_days_ago, recently_promoted, views}`.
  Nr. 7: 2.397 vist (2.034 på boostdagen mod 36-112 før), 54 klik, 6 ♥,
  0 beskeder, `impression_difference` 3,84. Nr. 55: 2.005 vist, 57 klik, 5 ♥.
- Vinted sælger også »Fokus på garderobe« (`/vas/promoted_closets`,
  `/vas/users/{id}/promoted_closets/stats` svarer `{}`). Mailen er ikke set.

## Data (`sql/023-annoncering.sql`)

- **`annoncering_ordrer`**: én betaling. `id`, `at`, `plads`
  (vinted/dba/reshopper), `slags` (`boost`), `kr_i_alt numeric(10,2)`,
  `antal`, `dage`, `start`, `slut`, `vinted_mail_id`, `tekst` (fakturaens
  linje).
- **`annoncering`**: én vares del. `id`, `ordre_id` (null ved manuel),
  `draft_id` (krævet), `listing_id` (null på DBA/Reshopper), `plads`,
  `slags` (`boost`, `garderobe`, `dba-top`, `andet`), `kr numeric(10,2)`
  (null = ukendt), `start`, `slut`, `kilde` (`mail`/`dig`), `tal jsonb` (de
  seneste tal fra Vinted), `dom text` (dommen, regnet af serveren),
  `maalt_at`.
- **`annoncering_maal`**: historikken. `annoncering_id`, `at`,
  `impressions`, `views`, `favorites`, `conversations`, `forskel`,
  `chart jsonb`. Højst én pr. vare pr. dag.
- RLS: appen (authenticated) læser alle tre; indsætter og sletter i
  `annoncering`, når `kilde = 'dig'`.

## Vinted fylder selv ud

1. **Mailen** (`vinted-mail`): emnet »Boost af din artikel« → slags
   `boost` (målt mønster, foran modellen). `laesFaktura` læser dage
   (`(\d+)-dags`), antal (`\((\d+) Artikl`) og »I alt« (punktum som
   decimaltegn). Der oprettes en ordre uden varer, `start` = mailens tid,
   `slut` = start + dage. Ingen push (det er dit eget køb). Andre fakturaer
   (fx garderobe) går som før til »ny slags«, til en rigtig mail er set.
   `?genlaes=44` opretter ordren for i dag.
2. **Runneren** spørger `mode:'boost'` højst én gang i timen pr. fane
   (`localStorage`). Svaret: `{bruger, behov, maal:[external_id]}`.
   - `behov` (en Vinted-ordre fra de sidste 7 dage med færre varer end
     `antal`): hent garderoben side for side (`per_page` 96, højst 5 sider)
     og send id'erne med `promoted: true` (`mode:'boost'`, `promoted`).
     Serveren knytter dem, der ikke allerede har en række i ordrens periode,
     til ordren (højst `antal`), deler `kr_i_alt` ligeligt og flytter
     prisvagtens `next_check_at` til efter `slut` + 1 dag.
   - `maal`: varer med en boost-række, hvor nu < `slut` + 7 dage og intet
     mål i dag. For hver: hent `bumps/stats` og send tallene
     (`mode:'boost'`, `maal`). Serveren gemmer en række i
     `annoncering_maal`, opdaterer `tal`, `maalt_at` og `dom` på alle
     boost-rækker.
   - Alt skrives i `spor` (»boost: …«).

## Manuel registrering

På varens side har hver markedsplads-række **Betalt annoncering**: beløb
(kr), dage og slags (Boost / Topannonce / Andet). Gemmes direkte i
`annoncering` med `kilde = 'dig'` og kan slettes. Til DBA og Reshopper (ingen
adgang) og til et Vinted-boost, mailen ikke fangede.

## Statistikkerne

Et **boost-salg** er et salg under boostet eller op til 7 dage efter
`slut` (`boostSalg`).

- **Konto**: »Annoncering (N varer)« ca. X kr, »Tilbage efter AI og
  annoncering«, og »Boost: N boostede · M solgt under/efter · X kr pr.
  salg«. Salgslisten mærker »boostet«. Tid til salg og de andre tal er
  urørte (de tæller alle salg).
- **Gennemgangen af salgene** (`laering.ts`): hver vare-linje får
  »boostet N d for X kr (fra dato), solgt under/efter boostet« og tallene
  fra Vinted; prompten siger, at et boostet salg og hjerter fra en
  boostperiode ikke beviser, at pris, tekst eller billeder virkede.
- **Køb igen** (`indkob.ts`): salget tæller, men dommen »sælger let« kræver,
  at de hurtige salg ikke alle er boost-salg — medianen til salg for »let«
  regnes på de ikke-boostede salg; findes ingen, er det højst »sælger«.
  Boostede varer tæller ikke med i hjerter pr. dag (»lovende«). Udfaldet
  siger »(boostet)«.
- **Prisvagten**: ingen tilsyn og ingen forslag, mens et boost kører
  (`hentForfaldne` springer over, også »Tjek priserne nu«). Bagefter får
  `beslutPris` boost-linjen med tragten og at hjerterne fra boostet er
  pustet op.

## Tallene brugt (dommen)

`tragt(tal)` → vist, klik (klik/vist i %), hjerter (hjerter/klik i %),
beskeder. `boostDom(tal, andre, solgt)` siger én ting, i den rækkefølge:

1. solgt under/efter → »Boostet betalte sig: solgt for X kr.«
2. klikrate under grænsen → »Få klik: forsidebilledet, titlen eller prisen
   i feedet fanger ikke.«
3. hjerterate under grænsen → »Klik, men få hjerter: billederne, teksten
   eller prisen på varens side skuffer.«
4. mindst 5 hjerter og boostet slut uden salg → »Mange hjerter, intet salg:
   prisen holder dem tilbage.«
5. ellers → »Klikrate X % og hjerterate Y % — på niveau.«

Grænsen: under 0,7 × medianen af dine andre boostede varer, når der er
mindst 5; ellers fast 1,5 % klik og 5 % hjerter (skøn, siges i dommen).

## Varens side

Under Vinted-rækken: »Boostet · ender om 2 d · 12,69 kr« og tragten
»2.397 vist → 54 klik (2,3 %) → 6 ♥ (11 %) → 0 beskeder« med dommen under.
Efter boostet: »Boostet 19.-22. okt«. Manuelle rækker viser beløb og dage.

## Uden for

- »Fokus på garderobe« bygges, når en rigtig mail er set.
- Ingen boost-knap eller køb fra appen (`/vas/bumps/orders` røres ikke).
- Ingen automatisk tjek af DBA/Reshopper.

## Afprøvning

- `node --test tools/test-annoncering.mjs`: `laesFaktura` (mail 44),
  `tragt`, `boostDom`, `boostSalg`.
- `?genlaes=44` → ordren; `mode:'boost'` med 55 og 7 på serveren → rækker
  og 12,69 kr hver; et mål med de målte tal → dom.
- Runneren i browserruden på en Vinted-side → `spor` »boost: …«, mål gemt.
- Appen på prøvesiden: Konto, varens side, manuel registrering, 375 og
  1280 px.
- Ikke afprøvet: på telefonen.
