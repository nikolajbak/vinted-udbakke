# Udgivelser

Hver blok herunder er et punkt, der kan vendes tilbage til. Nyeste staar
oeverst. Versionsnumrene er dem, Supabase svarede med lige efter udrulningen,
og indholds-fingeraftrykket er git's eget traehash for funktionens mappe — to
udgivelser med samme fingeraftryk indeholder det samme.

```
./tools/tilbage.sh                      # se listen
./tools/tilbage.sh udgivelse-0003       # hele udgivelsen tilbage
./tools/tilbage.sh udgivelse-0003 dba-fill-script   # kun den ene funktion
./tools/tilbage.sh udgivelse-0003 app   # kun PWAen
```

Filen skrives af `tools/udgiv.sh`. Ret den ikke i haanden.

## udgivelse-0061 — 2026-10-08 21:09

Commit `744bcf2` — Maal kraever cm, W/L eller et maalord - stoerrelsesomregning frasorteres i koden  
App: `app.js?v=23578419` · `style.css?v=64c0b54a`  
Udrullet: analyze-draft

| funktion | live | indhold |
|---|---|---|
| analyze-draft ← | v73 | `1adbbe3a` |
| dba-fill-script | v23 | `e86e8c45` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v14 | `a31c8881` |
| vinted-fill-script | v80 | `1ae9ec1a` |
| vinted-mail | v3 | `888c83f1` |

## udgivelse-0060 — 2026-10-08 21:07

Commit `b88b082` — Stoerrelsesomregning er ikke maal (nr. 47)  
App: `app.js?v=23578419` · `style.css?v=64c0b54a`  
Udrullet: analyze-draft

| funktion | live | indhold |
|---|---|---|
| analyze-draft ← | v72 | `5460c0e8` |
| dba-fill-script | v23 | `e86e8c45` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v14 | `a31c8881` |
| vinted-fill-script | v80 | `1ae9ec1a` |
| vinted-mail | v3 | `888c83f1` |

## udgivelse-0059 — 2026-10-08 21:06

Commit `4857aec` — Ret syntaksfejl i beskrivelse.ts; udgiv.sh tjekker syntaksen med esbuild  
App: `app.js?v=23578419` · `style.css?v=64c0b54a`  
Udrullet: analyze-draft, dba-fill-script, reshopper-draft, vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft ← | v71 | `53af43ed` |
| dba-fill-script ← | v23 | `e86e8c45` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft ← | v14 | `a31c8881` |
| vinted-fill-script ← | v80 | `1ae9ec1a` |
| vinted-mail | v3 | `888c83f1` |

## udgivelse-0058 — 2026-10-08 19:40

Commit `b6a502e` — Gammel indbagt runner afvises: egen vagt, r=2 paa hvert kald, spor og baand  
App: `app.js?v=99598778` · `style.css?v=64c0b54a`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v70 | `4055dd2c` |
| dba-fill-script | v22 | `e86e8c45` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v13 | `a31c8881` |
| vinted-fill-script ← | v79 | `ff138abb` |
| vinted-mail | v3 | `888c83f1` |

## udgivelse-0057 — 2026-10-08 19:31

Commit `737b884` — Udfyldningens log sendes med clear og gemmes i spor; spor via timedFetch  
App: `app.js?v=99598778` · `style.css?v=64c0b54a`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v70 | `4055dd2c` |
| dba-fill-script | v22 | `e86e8c45` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v13 | `a31c8881` |
| vinted-fill-script ← | v78 | `80c22c18` |
| vinted-mail | v3 | `888c83f1` |

## udgivelse-0056 — 2026-10-08 19:18

Commit `3126fe1` — Runnerens spor gemmes i tabellen spor; prisens udfald spores  
App: `app.js?v=99598778` · `style.css?v=64c0b54a`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v70 | `4055dd2c` |
| dba-fill-script | v22 | `e86e8c45` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v13 | `a31c8881` |
| vinted-fill-script ← | v77 | `4c683497` |
| vinted-mail | v3 | `888c83f1` |

## udgivelse-0055 — 2026-10-08 18:56

