#!/bin/sh
# Stempler et indholds-fingeraftryk ind i link/script-adresserne.
#
# To ting afhaenger af det. Opdaterings-banneret sammenligner index.html's
# ETag; uden stemplet ville en rettelse i app.js ikke aendre index.html, og
# banneret ville tie. Og GitHub Pages cacher hver fil for sig i ti minutter,
# saa en browser kunne faa ny HTML med gammel JS. Skifter adressen, kan den
# ikke.
set -e
cd "$(dirname "$0")"
for f in style.css app.js; do
  h=$(shasum "$f" | cut -c1-8)
  sed -i '' -E "s|($f)(\?v=[0-9a-f]+)?\"|\1?v=$h\"|" index.html
done
grep -o -E '(style\.css|app\.js)\?v=[0-9a-f]+' index.html
