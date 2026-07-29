#!/bin/sh
# hb-broker · install (idempotent) — the WHOLE daemon install, readable top to bottom:
#
#   1. compile the Swift daemon        (only if missing, or with --rebuild)
#   2. ad-hoc sign, hardened runtime   (build.sh — no Developer cert needed)
#   3. write the LaunchAgent plist     (RunAtLoad + KeepAlive; Interactive so
#                                       macOS approval dialogs can appear)
#   4. (re)bootstrap it under launchd
#
# Everything lands OUTSIDE the module tree, in ~/Library/Application Support/hb-broker
# — so agent edits and hot reloads can never touch the running security boundary.
# The module's own upkeep re-runs this script to heal an EXISTING daemon; the
# first install is yours (or your setup agent's) to run deliberately.
#
# The daemon's first start does one bare Keychain read — that's the macOS
# permission prompt: enter your login password and choose "Always Allow".
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HOME/Library/Application Support/hb-broker"
BIN="$APP/bin/hb-broker"
LABEL="de.pa1nd.hb-broker"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_N="$(id -u)"

if [ "$1" = "--rebuild" ] || [ ! -x "$BIN" ]; then
  sh "$HERE/build.sh"
fi

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$BIN</string><string>serve</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>$APP/broker.log</string>
  <key>StandardErrorPath</key><string>$APP/broker.log</string>
</dict></plist>
EOF

launchctl bootout "gui/$UID_N/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_N" "$PLIST"
launchctl enable "gui/$UID_N/$LABEL" 2>/dev/null || true

# Stamp the module version this binary was built from, so the module's mount-heal
# knows NOT to rebuild until the version actually moves (module update). Read from
# the module's own package.json (HERE is native/, so ../package.json) — correct no
# matter how this script was invoked.
VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$HERE/../package.json" | head -1)
printf '%s' "$VERSION" > "$APP/.built-version"

echo "hb-broker: installed + running  (socket: $APP/broker.sock · log: $APP/broker.log · built from $VERSION)"