Commit `0976c48` — Markedsrunden melder, naar Vinteds soegning fejler paa telefonen, og proever igen  
App: `app.js?v=99598778` · `style.css?v=64c0b54a`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v70 | `4055dd2c` |
| dba-fill-script | v22 | `e86e8c45` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v13 | `a31c8881` |
| vinted-fill-script ← | v76 | `dea442ff` |
| vinted-mail | v3 | `888c83f1` |

## udgivelse-0054 — 2026-10-08 18:14

Commit `0a46380` — Skaermen holdes taendt, mens runneren arbejder (Wake Lock)  
App: `app.js?v=99598778` · `style.css?v=64c0b54a`  
Udrullet: dba-fill-script, vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v70 | `4055dd2c` |
| dba-fill-script ← | v22 | `e86e8c45` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v13 | `a31c8881` |
| vinted-fill-script ← | v75 | `681197fc` |
| vinted-mail | v3 | `888c83f1` |

## udgivelse-0053 — 2026-10-08 18:00

Commit `6be3e4d` — Fanen lukker sig selv, naar runneren er faerdig og intet venter (Udbakke luk)  
App: `app.js?v=99598778` · `style.css?v=64c0b54a`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v70 | `4055dd2c` |
| dba-fill-script | v21 | `c449af3b` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v13 | `a31c8881` |
| vinted-fill-script ← | v74 | `32ca2e29` |
| vinted-mail | v3 | `888c83f1` |

## udgivelse-0052 — 2026-10-08 17:31

Commit `c78f33e` — Tjek mod markedet: appens flag efter # - Vinted smider ?udbakke=vagt vaek ved omdirigeringen  
App: `app.js?v=c83f8896` · `style.css?v=64c0b54a`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v70 | `4055dd2c` |
| dba-fill-script | v21 | `c449af3b` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v13 | `a31c8881` |
| vinted-fill-script ← | v73 | `d810f1a1` |
| vinted-mail | v3 | `888c83f1` |

## udgivelse-0051 — 2026-10-08 17:30

Commit `05ac8d1` — tjek-live: varslet om ny udgave af brugerscriptet står foran runneren  
App: `app.js?v=b6f02e8c` · `style.css?v=64c0b54a`  
Udrullet: analyze-draft, dba-fill-script, reshopper-draft, vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft ← | v70 | `4055dd2c` |
| dba-fill-script ← | v21 | `c449af3b` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft ← | v13 | `a31c8881` |
| vinted-fill-script ← | v72 | `a4b8dc5d` |
| vinted-mail | v3 | `888c83f1` |

## udgivelse-0050 — 2026-10-08 16:55

Commit `b24666b` — Prisfeltet faar fokus, foer prisen skrives: Vinteds valutafelt gav en tom pris paa redigeringssiden  
App: `app.js?v=238554cd` · `style.css?v=64c0b54a`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v68 | `4055dd2c` |
| dba-fill-script | v19 | `87bae55d` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v11 | `a31c8881` |
| vinted-fill-script ← | v70 | `0b8241b8` |
| vinted-mail | v3 | `888c83f1` |

## udgivelse-0049 — 2026-10-08 16:35

Commit `04aab96` — Brugerscriptet kører på hele vinted.dk, så annoncen meldes efter Upload  
App: `app.js?v=238554cd` · `style.css?v=64c0b54a`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v68 | `4055dd2c` |
| dba-fill-script | v19 | `87bae55d` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v11 | `a31c8881` |
| vinted-fill-script ← | v69 | `f7058022` |
| vinted-mail | v3 | `888c83f1` |

## udgivelse-0048 — 2026-10-08 16:26

Commit `f396d9a` — Priser skrives som hele kroner med komma og to nuller (89,00 kr)  
App: `app.js?v=238554cd` · `style.css?v=64c0b54a`  
Udrullet: analyze-draft, dba-fill-script, reshopper-draft, vinted-fill-script, vinted-mail

