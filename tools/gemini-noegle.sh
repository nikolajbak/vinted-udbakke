#!/bin/sh
# Laegger Gemini-noeglen fra udklipsholderen ind som GEMINI_API_KEY i
# Supabase og i .env.secrets. Kopiér noeglen fra aistudio.google.com/apikey
# (et projekt UDEN fakturering — ellers er det ikke gratis), og koer:
#   sh tools/gemini-noegle.sh
set -e
cd "$(dirname "$0")/.."
NOEGLE=$(pbpaste | tr -d '[:space:]')
# Ingen kontrol af formatet: om det er en noegle, afgoer Gemini selv herunder.
[ -n "$NOEGLE" ] || { echo "Udklipsholderen er tom — kopiér noeglen fra aistudio.google.com/apikey først."; exit 1; }
[ ${#NOEGLE} -le 200 ] || { echo "Udklipsholderen indeholder for meget tekst — kopiér kun noeglen."; exit 1; }

# Virker den? Listen over modeller svarer kun med en gyldig noegle.
SVAR=$(curl -s -o /dev/null -w "%{http_code}" -H "x-goog-api-key: $NOEGLE" \
  "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1")
[ "$SVAR" = "200" ] || { echo "Gemini afviste det, der ligger i udklipsholderen (HTTP $SVAR). Er det noeglen, der er kopieret?"; exit 1; }

set -a; . ./.env.secrets; set +a
printf 'GEMINI_API_KEY=%s\n' "$NOEGLE" > /tmp/gemini-secret.$$
npx --yes supabase@latest secrets set --env-file /tmp/gemini-secret.$$ --project-ref gjycsqshkvkcupdnvgvf >/dev/null
rm -f /tmp/gemini-secret.$$

grep -v '^GEMINI_API_KEY=' .env.secrets > .env.secrets.ny || true
printf 'GEMINI_API_KEY=%s\n' "$NOEGLE" >> .env.secrets.ny
mv .env.secrets.ny .env.secrets && chmod 600 .env.secrets
printf '' | pbcopy
echo "Faerdig: GEMINI_API_KEY er lagt i Supabase og .env.secrets, og udklipsholderen er tømt."
