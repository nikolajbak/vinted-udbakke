#!/bin/sh
# Skifter klientnoeglen (SHORTCUT_KEY) til en ny. Den gamle virker videre i
# DAGE dage (standard 14), saa brugerscripter og bogmaerker ikke staar af;
# imens viser de et baand, der sender dig til Opsaetning i appen, hvor du
# installerer igen (_shared/noegle.ts, nyNoegleVarsel). Appen henter selv den
# nye efter login (klientnoegle(), sql/028).
#
#   sh tools/skift-noegle.sh [-f] [DAGE]
#
# Koeres af dig, ikke af Claude: noegleskift er dit (CLAUDE.md).
set -e
cd "$(dirname "$0")/.."
set -a; . ./.env.secrets; set +a
DAGE=${1:-14}
# En ny koersel i overgangen goer den nyss udleverede noegle til den gamle,
# og den oprindelige, som brugerscripterne baerer, holder op med at virke
# (3. november: koert to gange efter hinanden). Derfor kun, naar overgangen
# er ovre, eller med -f.
if [ "$1" != "-f" ] && [ -n "${SHORTCUT_KEY_GAMMEL_TIL:-}" ] \
   && [ "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \< "$SHORTCUT_KEY_GAMMEL_TIL" ]; then
  echo "Noeglen blev skiftet for nylig; den gamle virker til $SHORTCUT_KEY_GAMMEL_TIL. Intet aendret (-f tvinger)."
  exit 1
fi
[ "$1" = "-f" ] && DAGE=${2:-14}
GAMMEL=$SHORTCUT_KEY
NY=$(openssl rand -hex 16)
TIL=$(date -u -v+"${DAGE}"d +%Y-%m-%dT%H:%M:%SZ)
REF=gjycsqshkvkcupdnvgvf
API="https://$REF.supabase.co/functions/v1/vinted-fill-script"
P="host=aws-0-eu-central-1.pooler.supabase.com port=6543 dbname=postgres user=postgres.$REF sslmode=require"

PSQL() { PGPASSWORD="$SUPABASE_DB_PASSWORD" /opt/homebrew/opt/libpq/bin/psql "$P" -qAt -v ON_ERROR_STOP=1 -v ny="$NY" "$@"; }
# psql udfylder kun :'ny' i SQL fra stdin, ikke i -c (3. november: scriptet
# stoppede efter trin 1, og den nye noegle gik tabt). Proev derfor forbindelsen
# og variablen, foer noget skrives.
[ "$(echo "select length(:'ny')" | PSQL)" = 32 ] || { echo "psql-tjekket fejlede; intet er aendret."; exit 1; }

# 1) Funktionerne foerst: de kender begge noegler, foer nogen faar den nye.
supabase secrets set --project-ref "$REF" \
  SHORTCUT_KEY="$NY" SHORTCUT_KEY_GAMMEL="$GAMMEL" SHORTCUT_KEY_GAMMEL_TIL="$TIL" >/dev/null

# 2) Vault: SQL'ens egne kald og appen (klientnoegle()) faar den nye.
echo "select vault.update_secret(id, :'ny') from vault.secrets where name = 'shortcut_key'" | PSQL >/dev/null

# 3) Lokalt.
sed -i '' "s/^SHORTCUT_KEY=.*/SHORTCUT_KEY=$NY/" .env.secrets
grep -q '^SHORTCUT_KEY_GAMMEL_TIL=' .env.secrets \
  && sed -i '' "s/^SHORTCUT_KEY_GAMMEL_TIL=.*/SHORTCUT_KEY_GAMMEL_TIL=$TIL/" .env.secrets \
  || echo "SHORTCUT_KEY_GAMMEL_TIL=$TIL" >> .env.secrets

# Nye instanser laeser de nye secrets; giv dem et ojeblik.
sleep 20
ny=$(curl -s -o /dev/null -w '%{http_code}' "$API/udbakke.meta.js?key=$NY")
gl=$(curl -s -o /dev/null -w '%{http_code}' "$API/udbakke.meta.js?key=$GAMMEL")
echo "Ny noegle: $ny (skal vaere 200) · gammel noegle paa brugerscriptet: $gl (skal vaere 401)"
echo "Den gamle virker til $TIL. Installér brugerscripterne igen fra appens Opsaetning."
