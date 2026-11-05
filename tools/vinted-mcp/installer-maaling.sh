#!/bin/sh
# Lægger den daglige måling i launchd (07:30 lokal tid; sover Mac'en, kører den ved opvågning). Kan køres igen.
set -eu
HER=$(cd "$(dirname "$0")" && pwd)
ROD="$HOME/.local/share/vinted-mcp"
NAVN=dk.nikolajbak.vinted-maaling
PLIST="$HOME/Library/LaunchAgents/$NAVN.plist"
NODE=$(command -v node)
mkdir -p "$ROD"
cat > "$PLIST" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$NAVN</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$HER/maal.mjs</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>$ROD/maal.log</string>
  <key>StandardErrorPath</key><string>$ROD/maal.log</string>
</dict></plist>
P
launchctl bootout "gui/$(id -u)/$NAVN" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Lagt ind: $PLIST"
