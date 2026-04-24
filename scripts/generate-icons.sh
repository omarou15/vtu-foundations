#!/usr/bin/env bash
# Régénère les icônes PWA depuis public/icon.svg.
# Utilise ImageMagick (via nix) — n'alourdit pas node_modules.
set -euo pipefail
cd "$(dirname "$0")/.."
nix run nixpkgs#imagemagick -- convert -background none public/icon.svg -resize 192x192 public/icon-192.png
nix run nixpkgs#imagemagick -- convert -background none public/icon.svg -resize 512x512 public/icon-512.png
echo "✅ icons regenerated"
