#!/usr/bin/env bash
#
# VTU — drift detection pour CODEMAP.md
#
# Usage : bash scripts/check-codemap.sh
#
# Liste :
#   1. Fichiers source (src/**/*.{ts,tsx} hors __tests__) NON référencés dans CODEMAP.md
#   2. Migrations supabase NON référencées
#   3. Edge functions NON référencées
#   4. Chemins référencés dans CODEMAP.md mais qui n'existent plus (fichiers fantômes)
#
# Exit code 0 = OK, 1 = drift détecté.

set -euo pipefail

cd "$(dirname "$0")/.."

CODEMAP="CODEMAP.md"
EXIT=0

if [[ ! -f "$CODEMAP" ]]; then
  echo "ERROR: $CODEMAP introuvable" >&2
  exit 2
fi

echo "== Vérification CODEMAP.md =="
echo

# ----- 1. Fichiers source non référencés ------------------------------------
# Règle : un fichier est considéré "couvert" si lui-même OU son dossier parent
# (à n'importe quel niveau) est référencé dans CODEMAP.md. Permet de référencer
# `src/components/ui/` une seule fois sans lister les 20 fichiers shadcn.
echo "[1/4] Fichiers src/ non référencés…"
MISSING_SRC=0
while IFS= read -r f; do
  rel="${f#./}"
  case "$rel" in
    src/integrations/supabase/types.ts) continue ;; # auto-généré
    src/routeTree.gen.ts) continue ;; # auto-généré TanStack
    src/test/*) continue ;; # setup tests
  esac
  # Check le fichier OU n'importe quel dossier parent
  covered=0
  if grep -q -F "$rel" "$CODEMAP"; then
    covered=1
  else
    parent=$(dirname "$rel")
    while [[ "$parent" != "." && "$parent" != "src" ]]; do
      if grep -q -F "$parent/" "$CODEMAP" || grep -q -F "$parent)" "$CODEMAP"; then
        covered=1
        break
      fi
      parent=$(dirname "$parent")
    done
  fi
  if [[ $covered -eq 0 ]]; then
    echo "  - $rel"
    MISSING_SRC=$((MISSING_SRC + 1))
  fi
done < <(find src -type f \( -name "*.ts" -o -name "*.tsx" \) ! -path "*/__tests__/*" ! -path "*/node_modules/*")

if [[ $MISSING_SRC -gt 0 ]]; then
  echo "  → $MISSING_SRC fichier(s) src/ non référencé(s) dans CODEMAP.md"
  EXIT=1
else
  echo "  ✓ tous les fichiers src/ sont référencés"
fi
echo

# ----- 2. Migrations non référencées ----------------------------------------
echo "[2/4] Migrations supabase non référencées…"
MISSING_MIG=0
while IFS= read -r f; do
  rel="${f#./}"
  basename=$(basename "$f" .sql)
  # On accepte soit le chemin complet, soit la racine du nom (timestamp)
  short="${basename%%_*}"
  if ! grep -q -F "$rel" "$CODEMAP" && ! grep -q -F "$short" "$CODEMAP"; then
    echo "  - $rel"
    MISSING_MIG=$((MISSING_MIG + 1))
  fi
done < <(find supabase/migrations -type f -name "*.sql")

if [[ $MISSING_MIG -gt 0 ]]; then
  echo "  → $MISSING_MIG migration(s) non référencée(s)"
  EXIT=1
else
  echo "  ✓ toutes les migrations sont référencées"
fi
echo

# ----- 3. Edge functions non référencées ------------------------------------
echo "[3/4] Edge functions non référencées…"
MISSING_EDGE=0
while IFS= read -r d; do
  rel="${d#./}"
  if ! grep -q -F "$rel" "$CODEMAP"; then
    echo "  - $rel"
    MISSING_EDGE=$((MISSING_EDGE + 1))
  fi
done < <(find supabase/functions -mindepth 1 -maxdepth 1 -type d)

if [[ $MISSING_EDGE -gt 0 ]]; then
  echo "  → $MISSING_EDGE edge function(s) non référencée(s)"
  EXIT=1
else
  echo "  ✓ toutes les edge functions sont référencées"
fi
echo

# ----- 4. Chemins fantômes (référencés dans CODEMAP mais n'existent plus) ---
echo "[4/4] Chemins fantômes dans CODEMAP.md…"
GHOSTS=0
# Extrait les chemins entre backticks ou dans des liens markdown qui commencent par src/, supabase/, scripts/, public/, ou un fichier .ts/.tsx/.sql/.md à la racine
while IFS= read -r path; do
  # Nettoie : enlève suffixes :L (ligne), enlève wildcards
  clean=$(echo "$path" | sed -E 's/:[0-9]+(-[0-9]+)?$//' | sed 's/\*\*\///g')
  # Tronque sur # (ancres MD)
  clean="${clean%%#*}"
  # Si c'est un dossier (finit par /), check existence dossier
  if [[ "$clean" == */ ]]; then
    [[ -d "$clean" ]] && continue
  fi
  # Sinon check fichier
  if [[ -e "$clean" ]]; then
    continue
  fi
  echo "  - $path"
  GHOSTS=$((GHOSTS + 1))
done < <(grep -oE '\(\./([a-zA-Z0-9_./@$-]+)\)' "$CODEMAP" | sed -E 's/^\(\.\///; s/\)$//' | sort -u)

if [[ $GHOSTS -gt 0 ]]; then
  echo "  → $GHOSTS chemin(s) fantôme(s) dans CODEMAP.md"
  EXIT=1
else
  echo "  ✓ aucun chemin fantôme"
fi
echo

# ----- Résumé ---------------------------------------------------------------
if [[ $EXIT -eq 0 ]]; then
  echo "✓ CODEMAP.md à jour"
else
  echo "✗ CODEMAP.md a dérivé — mettre à jour avant merge"
fi

exit $EXIT
