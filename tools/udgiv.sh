#!/bin/sh
# Udgiver — og skriver ned hvad der blev udgivet, saa der altid er en vej tilbage.
#
# Uden det her er der intet, der forbinder "dba-fill-script v9" med et commit.
# Supabase gemmer et versionsnummer og ingen kilde, og `functions deploy` sender
# det, der tilfaeldigvis ligger i arbejdstraeet — ogsaa ukommitteret arbejde.
# Derfor naegter scriptet at udgive fra et snavset trae: en udgivelse, der ikke
# svarer til et commit, kan ikke rulles tilbage.
#
#   ./tools/udgiv.sh                     # udgiv det, der er aendret siden sidst
#   ./tools/udgiv.sh dba-fill-script     # udgiv kun den ene, uanset aendringer
#
set -e
cd "$(dirname "$0")/.."

PROJEKT=gjycsqshkvkcupdnvgvf
FUNKTIONER="analyze-draft dba-fill-script reshopper-draft vinted-fill-script"

[ -f .env.secrets ] || { echo "Mangler .env.secrets"; exit 1; }
set -a; . ./.env.secrets; set +a

gren=$(git rev-parse --abbrev-ref HEAD)
[ "$gren" = main ] || { echo "Du staar paa '$gren'. Udgivelser sker fra main."; exit 1; }

if [ -n "$(git status --porcelain)" ]; then
  echo "Traeet er ikke rent — og en udgivelse, der ikke svarer til et commit,"
  echo "kan ikke rulles tilbage. Commit foerst:"
  git status --short
  exit 1
fi

# Stemplet skal passe til filerne. Gjorde det ikke det, ville opdaterings-
# banneret tie, og GitHub Pages kunne servere ny HTML med gammel JS.
for f in style.css app.js; do
  h=$(shasum "$f" | cut -c1-8)
  grep -q "$f?v=$h\"" index.html || {
    echo "index.html peger ikke paa den nuvaerende $f."
    echo "Koer ./build.sh, commit, og proev igen."
    exit 1; }
done

echo "Tjekker runnerne …"
node tools/check-runner.mjs supabase/functions/*/runner.ts

sidste=$(git tag -l 'udgivelse-*' | sort | tail -1)

# Hvad skal med? Enten det, du peger paa, eller det, der er aendret siden sidst.
if [ $# -gt 0 ]; then
  udrul="$*"
  for f in $udrul; do
    [ -d "supabase/functions/$f" ] || { echo "Kender ikke funktionen '$f'."; exit 1; }
  done
elif [ -z "$sidste" ]; then
  # Foerste gang: der er ikke noget at sammenligne med, og fire udrulninger af
  # uaendret kode ville kun bumpe versionsnumrene. Vi noterer udgangspunktet.
  udrul=""
  echo "Ingen tidligere udgivelse — noterer det nuvaerende som udgangspunkt."
else
  udrul=""
  for f in $FUNKTIONER; do
    git diff --quiet "$sidste" HEAD -- "supabase/functions/$f" || udrul="$udrul $f"
  done
fi

if [ -n "$sidste" ] && [ -z "$udrul" ] && [ $# -eq 0 ]; then
  if git diff --quiet "$sidste" HEAD -- index.html style.css app.js; then
    echo "Intet nyt siden $sidste."
    exit 0
  fi
  echo "Kun appen er aendret — ingen funktioner at udrulle."
fi

# Herfra og frem kan en afbrydelse efterlade noget halvt: udrullet, men ikke
# maerket. Vaerktoejet her bliver hentet frem, naar noget braender — saa skal
# det ogsaa sige, hvor man staar, hvis det selv gaar ned.
halvt() {
  echo
  echo "Afbrudt undervejs. Der er ikke sat maerke, og der er ikke pushet."
  echo "  Hvor naaede den til:     git log --oneline -3; git status --short"
  echo "  Hvad koerer der faktisk: python3 tools/tjek-live.py"
}
trap halvt EXIT

for f in $udrul; do
  echo "Udruller $f …"
  npx --yes supabase@latest functions deploy "$f" --project-ref "$PROJEKT" >/dev/null
done

# Kontrollen gaar mod det, der faktisk udleveres — ikke mod det, vi sendte.
# En udgivelse, der halvvejs lykkedes, ser ud som ingenting herfra.
echo "Kontrollerer at live svarer til git …"
python3 tools/tjek-live.py $udrul

n=$(git tag -l 'udgivelse-*' | wc -l | tr -d ' ')
tag=$(printf 'udgivelse-%04d' $((n + 1)))

python3 tools/udgivelse-note.py "$tag" $udrul
git add UDGIVELSER.md
git commit -q -m "Udgivelse $tag"
git tag -a "$tag" -m "Udgivelse $tag${udrul:+ — $udrul}"
git push -q origin main --follow-tags

# Herfra kan intet gaa tabt: der er pushet og maerket. Resten er bekraeftelse,
# og en vrangvillig Pages maa ikke faa udgivelsen til at se afbrudt ud.
trap - EXIT
echo
sh tools/vent-paa-pages.sh || pages=nej

echo
echo "$tag er ude.${udrul:+ Udrullet:$udrul}"
[ "${pages:-ja}" = ja ] || echo "OBS: appen er IKKE bekraeftet live paa Pages — se beskeden ovenfor."
echo "Tilbage hertil senere:  ./tools/tilbage.sh $tag"