| funktion | live | indhold |
|---|---|---|
| analyze-draft ← | v68 | `4055dd2c` |
| dba-fill-script ← | v19 | `87bae55d` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft ← | v11 | `a31c8881` |
| vinted-fill-script ← | v68 | `7f8c9c54` |
| vinted-mail ← | v3 | `888c83f1` |

## udgivelse-0047 — 2026-10-05 08:18

Commit `31628f4` — Rettelser kvitteres med Vinted: runneren bliver på siden efter Gem, læser annoncen frisk, og serveren rydder kun det, der står i annoncen  
App: `app.js?v=4362adb2` · `style.css?v=64c0b54a`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v67 | `4055dd2c` |
| dba-fill-script | v18 | `87bae55d` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v10 | `a31c8881` |
| vinted-fill-script ← | v67 | `83bfd009` |
| vinted-mail | v2 | `8bd594cd` |

## udgivelse-0046 — 2026-10-05 08:08

Commit `38265ca` — Titler skrives aldrig kun med store bogstaver: regel i prompten og ingenVersaler() efter modellen  
App: `app.js?v=896214ba` · `style.css?v=64c0b54a`  
Udrullet: analyze-draft, dba-fill-script, reshopper-draft, vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft ← | v67 | `4055dd2c` |
| dba-fill-script ← | v18 | `87bae55d` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft ← | v10 | `a31c8881` |
| vinted-fill-script ← | v66 | `af909eb1` |
| vinted-mail | v2 | `8bd594cd` |

## udgivelse-0045 — 2026-10-05 07:54

Commit `9086af7` — Hvad skal jeg købe igen?: ubrugte varer pr. kategori og produkt ud fra egne salg  
App: `app.js?v=896214ba` · `style.css?v=64c0b54a`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v66 | `cbc5da4f` |
| dba-fill-script | v17 | `ff35394d` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v9 | `a31c8881` |
| vinted-fill-script ← | v65 | `32d70879` |
| vinted-mail | v2 | `8bd594cd` |

## udgivelse-0044 — 2026-10-03 00:54

Commit `282836e` — Ingen zoom i appen: viewport, touch-action og knib stoppet  
App: `app.js?v=c41a30fe` · `style.css?v=8ab674d9`  
Udrullet: ingen funktioner (kun noteret)

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v66 | `cbc5da4f` |
| dba-fill-script | v17 | `ff35394d` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v9 | `a31c8881` |
| vinted-fill-script | v64 | `b11abdc4` |
| vinted-mail | v2 | `8bd594cd` |

## udgivelse-0043 — 2026-10-03 00:49

Commit `8deeee4` — Lageret: én fase pr. vare, opgaver på forsiden, en række pr. markedsplads  
App: `app.js?v=42016a81` · `style.css?v=34e075ba`  
Udrullet: dba-fill-script, vinted-fill-script, vinted-mail

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v66 | `cbc5da4f` |
| dba-fill-script ← | v17 | `ff35394d` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v9 | `a31c8881` |
| vinted-fill-script ← | v64 | `b11abdc4` |
| vinted-mail ← | v2 | `8bd594cd` |

## udgivelse-0042 — 2026-10-02 12:05

Commit `ba51a80` — Efterloeb: udfyldte udkast parres med garderoben, og runneren sender sine trin hjem  
App: `app.js?v=830d0347` · `style.css?v=43fdde2d`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v66 | `cbc5da4f` |
| dba-fill-script | v16 | `e17424c6` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v9 | `a31c8881` |
| vinted-fill-script ← | v63 | `99deb822` |
| vinted-mail | v1 | `b2c342ef` |

## udgivelse-0041 — 2026-10-02 11:19

Commit `d627310` — Brugerscriptet er kun en indlaeser  
App: `app.js?v=830d0347` · `style.css?v=43fdde2d`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v66 | `cbc5da4f` |
| dba-fill-script | v16 | `e17424c6` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v9 | `a31c8881` |
| vinted-fill-script ← | v62 | `8799f55e` |
| vinted-mail | v1 | `b2c342ef` |

## udgivelse-0040 — 2026-10-02 11:08

