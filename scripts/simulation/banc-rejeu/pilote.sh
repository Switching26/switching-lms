#!/bin/zsh
# File d'attente partagée : chaque worker RÉSERVE un lot par `mkdir` atomique.
# Un lot déjà mesuré (fichier résultat présent et complet) est sauté.
W=$1; SRC=$(dirname $0); cd "$SRC"; mkdir -p final/claims
for f in final/lot*.json; do
  n=$(basename $f .json)
  [ -s "final/res-$n.json" ] && continue
  mkdir "final/claims/$n" 2>/dev/null || continue
  node audit-rejeu.cjs --cas=$f --sortie=final/res-$n.json --vitesse=5 >> final/w$W.log 2>&1
done
echo "worker $W terminé" >> final/w$W.log
