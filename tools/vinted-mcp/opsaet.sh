#!/bin/sh
# Bygger Vinted-MCP'en til Claude-sessioner: andrijdavid/vinted-mcp på et fast commit
# med marked.patch oven på. Kan køres igen. Selve tilmeldingen til Claude Code
# skriver scriptet ud til sidst; den kører du selv.
# npm-udgaven (0.1.2) er fra før Vinted flyttede søgningen, så den bygges fra kilden.
set -eu
UPSTREAM=992d476
HER=$(cd "$(dirname "$0")" && pwd)
ROD="$HOME/.local/share/vinted-mcp"
KODE="$ROD/kode"
mkdir -p "$ROD"
[ -d "$KODE/.git" ] || git clone -q https://github.com/andrijdavid/vinted-mcp.git "$KODE"
cd "$KODE"
git fetch -q origin
git checkout -q -f "$UPSTREAM"
git clean -qfd -e node_modules -e dist
git -c user.name=opsaet -c user.email=opsaet@localhost am -q "$HER/marked.patch"
npm install --ignore-scripts --no-audit --no-fund --silent
npx --yes esbuild src/bin/cli.ts --bundle --platform=node --target=node22 --outfile=dist/bundle.js --log-level=warning
echo "Bygget: $KODE/dist/bundle.js"
echo "Tilmeld den: claude mcp add -s user -e VINTED_AUTH_MODE=http vinted-marked -- node \"$KODE/dist/bundle.js\""
