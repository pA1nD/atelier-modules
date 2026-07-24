#!/bin/sh
# Build the hb-broker daemon and install it OUTSIDE the module tree, into
# ~/Library/Application Support/hb-broker/bin — so agent edits and the module
# hot-reload watcher can never touch the running security boundary.
#
# Compile-on-install sidesteps notarization: Gatekeeper only quarantines
# *downloaded* binaries; a locally-built one runs with no Developer cert. We
# ad-hoc sign with the hardened runtime (--options runtime) so another same-user
# process can't attach a debugger to the broker and read a live session.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST_DIR="$HOME/Library/Application Support/hb-broker/bin"
BIN="$DEST_DIR/hb-broker"
# Build OUT OF TREE (scratch path outside the module) so no .build artifacts ever land in
# the module folder — otherwise `atelier package` copies them into the published cut (its
# filter is a hardcoded list and does NOT read .gitignore).
SCRATCH="$HOME/Library/Application Support/hb-broker/build"
mkdir -p "$DEST_DIR"

echo "building hb-broker (swift release)…"
swift build -c release --package-path "$HERE" --scratch-path "$SCRATCH" >/dev/null
BUILT="$(swift build -c release --package-path "$HERE" --scratch-path "$SCRATCH" --show-bin-path)/hb-broker"

cp -f "$BUILT" "$BIN"

echo "signing (ad-hoc, hardened runtime)…"
codesign --force --sign - --options runtime --timestamp=none "$BIN" 2>/dev/null || \
  codesign --force --sign - "$BIN"

echo "built → $BIN"
