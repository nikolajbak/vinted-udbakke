# VintedAuto: projektbeskrivelse

Designet af Nikolaj Bak og bygget sammen med Claude Code som kodeassistent. Del af en portefølje på otte systemer
bygget fra september til november 2026.

- Egen app (PWA), der laver salgsannoncer til Vinted, DBA og Reshopper ud fra billeder af varen
- Billedanalyse med AI bestemmer kategori, mærke, størrelse, stand, farve og materiale og skriver annonceteksten; billederne roteres, beskæres og ensrettes automatisk
- Udfylder markedspladsernes annonceformularer automatisk fra telefonen
- Læser Vinteds mails med en sprogmodel (salg, bud, beskeder, forsendelse) og gør dem til opgaver i appen; prisvagt og prisforslag
- Modelstrategi med Geminis gratisniveau først og Claude som reserve, valgt pr. trin uden ny udgivelse og med måling af forbrug
- Teknik: JavaScript-PWA på GitHub Pages, Supabase edge-funktioner (Deno/TypeScript), Postgres, pg_cron, push-notifikationer, automatiske tests
- 153 nummererede udgivelser med mulighed for tilbagerulning; i brug til eget salg
- 463 commits fra september til oktober 2026

Teksten spejler afsnittet Projekter i `profil/fakta.md` i `nikolajbak/jobsoegning`, som er sandhedskilden til
ansøgninger. Ændres projektet væsentligt, så ret begge steder (status pr. 2026-11-02).
