---
paths:
  - "proeve.html"
  - "proeve/**"
  - "tools/proeve.sh"
  - "tools/proeve-mock.js"
---
# Afprøvning

Flyttet ordret fra CLAUDE.md 2026-10-22. »Dine beslutninger → X« og »Målt, ikke gættet → X« peger på afsnittet X
i en af regelfilerne (se tabellen i CLAUDE.md). Hvert målt fund kostede en fejlsøgning; lav det ikke om uden at måle igen.

## Afprøvning

**Udløs analysen som appen gør det: sæt `status` til `afventer`** og vent på, at
den bliver `ny`. Kald ikke `analyze-draft` manuelt oveni — triggeren har
allerede fyret, og to samtidige gennemløb slås om det samme arbejde. Det kostede
en fejlagtig konklusion om, at pipelinen tog tre minutter; et rent gennemløb
med fem billeder tager omkring 25 sekunder.

Browserruden throttler timere, når den er skjult: et gennemløb, der tager 40 s
på telefonen, kan tage flere minutter her. Tiderne i loggen er derfor ikke
retvisende — kun rækkefølgen og udfaldet er.

**Appen indlogget i browserruden uden adgangskoden: `sh tools/proeve.sh`**
og så `http://localhost:8765/proeve.html` (preview »app«). Den henter
rigtige rækker (kun læst) og svarer selv på alle kald til Supabase, så
intet sendes og intet gemmes. »Køb igen« får et fast eksempel
(`INDKOB` i `tools/proeve-mock.js`) — serverens svar kalder en model.
Mock'en kan fejle (`window.__proeveFejl`), være langsom
(`window.__proeveVent`, eller `localStorage` `proeveVent` til en
genindlæsning), og en PATCH lægges i dens hukommelse, så en genhentning
ser den. Mock'en giver kun de felter i en indlejret `listings(…)`, appen beder om (19. oktober: før gav den alle, og at `draft_id` manglede i `ANNONCE_FELTER`, skjulte den — løbenummeret på mærkatet virkede kun i prøve-appen). Et felt, appen læser på en annonce, skal stå i `ANNONCE_FELTER`. `window.__proeveData` er mock'ens data — læg fx en
køberbesked i `koeber_beskeder` og send `visibilitychange`, så henter
appen igen. Appens service worker serverer gammel CSS på
localhost: afregistrér den i ruden, hvis en ændring ikke slår igennem.

`window.__UDBAKKE_LOG__` i browseren viser hvert trin. Kør automatikken sådan:

```js
window.__UDBAKKE_API__='<API>?key=<SHORTCUT_KEY>';
var x=new XMLHttpRequest();
x.open('GET', window.__UDBAKKE_API__+'&script=1'); x.onload=function(){(0,eval)(x.responseText)}; x.send();
```

Automatisk tilstand svarer kun, når `selected_at` er sat inden for 30 minutter —
det sker, når appens knap "Udfyld i Vinted" trykkes. Til afprøvning: sæt
`selected_at` på udkastet først, ellers får du `{"empty":true}`.

**Runnerens trin står i tabellen `spor` (`mode:'spor'`).**
Garderobe-kald, foer-nummeret, at formularen forsvandt, når fanen skjules og
vises igen, hvad vagten så, søgningen og prisens udfald (»pris: …«). Slå op
dér, før der gættes på, hvorfor en annonce ikke blev tilknyttet eller ikke
fik en markedspris: `select tid, sti, tekst from spor order by tid desc`.
**Funktionens log taber linjer** — 8. oktober manglede hentningen af både
script og udkast for nr. 49, som beviseligt skete — så en linje, der mangler
i `function_logs`, beviser intet.
