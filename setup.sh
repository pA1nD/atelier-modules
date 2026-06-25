#!/usr/bin/env bash
#
# Bootstrap a fresh Atelier instance with the modules in this marketplace
# (atelier-chrome + dock) on the default port 1844.
#
# Usage:  ./setup.sh [target-dir]      (default: ./atelier-instance)
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${1:-$PWD/atelier-instance}"
SHELL_REPO="https://github.com/pA1nD/atelier.git"
MODULES=(atelier-chrome dock)

echo "▸ Atelier setup → $DEST"
mkdir -p "$DEST"

# 1. The shell (latest).
if [ -d "$DEST/atelier/.git" ]; then
  echo "▸ updating the atelier shell"
  git -C "$DEST/atelier" pull --ff-only
else
  echo "▸ cloning the atelier shell"
  git clone --depth 1 "$SHELL_REPO" "$DEST/atelier"
fi

# 2. The modules shipped in this marketplace (they sit next to this script).
for m in "${MODULES[@]}"; do
  if [ -d "$HERE/$m" ]; then
    echo "▸ installing module: $m"
    rm -rf "$DEST/$m"
    cp -R "$HERE/$m" "$DEST/$m"
  else
    echo "! module '$m' not found next to setup.sh — skipping" >&2
  fi
done

# 3. Default config: port 1844, atelier-chrome as the default chrome.
echo "▸ writing atelier.config.json (port 1844)"
cat > "$DEST/atelier.config.json" <<'JSON'
{
  "port": 1844,
  "defaultChrome": "atelier-chrome",
  "auth": false,
  "modules": ["atelier-chrome", "dock"]
}
JSON

# 4. Install the shell's dependencies (the bundled modules are dependency-free).
echo "▸ installing shell dependencies (npm) — this can take a minute"
( cd "$DEST/atelier" && npm install --no-fund --no-audit )

cat <<EOF

✓ Done. Your Atelier instance is ready in:
    $DEST

  Start it:
    cd "$DEST/atelier" && ATELIER_ROOT="$DEST" npm run dev

  Then open  http://localhost:1844
EOF
