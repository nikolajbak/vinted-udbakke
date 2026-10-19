#!/bin/sh
# Prøveside til at se appen indlogget i browserruden uden adgangskoden:
# rigtige rækker fra databasen (kun læst), og fetch til Supabase svarer
# lokalt (tools/proeve-mock.js). Intet sendes ud, intet skrives.
#   sh tools/proeve.sh  →  preview "app" → http://localhost:8765/proeve.html
# Appens service worker gemmer gammel CSS/JS på localhost: afregistrér den
# i ruden, hvis ændringer ikke slår igennem.
set -e
cd "$(dirname "$0")/.."
set -a; . ./.env.secrets; set +a
P="host=aws-0-eu-central-1.pooler.supabase.com port=6543 dbname=postgres user=postgres.gjycsqshkvkcupdnvgvf sslmode=require"
mkdir -p proeve
for t in drafts listings price_events puls forbrug laerdomme annoncering; do
  PGPASSWORD="$SUPABASE_DB_PASSWORD" /opt/homebrew/opt/libpq/bin/psql "$P" -At \
    -c "select coalesce(json_agg(x),'[]') from (select * from $t order by 1 desc limit 80) x" > proeve/$t.json
done
cp tools/proeve-mock.js proeve/mock.js
t=$(date +%s)
sed -e "s|<script src=\"https://cdn.jsdelivr.net|<script src=\"proeve/mock.js?v=$t\"></script><script src=\"https://cdn.jsdelivr.net|" \
    -e "s#style.css?v=[a-z0-9]*#style.css?v=$t#" -e "s#app.js?v=[a-z0-9]*#app.js?v=$t#" index.html > proeve.html
echo "proeve.html klar"
