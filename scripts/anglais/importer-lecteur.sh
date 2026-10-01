#!/bin/bash
# Copie autonome du client, jamais du serveur, des modèles Whisper ni des médias.
# public (hors vignettes et outils de recette), services, activities, data.
# Une copie finale remplace exactement la provisoire, sans retouche des sources.
set -euo pipefail
source_dir="${1:?Usage: importer-lecteur.sh dossier-source}"
root_dir="$(cd "$(dirname "$0")/../.." && pwd)"
[ -f "$source_dir/public/index.html" ] && [ -d "$source_dir/activities" ]
mkdir -p "$root_dir/anglais-lecteur"
for dossier in public services activities data; do
  mkdir -p "$root_dir/anglais-lecteur/$dossier"
  rsync -a --delete --delete-excluded --exclude vignettes/ --exclude qa-reference/ --exclude rapport-audit.html --exclude essais/ --exclude '*.map' --exclude '.DS_Store' "$source_dir/$dossier/" "$root_dir/anglais-lecteur/$dossier/"
done
printf 'Source: %s\nCommit: %s\nCopie: public (sans vignettes, essais, rapport-audit et qa-reference), services, activities, data. Médias via importer-medias.ts.\n' "$source_dir" "$(git -C "$source_dir" rev-parse HEAD)" > "$root_dir/anglais-lecteur/SOURCE.txt"
if ! git -C "$source_dir" diff --quiet HEAD -- public services activities data; then printf 'État source : modifications non commitées présentes lors de la copie.\n' >> "$root_dir/anglais-lecteur/SOURCE.txt"; fi
(cd "$root_dir/anglais-lecteur" && shasum -a 256 public/index.html public/app/main.js services/base.js 2>/dev/null || true) >> "$root_dir/anglais-lecteur/SOURCE.txt"
echo 'Lecteur copié dans anglais-lecteur/. Aucun serveur ou média volumineux copié.'
