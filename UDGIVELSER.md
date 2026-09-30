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
