#!/bin/sh
# Builds src/moo.js (injected into every tab by main.rs) from the Moo extension's content.js
# (/root/cow/moo-cow-v1.1.zip) wrapped in a chrome.* shim. Run after changing content.js.
cd "$(dirname "$0")"
{ cat head.js; cat content.js; cat tail.js; } > ../moo.js
