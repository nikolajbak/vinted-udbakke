#!/bin/sh
# Skifter klientnoeglen (SHORTCUT_KEY) til en ny. Den gamle virker videre i
# DAGE dage (standard 14), saa brugerscripter og bogmaerker ikke staar af;
# imens viser de et baand, der sender dig til Opsaetning i appen, hvor du
# installerer igen (_shared/noegle.ts, nyNoegleVarsel). Appen henter selv den
# nye efter login (klientnoegle(), sql/028).
#
#   sh tools/skift-noegle.sh [DAGE]
#
# Koeres af dig, ikke af Claude: noegleskift er dit (CLAUDE.md).
set -e
cd "$(dirname "$0")/.."
set -a; . ./.env.secrets; set +a
DAGE=${1:-14}
GAMMEL=$SHORTCUT_KEY
NY=$(openssl rand -hex 16)
TIL=$(date -u -v+"${DAGE}"d +%Y-%m-%dT%H:%M:%SZ)
REF=gjycsqshkvkcupdnvgvf
API="https://$REF.supabase.co/functions/v1/vinted-fill-script"
P="host=aws-0-eu-central-1.pooler.supabase.com port=6543 dbname=postgres user=postgres.$REF sslmode=require"

# 1) Funktionerne foerst: de kender begge noegler, foer nogen faar den nye.
supabase secrets set --project-ref "$REF" \
  SHORTCUT_KEY="$NY" SHORTCUT_KEY_GAMMEL="$GAMMEL" SHORTCUT_KEY_GAMMEL_TIL="$TIL" >/dev/null

# 2) Vault: SQL'ens egne kald og appen (klientnoegle()) faar den nye.
PGPASSWORD="$SUPABASE_DB_PASSWORD" /opt/homebrew/opt/libpq/bin/psql "$P" -q -v ny="$NY" \
  -c "select vault.update_secret(id, :'ny') from vault.secrets where name = 'shortcut_key'" >/dev/null

# 3) Lokalt.
sed -i '' "s/^SHORTCUT_KEY=.*/SHORTCUT_KEY=$NY/" .env.secrets

# Nye instanser laeser de nye secrets; giv dem et ojeblik.
sleep 20
ny=$(curl -s -o /dev/null -w '%{http_code}' "$API/udbakke.meta.js?key=$NY")
gl=$(curl -s -o /dev/null -w '%{http_code}' "$API/udbakke.meta.js?key=$GAMMEL")
echo "Ny noegle: $ny (skal vaere 200) · gammel noegle paa brugerscriptet: $gl (skal vaere 401)"
echo "Den gamle virker til $TIL. Installér brugerscripterne igen fra appens Opsaetning."