Commit `37d482f` — Farven tages fra maerket  
App: `app.js?v=830d0347` · `style.css?v=43fdde2d`  
Udrullet: analyze-draft, dba-fill-script, reshopper-draft, vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft ← | v66 | `cbc5da4f` |
| dba-fill-script ← | v16 | `e17424c6` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft ← | v9 | `a31c8881` |
| vinted-fill-script ← | v61 | `08a068b9` |
| vinted-mail | v1 | `b2c342ef` |

## udgivelse-0039 — 2026-10-02 11:01

Commit `d393416` — Find den nye annonce i garderoben, ikke paa en adresse  
App: `app.js?v=830d0347` · `style.css?v=43fdde2d`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v65 | `c09319c9` |
| dba-fill-script | v15 | `e17424c6` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v8 | `a31c8881` |
| vinted-fill-script ← | v60 | `d5b36c31` |
| vinted-mail | v1 | `b2c342ef` |

## udgivelse-0038 — 2026-10-02 10:46

Commit `11765ba` — Ny vare prissaettes mod sin nypris  
App: `app.js?v=830d0347` · `style.css?v=43fdde2d`  
Udrullet: analyze-draft, dba-fill-script, reshopper-draft, vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft ← | v65 | `c09319c9` |
| dba-fill-script ← | v15 | `e17424c6` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft ← | v8 | `a31c8881` |
| vinted-fill-script ← | v59 | `ef43a62a` |
| vinted-mail | v1 | `b2c342ef` |

## udgivelse-0037 — 2026-10-02 09:53

Commit `0c36f84` — Tre ens linjer på hvert kort, én skrift og størrelse  
App: `app.js?v=830d0347` · `style.css?v=43fdde2d`  
Udrullet: ingen funktioner (kun noteret)

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v64 | `0f683ced` |
| dba-fill-script | v14 | `f8f22c92` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v7 | `a31c8881` |
| vinted-fill-script | v58 | `593f6e03` |
| vinted-mail | v1 | `b2c342ef` |

## udgivelse-0036 — 2026-10-02 09:43

Commit `8444b52` — Vis løbenummeret på kortet og i toppen af udkastet  
App: `app.js?v=e54e0372` · `style.css?v=7fa4cebf`  
Udrullet: ingen funktioner (kun noteret)

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v64 | `0f683ced` |
| dba-fill-script | v14 | `f8f22c92` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v7 | `a31c8881` |
| vinted-fill-script | v58 | `593f6e03` |
| vinted-mail | v1 | `b2c342ef` |

## udgivelse-0035 — 2026-10-02 09:23

Commit `532eb78` — Meld kun den nye annonce som lagt op  
App: `app.js?v=9a9e1409` · `style.css?v=992bac91`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v64 | `0f683ced` |
| dba-fill-script | v14 | `f8f22c92` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v7 | `a31c8881` |
| vinted-fill-script ← | v58 | `593f6e03` |
| vinted-mail | v1 | `b2c342ef` |

## udgivelse-0034 — 2026-10-01 17:01

Commit `df1448f` — Billedernes farver er tro mod varen  
App: `app.js?v=9a9e1409` · `style.css?v=992bac91`  
Udrullet: analyze-draft

| funktion | live | indhold |
|---|---|---|
| analyze-draft ← | v64 | `0f683ced` |
| dba-fill-script | v14 | `f8f22c92` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v7 | `a31c8881` |
| vinted-fill-script | v57 | `38292428` |
| vinted-mail | v1 | `b2c342ef` |

## udgivelse-0033 — 2026-10-01 16:37

Commit `d9bf308` — Markedstjek af prisen: Vinteds soegning er flyttet til api.vinted.dk  
App: `app.js?v=9a9e1409` · `style.css?v=992bac91`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v63 | `d1a050f0` |
| dba-fill-script | v14 | `f8f22c92` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v7 | `a31c8881` |
| vinted-fill-script ← | v57 | `38292428` |
| vinted-mail | v1 | `b2c342ef` |

## udgivelse-0032 — 2026-10-01 16:35

