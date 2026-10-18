# Redesign: faner, Opgaver, Lager, Konto og Mere

19. oktober 2026. Godkendt i samtalen, afsnit for afsnit. Skitserne ligger i
`.superpowers/brainstorm/79407-1792361367/content/` (ikke i git).

## Hvorfor

Appen er »rodet og uoverskuelig og ikke pæn«. Værst er Lager (forsiden)
og Prisvagt, Konto og Mere. Fundet sammen med dig:

- Lager skal først og fremmest give **overblik over varerne**. Opgaverne
  øverst skubbede varerne ned.
- På Prisvagt, Konto og Mere er der for meget tekst, det er uklart, hvad man
  skal gøre, alt ser ens ud, og ting, der hører sammen, står forskellige
  steder (prisforslag til godkendelse ≠ prisvagtens status).

Målet er, at hver fane har ét formål, der kan ses med det samme, og at
alt, der kræver et tryk fra dig, står ét sted.

## Det, der ikke ændres

- Paletten, temaerne (Som enheden / Lyst / Mørkt) og kontrastkravet 4,5:1
  fra 17. oktober. Skriften er Libre Franklin (udgivelse-0113).
- `fase()`, sorteringen, opgavernes regler og prioritet, prisvagtens
  regler, `godkendForslag`/`afvisForslag`, data og server. Det her er kun
  skærmene.
- Varens side og Redigér er ikke med i denne omgang.
- Ingen `object-fit: cover` på et annoncebillede.
- Ingen zoom og de korte klassenavne-regler (nye klasser får præfiks).

## Opbygning

Fire faner i bunden: **Lager · Opgaver · Konto · Mere**. Prisvagt er ikke
længere en fane. På computerskærmen (fra 960 px) er det de samme fire i
sidebjælken.

`RODER` bliver `{ queue, opgaver, konto, menu }`. Prisvagt-skærmen
(`s-vagt`) bliver en underskærm med tilbagepil, åbnet fra Mere.

## Trin 1 — Fanerne og Opgaver

- Ny skærm `#s-opgaver` og fane »Opgaver« med et tal: antal opgaver +
  antal prisforslag. Prisvagt-fanens knap og `fod-vagt-tal` fjernes; Mere
  beholder sit tal for opsætning, der er gået i stå.
- Opgaverne kommer fra den logik, `tegnOpgaver()` har i dag (samme
  slags, samme rækkefølge), men tegnes på Opgaver-skærmen som én liste —
  ikke »den vigtigste fremme + bånd«. `opg-baand` og opgaverne på Lager
  forsvinder.
- Listen, ovenfra:
  1. **Det akutte**: én række pr. opgave med en farvet kant i venstre side
     — rød for solgt, der skal tages ned andetsteds; rav for køber skriver,
     analysen fejlede, en rettelse der ikke er nået ud, ikke tilknyttet.
     Knapperne fra i dag følger med (»Taget ned«, »Kopiér svaret«, »Åbn
     samtalen«, »Klaret« …).
  2. **Prisforslag · N** med »Godkend alle« til højre. Én række pr.
     forslag: lille billede (44×58, `contain`), navn, begrundelsen på én
     linje (forkortet med »…«), × (afvis) og en knap med den nye pris
     (godkend). Et tryk på rækken åbner varen, hvor hele begrundelsen står.
  3. **Mangler salgspris** og de andre stille opgaver til sidst.
- Opgaver skal kende prisforslagene uden at Prisvagt-skærmen er åbnet:
  `listings` hentes, når Opgaver vises og når appen starter (til tallet
  på fanen).
- Tom tilstand: »Intet venter på dig« med et flueben.
- Indtil trin 3 åbnes Prisvagt-skærmen fra en række i Mere, så intet
  forsvinder undervejs.

## Trin 2 — Lager

- **Tal-felterne** erstatter fanerne Klar/Ude/Solgt: tre felter side om
  side med antal og en sum under — Klar: summen af de foreløbige priser;
  Ude: samlet udbudspris; Solgt: samlet salgspris (samme tal som Konto).
  Det valgte felt er mørkt (`--ink`-bund). Et tryk vælger fasen, som
  fanerne gør i dag.
