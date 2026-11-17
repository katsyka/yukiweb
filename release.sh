#!/bin/bash
# Build the Windows installer, sign it for the updater, publish to yuki.yukichat.lol/yukiweb.
# Usage: ./release.sh 0.1.1 "what changed"   (version must be higher than the installed one)
set -eo pipefail
cd "$(dirname "$0")"
. ~/.cargo/env
export PATH=/opt/nsis/bin:/usr/lib/llvm-18/bin:$PATH
VER=${1:?version}; NOTES=${2:-}
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VER\"/" src-tauri/tauri.conf.json
sed -i "0,/^version = .*/s//version = \"$VER\"/" src-tauri/Cargo.toml
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/yukiweb.key)" TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc -- -j2 2>&1 | grep -vE "^\s+(Compiling|Checking)" | tail -20
B=src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis
EXE="YukiWeb_${VER}_x64-setup.exe"
OUT=/root/yuki-hub/yukiweb
mkdir -p "$OUT"
cp "$B/$EXE" "$OUT/$EXE"
cp "$B/$EXE" "$OUT/YukiWeb-setup.exe"
python3 - "$VER" "$NOTES" "$EXE" "$(cat "$B/$EXE.sig")" > "$OUT/latest.json" <<'PY'
import json, sys, datetime
v, notes, exe, sig = sys.argv[1:]
print(json.dumps({"version": v, "notes": notes,
  "pub_date": datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
  "platforms": {"windows-x86_64": {"signature": sig, "url": f"https://yuki.yukichat.lol/yukiweb/{exe}"}}}, indent=2))
PY
echo "Published $VER → https://yuki.yukichat.lol/yukiweb/YukiWeb-setup.exe"
# Not code-signed: submitting each installer to Microsoft clears the SmartScreen warning for it
# (usually within a day or two). Updates through the app never show it; only browser downloads do.
echo
echo "SmartScreen: submit $OUT/$EXE"
echo "  at https://www.microsoft.com/en-us/wdsi/filesubmission → Software developer → \"Incorrectly detected\" (SmartScreen)"