Commit `a4c2dac` — Vinteds mails som push, og ingen runde paa et ur  
App: `app.js?v=9a9e1409` · `style.css?v=992bac91`  
Udrullet: vinted-fill-script, vinted-mail

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v63 | `d1a050f0` |
| dba-fill-script | v14 | `f8f22c92` |
| push-send | v4 | `cce82c40` |
| push-subscribe | v4 | `989f990f` |
| reshopper-draft | v7 | `a31c8881` |
| vinted-fill-script ← | v56 | `20613c95` |
| vinted-mail ← | v1 | `b2c342ef` |

## udgivelse-0031 — 2026-10-01 16:30

Commit `e468bd7` — Tilknyt annoncen efter Upload, selv om Vinted ikke genindlaeser siden  
Bærer også »Hele kroner overalt: fortolk prisen foer den rundes« (`cdd07a9`, faldt ud af historikken ved et `reset` i en parallel session — indholdet ligger i `98efe3b`)  
App: `app.js?v=9a9e1409` · `style.css?v=992bac91`  
Udrullet: analyze-draft, dba-fill-script, reshopper-draft, vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft ← | v62 | `8e2f7050` |
| dba-fill-script ← | v13 | `15e4217a` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft ← | v6 | `09be45c1` |
| vinted-fill-script ← | v54 | `8bbdcc5e` |

## udgivelse-0030 — 2026-10-01 09:25

Commit `783e7c4` — Synkroniser annoncerne automatisk begge veje  
App: `app.js?v=e7a629c2` · `style.css?v=992bac91`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v61 | `8e2f7050` |
| dba-fill-script | v12 | `15e4217a` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft | v5 | `09be45c1` |
| vinted-fill-script ← | v53 | `3f712c0b` |

## udgivelse-0029 — 2026-10-01 09:07

Commit `faa7f49` — Laer af salgene: udfald, koeberspoergsmaal og erfaringer i prompterne  
App: `app.js?v=5c0b3066` · `style.css?v=992bac91`  
Udrullet: analyze-draft, dba-fill-script, reshopper-draft, vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft ← | v61 | `8e2f7050` |
| dba-fill-script ← | v12 | `15e4217a` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft ← | v5 | `09be45c1` |
| vinted-fill-script ← | v52 | `ad8af3aa` |

## udgivelse-0028 — 2026-10-01 08:41

Commit `0d50957` — Skriv annoncetekster efter faelles regler, med nypris og maal  
App: `app.js?v=db1ee933` · `style.css?v=73b03d41`  
Udrullet: analyze-draft, dba-fill-script, reshopper-draft, vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft ← | v60 | `8d6761a5` |
| dba-fill-script ← | v11 | `bf1caef5` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft ← | v4 | `f5407e75` |
| vinted-fill-script ← | v51 | `1ea036a7` |

## udgivelse-0027 — 2026-09-30 18:29

Commit `a1ad4ff` — Lad udgiv.sh komme sig over et fejlet Pages-byg  
App: `app.js?v=db1ee933` · `style.css?v=73b03d41`  
Udrullet: ingen funktioner (kun noteret)

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v59 | `0d8dc260` |
| dba-fill-script | v10 | `dca7af78` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft | v3 | `cdb3cb0a` |
| vinted-fill-script | v50 | `51698b03` |

## udgivelse-0026 — 2026-09-30 18:10

Commit `1bb467e` — Lad en annonce, der ikke er lagt op af appen, blive tilknyttet  
App: `app.js?v=d52333fc` · `style.css?v=73b03d41`  
Udrullet: ingen funktioner (kun noteret)

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v59 | `0d8dc260` |
| dba-fill-script | v10 | `dca7af78` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft | v3 | `cdb3cb0a` |
| vinted-fill-script | v50 | `51698b03` |

## udgivelse-0025 — 2026-09-30 17:53

Commit `8c203a0` — Behold originalen, naar du beskaerer manuelt  
App: `app.js?v=b00a00ce` · `style.css?v=1594422e`  
Udrullet: ingen funktioner (kun noteret)

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v59 | `0d8dc260` |
| dba-fill-script | v10 | `dca7af78` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft | v3 | `cdb3cb0a` |
| vinted-fill-script | v50 | `51698b03` |

