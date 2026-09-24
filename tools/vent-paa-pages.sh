#!/bin/sh
# Venter paa at GitHub Pages faktisk har udgivet det commit, vi lige pushede.
#
# Et groent udgiv.sh betoed foer "pushet og maerket" — ikke "live". 22.
# september stod et commit paa main i 25 minutter uden at Pages saa meget som
# satte et byg i koe. Pages meldte sig "operational"; bygget blev bare aldrig
# udloest. Et enkelt POST satte det i gang, og saa var det faerdigt paa under
# et minut. Uden det her siger scriptet "er ude" om noget, ingen kan se.
#
# To ting tjekkes, for de er ikke det samme:
#   1. At Pages har BYGGET vores commit.
#   2. At siden faktisk UDLEVERER de stempler, index.html baerer. Et byg kan
#      vaere faerdigt, mens kanten stadig har den gamle HTML.
#
# Slaar aldrig udgivelsen ihjel: naar vi er her, er der pushet og maerket, og
# det staar ved magt uanset hvad Pages finder paa. Exit 1 betyder "ikke
# bekraeftet live", ikke "udgivelsen mislykkedes".
set -e
cd "$(dirname "$0")/.."

# Kan skrues ned under afproevning.
RUNDER=${PAGES_RUNDER:-40}
PAUSE=${PAGES_PAUSE:-10}
SKUB_EFTER=${PAGES_SKUB_EFTER:-9}
KANT_RUNDER=${PAGES_KANT_RUNDER:-12}
KANT_PAUSE=${PAGES_KANT_PAUSE:-5}

sha=$(git rev-parse HEAD)
kort=$(git rev-parse --short HEAD)

# Repoet laeses af remoten, saa scriptet ikke lyver, hvis den skifter.
slug=$(git remote get-url origin 2>/dev/null | sed -E 's|.*github\.com[:/]||; s|\.git$||')
case "$slug" in
  */*) ;;
  *) echo "  Pages: kunne ikke udlede repoet af origin — springer over."; exit 0 ;;
esac

if ! command -v gh >/dev/null 2>&1; then
  echo "  Pages: gh findes ikke, saa bygget kan ikke foelges."
  echo "         Tjek selv:  gh api repos/$slug/pages/builds --jq '.[0].commit'"
  exit 0
fi

seneste() {
  gh api "repos/$slug/pages/builds" \
    --jq '.[0] | "\(.status)|\(.commit)|\(.error.message // "")"' 2>/dev/null || echo "ukendt||"
}

echo "Venter paa at Pages udgiver $kort …"
skubbet=nej
bygget=nej
i=0
while [ "$i" -lt "$RUNDER" ]; do
  linje=$(seneste)
  status=${linje%%|*}
  rest=${linje#*|}
  commit=${rest%%|*}
  fejl=${rest#*|}

  if [ "$commit" = "$sha" ]; then
    case "$status" in
      built)   bygget=ja; break ;;
      errored) echo "  Pages-bygget FEJLEDE: ${fejl:-ingen besked}"; exit 1 ;;
    esac
  fi

  # Sker der ingenting, saetter vi selv bygget i koe. Det er praecis det greb,
  # der loeste det 22. september.
  if [ "$skubbet" = nej ] && [ "$i" -ge "$SKUB_EFTER" ] \
     && [ "$status" != building ] && [ "$status" != queued ]; then
    echo "  Pages har intet byg i koe — beder om et."
    gh api -X POST "repos/$slug/pages/builds" >/dev/null 2>&1 || true
    skubbet=ja
  fi

  i=$((i + 1))
  sleep "$PAUSE"
done

if [ "$bygget" != ja ]; then
  echo "  Pages byggede ikke $kort inden for $((RUNDER * PAUSE)) s."
  echo "         Foelg med:  gh api repos/$slug/pages/builds --jq '.[0]|\"\(.status) \(.commit[0:7])\"'"
  echo "         Skub paa:   gh api -X POST repos/$slug/pages/builds"
  exit 1
fi
echo "  Pages har bygget $kort."

# Bygget er ikke det samme som udleveret.
url=$(gh api "repos/$slug/pages" --jq .html_url 2>/dev/null || echo "")
[ -n "$url" ] || exit 0
stempler() { grep -o -E '(style\.css|app\.js)\?v=[0-9a-f]+' | sort | tr '\n' ' '; }
forventet=$(stempler < index.html)
[ -n "$forventet" ] || exit 0

j=0
while [ "$j" -lt "$KANT_RUNDER" ]; do
  live=$(curl -sS --max-time 15 "$url" 2>/dev/null | stempler || echo "")
  if [ "$live" = "$forventet" ]; then
    echo "  Live udleverer: $forventet"
    exit 0
  fi
  j=$((j + 1))
  sleep "$KANT_PAUSE"
done

echo "  Pages har bygget, men udleverer stadig noget andet:"
echo "         live:      ${live:-intet svar}"
echo "         forventet: $forventet"
exit 1