- **Rækkerne** (erstatter kortene): ingen kasse, en tynd streg
  (`--line`) mellem rækkerne. Billede 72×96, `contain` på papirfarven.
  - Venstre, tre linjer, hver forkortet med »…«:
    1. Mærke · varetype
    2. Størrelse · farve · stand
    3. Løbenummeret (»#0069«, dæmpet) · »rettelse venter«, hvis der er
       én
  - Højre, stort og fedt, og en dæmpet linje under:
    - Klar: den foreløbige pris; under: intet. Er der ingen pris endnu,
      står »Analyserer …« eller »Kladde« i stedet for prisen.
    - Ude: prisen nu; under: »♥ 4 · 3 d«.
    - Solgt: salgsprisen; under: »12 d«. Mangler den: »tast salgsprisen«
      i rav i stedet for prisen.
  - Materialet står ikke længere i rækken — kun på varens side.
- Scan bliver øverst til højre; Nyt produkt bliver den svævende knap.
  Ingen søgning eller sortering (findes ikke i dag, ikke bedt om).
- Computerskærmen: rækkerne i to spalter i stedet for kortgitteret;
  tal-felterne fylder bredden.
- `CLAUDE.md` »Kortene i listen« skrives om til de nye regler i samme
  omgang.

## Trin 3 — Konto, Mere og Prisvagt

- **Mere**, ovenfra:
  - Prisvagtens kort: »Holder øje med N«, en lille status (»Kører« grøn /
    »Forsinket« rav, når annoncer har ventet over et døgn uden dagligt
    tjek), sidste tjek og om det daglige tjek er slået til, og knappen
    **Tjek priserne nu** (`VAGT_NU_URL`). Et tryk på kortet åbner
    Prisvagt-skærmen.
  - Rækker: Opsætning (undertekst: »Alt virker« / »N ting skal ses på« i
    rav — det, `tegnTjek` siger i dag), Etiketter, Køb igen, Udseende, Log
    ud (rød tekst).
  - Versionslinjen nederst som i dag.
- **Prisvagt-skærmen** (underskærm): statuskortet, »Ny pris på vej«,
  »Holder øje«, »Rører ikke prisen«. Ingen »Til godkendelse« (bor i
  Opgaver). Hver gruppes forklaring er én linje. Mindstepris, pause og
  »Svar en køber« bliver i deres fold pr. annonce.
- **Konto**: »Omsætning i alt« som ét stort tal; under det én linje med
  antal salg, gennemsnit og AI-udgift (»ca. 96 kr brugt på AI«); søjler for
  seks måneder (indeværende måned i accent, resten `--accent-soft`); så
  rækker med streger: ude nu (antal · kr), tid til salg, salgspris af
  udbud, denne og sidste måned; så mest favoritmarkerede og alle salg (med
  link til varen). Noten om DBA/Reshopper bliver én dæmpet linje. Intet
  indhold fra i dag forsvinder.

## Udseendet på alle fire faner

- Kort med skygge kun dér, hvor noget skal løftes frem (prisvagtens kort i
  Mere, tal-felterne, en opgave med farvet kant). Ellers lister med tynde
  streger.
- Højst én farvet (accent) knap pr. skærm; resten stille knapper eller
  links.
- Forklaringer er én linje; længere vejledninger foldes ind.
- Overskrifter over en gruppe: `.label` (lille, halvfed, almindelig
  skrift).

## Afprøvning, pr. trin

- Prøvesiden (`sh tools/proeve.sh`, preview »app«) i 375 px og 1280 px, i
  lyst og mørkt tema. Mål tekst og farver med `read_page`/JavaScript,
  skærmbillede kun til det visuelle.
- Trin 1: godkend, afvis og »Godkend alle« på prøvesiden (mock'en svarer;
  intet sendes), og at fanens tal passer.
- `node tools/check-runner.mjs …` og `./build.sh` før hver commit, så
  `./tools/udgiv.sh`.
- Du prøver trinnet på telefonen, før det næste går i gang. Et trin, der
  ikke holder, rulles tilbage alene (`./tools/tilbage.sh udgivelse-NNNN
  app`).

## Kendt fra undersøgelsen

- De »53 ting, der venter« fandtes kun på prøvesiden: i databasen er alle
  54 annoncer tilknyttet. I den rigtige app er Opgaver normalt kort —
  prøvesidens mock bør ikke bruges til at bedømme, hvor lang listen bliver.
