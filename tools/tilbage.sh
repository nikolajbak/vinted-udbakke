#!/bin/sh
# Vender tilbage til en tidligere udgivelse.
#
# Aldrig ved at skrive historien om. Der rulles FREMAD til gammelt indhold: et
# nyt commit, en ny udgivelse, og en note der siger hvorfra. Saa kan man ogsaa
# fortryde selve tilbagerulningen.
#
#   ./tools/tilbage.sh                                  # se listen
#   ./tools/tilbage.sh udgivelse-0003                   # det hele
#   ./tools/tilbage.sh udgivelse-0003 dba-fill-script   # kun den ene funktion
#   ./tools/tilbage.sh udgivelse-0003 app               # kun PWAen
#
set -e
cd "$(dirname "$0")/.."

PROJEKT=gjycsqshkvkcupdnvgvf
FUNKTIONER="analyze-draft dba-fill-script reshopper-draft vinted-fill-script"
APPFILER="index.html style.css app.js"

[ -f .env.secrets ] || { echo "Mangler .env.secrets"; exit 1; }
set -a; . ./.env.secrets; set +a

tag="$1"
if [ -z "$tag" ]; then
  echo "Udgivelser (nyeste nederst):"
  git tag -l 'udgivelse-*' | sort | while read -r t; do
    printf '  %-16s %s  %s\n' "$t" \
      "$(git log -1 --format=%ad --date=short "$t")" \
      "$(git tag -l --format='%(contents:subject)' "$t")"
  done
  echo
  echo "Vend tilbage:  ./tools/tilbage.sh <tag> [app|<funktion> …]"
  exit 0
fi

git rev-parse -q --verify "refs/tags/$tag" >/dev/null 2>&1 || {
  echo "Kender ikke '$tag'. Koer ./tools/tilbage.sh uden argumenter for listen."
  exit 1; }

gren=$(git rev-parse --abbrev-ref HEAD)
[ "$gren" = main ] || { echo "Du staar paa '$gren'. Tilbagerulning sker paa main."; exit 1; }
if [ -n "$(git status --porcelain)" ]; then
  echo "Traeet er ikke rent. Commit eller kassér dine aendringer foerst:"
  git status --short
  exit 1
fi

shift
maal="$*"
[ -n "$maal" ] || maal="app $FUNKTIONER"

# Appen hoerer sammen: index.html baerer stemplet for app.js og style.css, og
# tages de ikke med samlet, serverer Pages ny HTML med gammel JS.
udrul=""
for m in $maal; do
  if [ "$m" = app ]; then
    for f in $APPFILER; do
      git cat-file -e "$tag:$f" 2>/dev/null || { echo "$f fandtes ikke i $tag."; exit 1; }
    done
    git checkout "$tag" -- $APPFILER
  else
    [ -d "supabase/functions/$m" ] || { echo "Kender ikke '$m'."; exit 1; }
    git cat-file -e "$tag:supabase/functions/$m" 2>/dev/null || {
      echo "$m fandtes ikke i $tag — springer over."; continue; }
    if git diff --quiet "$tag" HEAD -- "supabase/functions/$m"; then
      echo "$m er allerede som i $tag."
      continue
    fi
    git checkout "$tag" -- "supabase/functions/$m"
    udrul="$udrul $m"
  fi
done

if [ -z "$(git status --porcelain)" ]; then
  echo "Intet at rulle tilbage — alt er allerede som i $tag."
  exit 0
fi

echo "Ruller tilbage til $tag:"
git status --short

node tools/check-runner.mjs supabase/functions/*/runner.ts

git add -A
git commit -q -m "Rul tilbage til $tag

Indholdet er hentet fra $tag og lagt oven paa som et nyt commit. Historien
staar uroert, saa selve tilbagerulningen kan ogsaa fortrydes."

for f in $udrul; do
  echo "Udruller $f …"
  npx --yes supabase@latest functions deploy "$f" --project-ref "$PROJEKT" >/dev/null
done

echo "Kontrollerer at live svarer til git …"
python3 tools/tjek-live.py $udrul

n=$(git tag -l 'udgivelse-*' | wc -l | tr -d ' ')
nytag=$(printf 'udgivelse-%04d' $((n + 1)))

UDGIVELSE_ANLEDNING="Tilbagerulning til \`$tag\` ($maal)." \
  python3 tools/udgivelse-note.py "$nytag" $udrul
git add UDGIVELSER.md
git commit -q --amend --no-edit
git tag -a "$nytag" -m "Tilbagerulning til $tag${udrul:+ — $udrul}"
git push -q origin main --follow-tags

echo
echo "Rullet tilbage til $tag. Det staar som $nytag."