## udgivelse-0024 — 2026-09-30 17:48

Commit `e09de9e` — Lad kontrollen pege paa kraven i stedet for at gaette grader  
App: `app.js?v=f9220621` · `style.css?v=1594422e`  
Udrullet: analyze-draft

| funktion | live | indhold |
|---|---|---|
| analyze-draft ← | v59 | `0d8dc260` |
| dba-fill-script | v10 | `dca7af78` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft | v3 | `cdb3cb0a` |
| vinted-fill-script | v50 | `51698b03` |

## udgivelse-0023 — 2026-09-30 17:45

Commit `5835ef5` — Giv hver bjaelke farven fra den side, den roerer  
App: `app.js?v=f9220621` · `style.css?v=1594422e`  
Udrullet: analyze-draft

| funktion | live | indhold |
|---|---|---|
| analyze-draft ← | v58 | `0fb3e2fc` |
| dba-fill-script | v10 | `dca7af78` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft | v3 | `cdb3cb0a` |
| vinted-fill-script | v50 | `51698b03` |

## udgivelse-0022 — 2026-09-30 17:40

Commit `19efc66` — Lad rammen glide vaek fra rodet, naar den vokser  
App: `app.js?v=f9220621` · `style.css?v=1594422e`  
Udrullet: analyze-draft

| funktion | live | indhold |
|---|---|---|
| analyze-draft ← | v57 | `3cc05a88` |
| dba-fill-script | v10 | `dca7af78` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft | v3 | `cdb3cb0a` |
| vinted-fill-script | v50 | `51698b03` |

## udgivelse-0021 — 2026-09-30 17:32

Commit `9ace926` — Lad rod i baggrunden ikke fritage fra prisen paa isolering  
App: `app.js?v=f9220621` · `style.css?v=1594422e`  
Udrullet: analyze-draft

| funktion | live | indhold |
|---|---|---|
| analyze-draft ← | v56 | `ca799876` |
| dba-fill-script | v10 | `dca7af78` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft | v3 | `cdb3cb0a` |
| vinted-fill-script | v50 | `51698b03` |

## udgivelse-0020 — 2026-09-30 17:29

Commit `01923a5` — Isoler kun en hel vare, naar det koster lidt  
App: `app.js?v=f9220621` · `style.css?v=1594422e`  
Udrullet: analyze-draft

| funktion | live | indhold |
|---|---|---|
| analyze-draft ← | v55 | `a94d0e20` |
| dba-fill-script | v10 | `dca7af78` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft | v3 | `cdb3cb0a` |
| vinted-fill-script | v50 | `51698b03` |

## udgivelse-0019 — 2026-09-30 17:20

Commit `60855fc` — Lad naerbilleder boeje formatet, og find baggrunden som flertal  
App: `app.js?v=f9220621` · `style.css?v=1594422e`  
Udrullet: analyze-draft

| funktion | live | indhold |
|---|---|---|
| analyze-draft ← | v54 | `51e175c9` |
| dba-fill-script | v10 | `dca7af78` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft | v3 | `cdb3cb0a` |
| vinted-fill-script | v50 | `51698b03` |

## udgivelse-0018 — 2026-09-30 12:52

Commit `db7f9a7` — Lad naerbilleder tage af luften frem for at faa hvide bjaelker  
App: `app.js?v=f9220621` · `style.css?v=1594422e`  
Udrullet: analyze-draft

| funktion | live | indhold |
|---|---|---|
| analyze-draft ← | v53 | `0fae7439` |
| dba-fill-script | v10 | `dca7af78` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft | v3 | `cdb3cb0a` |
| vinted-fill-script | v50 | `51698b03` |

## udgivelse-0017 — 2026-09-30 12:49

Commit `ccf458c` — Ret billedbehandlingen: staaende format, og fyld i baggrundens farve  
App: `app.js?v=f9220621` · `style.css?v=1594422e`  
Udrullet: analyze-draft

