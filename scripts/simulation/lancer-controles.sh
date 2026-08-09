#!/usr/bin/env bash
# Lance la batterie de contrôles statiques du simulateur.
#
# Aucun de ces contrôles n'était câblé dans package.json : ils se lançaient à la
# main, un par un. Avec quatre applications c'est intenable — d'où ce lanceur,
# adossé à `npm run check:sim`.
#
# Contrat de sortie : code de retour non nul dès qu'un contrôle échoue, et un
# récapitulatif nommant précisément les contrôles rouges. On ne s'arrête pas au
# premier échec : savoir qu'un seul contrôle est rouge, ou que dix le sont, ne
# conduit pas à la même conduite.
#
# `check-registre` exige une vraie base PostgreSQL jetable ; il n'est lancé que
# si SIM_CHECK_DB est fourni, et son absence est signalée plutôt que passée sous
# silence — un contrôle non lancé n'est pas un contrôle vert.
set -uo pipefail

cd "$(dirname "$0")/../.."

CONTROLES=(
  check-frontieres
  check-acces-ecran
  check-illustration-atelier
  check-note-nonregression
  check-scenario
  check-couverture
  check-validation
  check-demonstration
  check-demo-cibles
  check-montrer
  check-controles
  check-aplomb
  check-expurgation
  check-integrite-consignes
  check-formula-fr
  check-date-fr
  check-nombre-fr
  check-litteraux-excel
  check-verdicts
  check-journal-eval
  check-remediation
  check-jouabilite
  check-bilan-api
  check-demo-rejeu
)

rouges=()
absents=()
verts=0

for c in "${CONTROLES[@]}"; do
  fichier="scripts/simulation/$c.ts"
  if [ ! -f "$fichier" ]; then
    absents+=("$c")
    printf '  \033[33m—\033[0m %-28s (absent)\n' "$c"
    continue
  fi

  # Seul check-scenario prend des arguments : la liste des scénarios.
  args=()
  [ "$c" = "check-scenario" ] && args=(scripts/simulation/scenarios/*.json)

  sortie=$(npx tsx "$fichier" ${args[@]+"${args[@]}"} 2>&1)
  if [ $? -eq 0 ]; then
    verts=$((verts + 1))
    printf '  \033[32m✓\033[0m %-28s %s\n' "$c" "$(echo "$sortie" | tail -1)"
  else
    rouges+=("$c")
    printf '  \033[31m✗\033[0m %-28s\n' "$c"
    echo "$sortie" | sed 's/^/      /' | tail -25
  fi
done

if [ -n "${SIM_CHECK_DB:-}" ]; then
  # ⚠️ GARDE-FOU DE DESTRUCTION.
  #
  # `check-registre.ts` appelle `deleteMany({})` sur Formation, Section, Chapter,
  # Simulation, SimulationRun et User : il VIDE la base qu'on lui donne. Pointé
  # sur la production, il effacerait la formation Excel — 246 chapitres publiés —
  # et TOUS les comptes apprenants. Le nom de la variable dit « jetable » ; ce
  # contrôle-ci le fait respecter, parce qu'une convention de nommage n'a jamais
  # arrêté une erreur de copier-coller.
  case "$SIM_CHECK_DB" in
    *rlwy.net*|*railway*|*proxy.rlwy*|*switchback*)
      echo "  ✗ check-registre REFUSÉ : SIM_CHECK_DB ressemble à une base Railway."
      echo "    Ce contrôle VIDE la base qu'on lui donne (deleteMany sur Formation,"
      echo "    Chapter, User…). Utiliser une base locale jetable, jamais la production."
      rouges+=("check-registre")
      SIM_CHECK_DB=""
      ;;
  esac
fi

if [ -n "${SIM_CHECK_DB:-}" ]; then
  sortie=$(DATABASE_URL="$SIM_CHECK_DB" npx tsx scripts/simulation/check-registre.ts 2>&1)
  if [ $? -eq 0 ]; then
    verts=$((verts + 1))
    printf '  \033[32m✓\033[0m %-28s %s\n' "check-registre" "$(echo "$sortie" | tail -1)"
  else
    rouges+=("check-registre")
    printf '  \033[31m✗\033[0m %-28s\n' "check-registre"
    echo "$sortie" | sed 's/^/      /' | tail -25
  fi
else
  printf '  \033[33m—\033[0m %-28s (non lancé : SIM_CHECK_DB absent — base PostgreSQL jetable requise)\n' "check-registre"
  absents+=("check-registre")
fi

echo
echo "  $verts vert(s), ${#rouges[@]} rouge(s), ${#absents[@]} non lancé(s)"
[ ${#absents[@]} -gt 0 ] && echo "  non lancés : ${absents[*]}"
if [ ${#rouges[@]} -gt 0 ]; then
  echo "  ROUGES : ${rouges[*]}"
  exit 1
fi
exit 0
