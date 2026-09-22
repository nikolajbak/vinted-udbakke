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