| funktion | live | indhold |
|---|---|---|
| analyze-draft ← | v52 | `f90d5c69` |
| dba-fill-script | v10 | `dca7af78` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft | v3 | `cdb3cb0a` |
| vinted-fill-script | v50 | `51698b03` |

## udgivelse-0016 — 2026-09-30 12:30

Commit `072e3c8` — Gendan renderDetail, og synkroniser ogsaa den anden vej  
App: `app.js?v=f9220621` · `style.css?v=1594422e`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v51 | `e68ee069` |
| dba-fill-script | v10 | `dca7af78` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft | v3 | `cdb3cb0a` |
| vinted-fill-script ← | v50 | `51698b03` |

## udgivelse-0015 — 2026-09-30 12:19

Commit `5592a1b` — Synkroniser annoncens egne oplysninger tilbage til appen  
App: `app.js?v=3c97af90` · `style.css?v=a5a41887`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v51 | `e68ee069` |
| dba-fill-script | v10 | `dca7af78` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft | v3 | `cdb3cb0a` |
| vinted-fill-script ← | v49 | `0d5215b1` |

## udgivelse-0014 — 2026-09-30 12:04

Commit `04c6e0e` — Lad en vare komme tilbage fra 'afsendt', og lad et maerke tages af igen  
App: `app.js?v=6c24247c` · `style.css?v=9b4beb02`  
Udrullet: ingen funktioner (kun noteret)

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v51 | `e68ee069` |
| dba-fill-script | v10 | `dca7af78` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft | v3 | `cdb3cb0a` |
| vinted-fill-script | v48 | `60249c2c` |

## udgivelse-0013 — 2026-09-30 11:42

Commit `00ff461` — Giv hvert produkt et loebenummer, en QR-kode og en etiket  
App: `app.js?v=ba676520` · `style.css?v=6b51f320`  
Udrullet: ingen funktioner (kun noteret)

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v51 | `e68ee069` |
| dba-fill-script | v10 | `dca7af78` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft | v3 | `cdb3cb0a` |
| vinted-fill-script | v48 | `60249c2c` |

## udgivelse-0012 — 2026-09-30 11:00

Commit `faeec58` — Lad de afsendte annoncer aabne  
App: `app.js?v=83a3c7f0` · `style.css?v=01cc6ac7`  
Udrullet: ingen funktioner (kun noteret)

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v51 | `e68ee069` |
| dba-fill-script | v10 | `dca7af78` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft | v3 | `cdb3cb0a` |
| vinted-fill-script | v48 | `60249c2c` |

## udgivelse-0011 — 2026-09-30 07:03

Commit `96ad4bc` — Lad prisvagtens begrundelse naevne den pris, der faktisk bliver sat  
App: `app.js?v=3d930e41` · `style.css?v=b43c799f`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v51 | `e68ee069` |
| dba-fill-script | v10 | `dca7af78` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft | v3 | `cdb3cb0a` |
| vinted-fill-script ← | v48 | `60249c2c` |

## udgivelse-0010 — 2026-09-30 06:58

Commit `4d5a630` — Byg prisvagten: hold oeje med det der ikke saelges, og saet prisen ned  
App: `app.js?v=3d930e41` · `style.css?v=b43c799f`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v51 | `e68ee069` |
| dba-fill-script | v10 | `dca7af78` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft | v3 | `cdb3cb0a` |
| vinted-fill-script ← | v47 | `2edc4b1e` |

## udgivelse-0009 — 2026-09-28 09:45

Commit `91ef356` — Faa opdaterings-banneret til at virke: sammenlign stempler, ikke ETag  
App: `app.js?v=e064d3fd` · `style.css?v=3bce8da2`  
Udrullet: ingen funktioner (kun noteret)

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v51 | `e68ee069` |
| dba-fill-script | v10 | `dca7af78` |
| push-send | v3 | `cce82c40` |
| push-subscribe | v3 | `989f990f` |
| reshopper-draft | v3 | `cdb3cb0a` |
| vinted-fill-script | v46 | `8fe8c9ac` |

## udgivelse-0008 — 2026-09-27 22:08

