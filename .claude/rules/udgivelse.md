---
paths:
  - "tools/udgiv.sh"
  - "tools/tilbage.sh"
  - "tools/vent-paa-pages.sh"
  - "tools/tjek-live.py"
  - ".github/workflows/**"
---
# Udgivelsen og GitHub Pages

Flyttet fra CLAUDE.md 2026-10-22, ordret.

## GitHub Pages under udgivelsen

**Til sidst venter `udgiv.sh` på, at GitHub Pages faktisk har udgivet
commit'et.** Et grønt `udgiv.sh` betød før "pushet og mærket", ikke "live" —
og 22. september stod et commit på `main` i 25 minutter, uden at Pages så
meget som satte et byg i kø. Pages meldte sig "operational"; bygget blev bare
aldrig udløst, og ét `POST .../pages/builds` satte det i gang på under et
minut. Sker det igen, skubber scriptet selv på efter halvandet minut. Den
tjekker to ting, for de er ikke det samme: at Pages har **bygget** commit'et,
og at siden faktisk **udleverer** de stempler, `index.html` bærer — et byg kan
være færdigt, mens kanten stadig har den gamle HTML. Et Pages-problem vælter
aldrig udgivelsen; når vi er der, er der pushet og mærket.

**Et fejlet Pages-byg er som regel ikke en fejl i koden.** 30. september
fejlede fem byg i træk på under et sekund med »Page build failed« og ingen
forklaring — også et commit, der kun tilføjede tekst til `CLAUDE.md`.
`.nojekyll` ændrede intet. Efter elleve minutters ro byggede det samme commit
på 26 sekunder. Pages vil ikke bygge så tæt, når der har været mange
udgivelser lige efter hinanden. `vent-paa-pages.sh` venter derfor og beder om
ét byg til, i stedet for at melde udgivelsen død — og et byg, der fejler, skal
ikke få nogen til at lede efter fejlen i det, der blev skrevet.

**Se GitHubs status, før der skubbes på igen.** 19. oktober (udgivelse-0141) fejlede ét byg efter et andet, og bygget stod derefter i kø i over 20 minutter: GitHub meldte »Degraded availability for GitHub Actions, GitHub Pages and Webhooks« (`curl -s https://www.githubstatus.com/api/v2/summary.json`). Et `POST …/pages/builds` hvert andet minut afbrød bare det forrige (»cancelled«); bygget i kø kommer af sig selv, når GitHub er oppe igen.
