#!/usr/bin/env bash
# claude/statusline.sh — single-line Claude Code statusline with the session codename.
#
#   cwd  branch[*]  model  ctx:NN%  <emoji> XXXX  ❯ last prompt
#
# The codename (emoji + colour + last-4 of the id) is the SAME identity the Claude
# dashboard card and the browser tab grouper show — derived from the full session
# id with the same hash. Match "which terminal am I in" to "which card / tab is
# mine" at a glance. Wired by the claude module ("Wire codename statusline").
#
# Self-contained. Requires jq. bash 3.2-safe (the macOS system bash).

input=$(cat)
dir=$(echo "$input" | jq -r '.workspace.current_dir // empty')
model=$(echo "$input" | jq -r '.model.display_name // empty')
used=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
transcript=$(echo "$input" | jq -r '.transcript_path // empty')
session_id=$(echo "$input" | jq -r '.session_id // empty')
[ -z "$session_id" ] && [ -n "$transcript" ] && session_id=$(basename "$transcript" .jsonl)

# ── the session codename ── keep in sync with the claude module (lib.jsx: CODES,
#    CODE_COLORS, hash32). 48 emoji grouped 6-per-colour; colour group = slot / 6.
#    Hash: FNV-1a (32-bit) over the FULL id + a finalizer. Verified to match the JS
#    byte-for-byte (incl. the 32-bit multiply overflow, which masks correctly).
EMO=(🔥 🍎 🍓 🍒 🌹 🐞 🦊 🍊 🦁 🐯 🥕 🏀 🍋 🌻 ⭐ 🐝 🍌 🐥 🐸 🍀 🌵 🐢 🌲 🐍 🐬 🌊 💎 🧊 🐳 💧 🐧 🫐 🦋 🌀 🌐 🐟 🦄 🍇 🔮 🐙 🍆 👾 🌸 🐷 🦩 🍑 🌷 🌺)
RGB=("220;38;38" "234;88;12" "202;138;4" "22;163;74" "8;145;178" "37;99;235" "147;51;234" "219;39;119")
codename=""; plain_code=""
if [ -n "$session_id" ]; then
  sid_up=$(printf '%s' "${session_id: -4}" | tr '[:lower:]' '[:upper:]')
  h=$((0x811c9dc5)); i=0; n=${#session_id}
  while [ "$i" -lt "$n" ]; do
    printf -v c '%d' "'${session_id:i:1}"
    h=$(( (h ^ c) & 0xFFFFFFFF )); h=$(( (h * 0x01000193) & 0xFFFFFFFF ))
    i=$(( i + 1 ))
  done
  h=$(( (h ^ (h >> 16)) & 0xFFFFFFFF )); h=$(( (h * 0x7feb352d) & 0xFFFFFFFF ))
  h=$(( (h ^ (h >> 15)) & 0xFFFFFFFF )); h=$(( (h * 0x846ca68b) & 0xFFFFFFFF ))
  h=$(( (h ^ (h >> 16)) & 0xFFFFFFFF ))
  slot=$(( h % 48 ))
  codename="${EMO[$slot]} "$'\033[1;38;2;'"${RGB[$(( slot / 6 ))]}"'m'"${sid_up}"$'\033[0m'
  plain_code="XX ${sid_up}"   # XX ≈ the emoji's display width, for the prompt-fit math
fi

dir_short=${dir/#$HOME/\~}
branch=$(git -C "$dir" symbolic-ref --short HEAD 2>/dev/null)
dirty=""
if [ -n "$branch" ]; then
  git -C "$dir" diff --quiet --ignore-submodules HEAD 2>/dev/null || dirty="*"
fi

C_DIR=$'\033[36m'
C_DIM=$'\033[90m'
C_RST=$'\033[0m'

line1="${C_DIR}${dir_short}${C_RST}"; plain="$dir_short"
[ -n "$branch" ]   && { line1="${line1}  ${C_DIM}${branch}${dirty}${C_RST}"; plain="${plain}  ${branch}${dirty}"; }
[ -n "$model" ]    && { line1="${line1}  ${C_DIM}${model}${C_RST}";          plain="${plain}  ${model}"; }
[ -n "$used" ]     && { pct="ctx:$(printf %.0f "$used")%"; line1="${line1}  ${C_DIM}${pct}${C_RST}"; plain="${plain}  ${pct}"; }
[ -n "$codename" ] && { line1="${line1}  ${codename}";                       plain="${plain}  ${plain_code}"; }

last_msg=""
if [ -n "$transcript" ] && [ -f "$transcript" ]; then
  last_msg=$(tail -n 2000 "$transcript" 2>/dev/null \
    | jq -r 'select(.type=="user") | if (.message.content | type) == "string" then .message.content else empty end' 2>/dev/null \
    | grep -vE '^[[:space:]]*<' \
    | grep -vE '^[[:space:]]*$' \
    | tail -1 | tr '\n' ' ' | cut -c1-400)
fi
if [ -n "$last_msg" ]; then
  width=${COLUMNS:-120}
  avail=$(( width - ${#plain} - 4 ))
  if [ "$avail" -ge 12 ]; then
    [ "${#last_msg}" -gt "$avail" ] && last_msg="${last_msg:0:$((avail - 1))}…"
    line1="${line1} ${C_DIM}❯ ${last_msg}${C_RST}"
  fi
fi

printf '%s' "$line1"