Commit `c744c31` — Byg web-push: sig til paa telefonen naar et udkast er klar  
App: `app.js?v=45992f6c` · `style.css?v=3bce8da2`  
Udrullet: analyze-draft, push-send, push-subscribe

| funktion | live | indhold |
|---|---|---|
| analyze-draft ← | v51 | `e68ee069` |
| dba-fill-script | v10 | `dca7af78` |
| push-send ← | v3 | `cce82c40` |
| push-subscribe ← | v3 | `989f990f` |
| reshopper-draft | v3 | `cdb3cb0a` |
| vinted-fill-script | v46 | `8fe8c9ac` |

## udgivelse-0007 — 2026-09-25 11:29

Commit `c2f1866` — Gor koeber-assistenten platform-bevidst  
App: `app.js?v=554a69e1` · `style.css?v=3bce8da2`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v48 | `5fe7fff8` |
| dba-fill-script | v9 | `dca7af78` |
| reshopper-draft | v2 | `cdb3cb0a` |
| vinted-fill-script ← | v45 | `8fe8c9ac` |

## udgivelse-0006 — 2026-09-25 10:32

Commit `802a3b0` — Byg hjernen bag koeber-assistenten: svar og modbud  
App: `app.js?v=554a69e1` · `style.css?v=3bce8da2`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v48 | `5fe7fff8` |
| dba-fill-script | v9 | `dca7af78` |
| reshopper-draft | v2 | `cdb3cb0a` |
| vinted-fill-script ← | v43 | `1a253012` |

## udgivelse-0005 — 2026-09-25 09:27

Commit `5662bb5` — Skriv Vinted-prisen i hele kroner  
App: `app.js?v=554a69e1` · `style.css?v=3bce8da2`  
Udrullet: vinted-fill-script

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v48 | `5fe7fff8` |
| dba-fill-script | v9 | `dca7af78` |
| reshopper-draft | v2 | `cdb3cb0a` |
| vinted-fill-script ← | v39 | `652c33b1` |

## udgivelse-0004 — 2026-09-25 09:12

Commit `22a9000` — Gor appen brugbar i Safari paa en Mac  
App: `app.js?v=554a69e1` · `style.css?v=3bce8da2`  
Udrullet: ingen funktioner (kun noteret)

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v48 | `5fe7fff8` |
| dba-fill-script | v9 | `dca7af78` |
| reshopper-draft | v2 | `cdb3cb0a` |
| vinted-fill-script | v38 | `d88d6182` |

## udgivelse-0003 — 2026-09-22 16:12

Commit `4611263` — Giv knapperne i en sektion luft, og laeg afstanden i systemet  
App: `app.js?v=8863fec1` · `style.css?v=3bce8da2`  
Udrullet: ingen funktioner (kun noteret)

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v48 | `5fe7fff8` |
| dba-fill-script | v9 | `dca7af78` |
| reshopper-draft | v2 | `cdb3cb0a` |
| vinted-fill-script | v38 | `d88d6182` |

## udgivelse-0002 — 2026-09-21 14:24

Commit `16b434c` — Loft appen: musetilstande, maalbredde, skelet - og sort tekst i moerkt tema  
App: `app.js?v=8c34e060` · `style.css?v=09e32b6c`  
Udrullet: ingen funktioner (kun noteret)

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v48 | `5fe7fff8` |
| dba-fill-script | v9 | `dca7af78` |
| reshopper-draft | v2 | `cdb3cb0a` |
| vinted-fill-script | v38 | `d88d6182` |

## udgivelse-0001 — 2026-09-21 14:03

Commit `291f980` — Giv udgivelserne historik, saa der altid er en vej tilbage  
App: `app.js?v=3ba9b506 · style.css?v=d02c611a`  
Udrullet: ingen funktioner (kun noteret)

| funktion | live | indhold |
|---|---|---|
| analyze-draft | v48 | `5fe7fff8` |
| dba-fill-script | v9 | `dca7af78` |
| reshopper-draft | v2 | `cdb3cb0a` |
| vinted-fill-script | v38 | `d88d6182` |
