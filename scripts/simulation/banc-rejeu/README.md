# Banc d'audit des démonstrations — premier passage, rejeu, et effet réel

Ce dossier contient de quoi rejouer au navigateur **les deux passages** d'une
démonstration — le premier lancement puis « Revoir la démonstration » — et
vérifier qu'elle **accomplit vraiment** ce que l'étape demande.

C'est le seul contrôle qui voit ces trois choses. `check-demonstration.ts` compte
les plans, `check-demo-cibles.ts` vérifie qu'ils sont résolubles sur le papier,
`check-demo-rejeu.ts` vérifie le câblage du moteur — aucun ne peut dire qu'un
premier passage a supprimé ses propres cibles, ni qu'un geste montré n'a rien
produit.

## Les trois propriétés

Le compteur `n/n`, `demoFinie` et l'apparition de « Revoir » sont **trois faux
témoins** : une démonstration dont la cible ne se résout pas ne dessine rien,
mais la minuterie tourne quand même. Le harnais mesure donc quatre états —
depuis l'INTÉRIEUR du player, là où la grille est un canvas et où le graphique,
le tableau croisé, les macros et le poste vivent dans des états React :

| état | instant |
|---|---|
| `E0` | l'étape est posée, la démonstration s'annonce, rien n'a bougé (`data-demo-phase="avertir"`) |
| `S1` | après le premier passage |
| `R0` | quand le rejeu commence à dessiner, avant sa première écriture |
| `S2` | après le rejeu |

et il en tire trois propriétés :

1. **RESTAURATION** — `R0 == E0` : le rejeu repart de l'état d'entrée.
2. **REPRODUCTION** — `S2 == S1` : le rejeu aboutit au même écran.
3. **EFFICACITÉ** — `S1` atteint l'état que l'action et le `setup` DÉCLARENT.

> ⚠️ **La troisième n'est pas optionnelle.** Les deux premières sont satisfaites
> par une démonstration qui ne fait *rien du tout* : deux passages vides sont
> parfaitement identiques et parfaitement restaurés. C'est ce trou qui a laissé
> passer, pendant tout un cycle d'audit, des gestes qui montraient sans agir —
> glisser une plage sans la sélectionner, changer de feuille sans y aller,
> trier par la mauvaise colonne, définir une zone d'impression en ouvrant
> seulement un onglet de ruban.

L'attendu de l'efficacité est calculé depuis le **scénario**, jamais depuis le
plan : vérifier que le plan fait ce que le plan annonce serait circulaire.

S'y ajoutent, dans les deux passages : toutes les cibles réellement dessinées
(`__SIM_DEMO_VUS`, posé **au rendu**), **avec une surface non nulle et dans le
cadre** (`__SIM_DEMO_BOITES`), les pressions rejouées à l'identique, le compteur
arrivé à `n/n`, l'absence d'auto-avancement et une console propre.

**23 familles d'état** sont comparées : cellules, valeurs calculées, formats de
nombre, styles bruts, largeurs de colonnes, noms définis, feuilles, volets figés,
lignes filtrées, règles conditionnelles, poste de travail, boîtes, menu Format,
presse-papiers, plage de somme automatique, graphique, tableau croisé, réglages
de mise en page, macros et enregistrement en cours.

## Quand le verdict n'est pas jugeable

On ne dit jamais « conforme » par défaut : on **qualifie**, avec la raison.

- `designation` — le geste n'a pas d'état à produire (raccourci clavier,
  double-clic, menu contextuel, écran de lecture) ;
- `non-observable` — le moteur n'expose aucun getter (gras, italique, souligné,
  bordures, fusion, présence d'un filtre, image de cellule, règle de validation) ;
- `montre-sans-agir` — choix délibéré : le geste n'est pas idempotent, la
  démonstration le désigne sans l'exécuter (`acc-inserer`, `acc-supprimer`).

## Monter le banc

Le banc n'est pas dans le dépôt : c'est un bundle de 21 Mo. On le reconstruit.

```bash
BANC=/tmp/banc-rejeu && mkdir -p "$BANC"
LMS=$(pwd)                      # racine du dépôt switching-lms
cp scripts/simulation/banc-rejeu/{atelier.jsx,atelier-banc.html,next-dynamic-stub.js,audit-rejeu.cjs,efficacite.cjs,matrice.py} "$BANC/"
: > "$BANC/univer.css"
cat .next/static/css/*.css > "$BANC/app.css"      # après un `npx next build`
ln -sfn "$LMS/scripts/simulation/scenarios" "$BANC/scenarios"

# le lien node_modules ne sert QUE le temps de l'esbuild : laissé en place, il
# masque la résolution de playwright pour le harnais.
ln -sfn "$LMS/node_modules" "$BANC/node_modules"
npx esbuild "$BANC/atelier.jsx" --bundle --outfile="$BANC/bundle-atelier.js" \
  --loader:.jsx=jsx --loader:.js=jsx --jsx=automatic \
  --define:process.env.NODE_ENV='"development"' \
  --alias:next/dynamic="$BANC/next-dynamic-stub.js" --alias:@="$LMS" \
  --resolve-extensions=.tsx,.ts,.jsx,.js,.json
rm -f "$BANC/node_modules"

cd "$BANC" && nohup python3 -m http.server 8890 --bind 127.0.0.1 > server.log 2>&1 & disown
```

`NODE_ENV=development` est obligatoire : c'est lui qui laisse `window.__SIM_GRID`,
`__SIM_ETAT_AUDIT`, `__SIM_DEMO_PLAN` et `__SIM_DEMO_VITESSE` dans le bundle. En
production ils n'existent pas (0 occurrence dans `.next/static/chunks`, vérifié).

### Vérifier que c'est BIEN votre banc

Plusieurs sessions travaillent parfois sur le même dépôt, chacune avec son
serveur — le premier port choisi pour cet audit servait le dossier d'une autre.

```bash
lsof -a -p $(lsof -ti :8890 | head -1) -d cwd -Fn | grep ^n     # sert-il MON dossier ?
curl -s http://127.0.0.1:8890/bundle-atelier.js | grep -c OPUS5-REJEU-8890   # MON bundle ?
```

Le harnais refuse de démarrer si l'empreinte ne correspond pas au port.

## Lancer le balayage

```bash
npx tsx scripts/simulation/audit-inventaire-demos.ts        # écrit .audit-inventaire-demos.json
python3 - <<'PY'
import json
d = json.load(open('.audit-inventaire-demos.json'))
cas = [{"nom": l["fichier"] + ".json", "index": l["index"], "etape": l["etape"]} for l in d]
cas.sort(key=lambda c: (c["nom"], c["index"]))
fichiers = sorted({c["nom"] for c in cas}); att = {f: i % 5 for i, f in enumerate(fichiers)}
for k in range(5):
    json.dump([c for c in cas if att[c["nom"]] == k], open(f'/tmp/banc-rejeu/front{k}.json', 'w'))
PY

# cinq fronts ; un chapitre reste sur le même front
for k in 0 1 2 3 4; do
  nohup node audit-rejeu.cjs --cas=front$k.json --sortie=res$k.json --vitesse=5 > res$k.log 2>&1 & disown
done

# variantes du protocole
node audit-rejeu.cjs --cas=front0.json --sortie=r-bouton.json --bouton      # départ par « Montrez-moi »
node audit-rejeu.cjs --cas=front0.json --sortie=r-brouille.json --brouiller # après une erreur volontaire
```

`--vitesse=N` divise la durée de chaque phase du calque **sans en sauter
aucune** : annonce, visée, bulle, clic, frappe caractère par caractère et
validation s'enchaînent toutes, chaque écriture et chaque pression ont toujours
lieu, dans le même ordre. Un plancher de 16 ms garde une frame par phase, sans
quoi React grouperait deux phases dans le même rendu et le repère intermédiaire
ne serait jamais dessiné — c'est-à-dire exactement le faux négatif que l'audit
cherche à éviter. Le réglage n'existe pas en production.

## Robustesse du harnais

Univer laisse de quoi saturer un onglet : après ~150 étapes le contexte mourait,
et **78 mesures avaient été publiées comme « échecs »** alors qu'elles n'avaient
rien mesuré. Le harnais recycle donc page, contexte **et** navigateur tous les
10 cas, à la moindre mort, et après tout incident — puis rejoue le cas deux fois
sur du neuf. Une mesure manquante est un trou à combler, jamais un verdict.

Les prérequis qu'un saut `?step=N` ne fournit pas — graphique, tableau croisé ou
macro créés par une étape antérieure — sont obtenus en **rejouant le chapitre
depuis le début** : la démonstration accomplit chaque geste, « J'ai compris —
continuer » avance. Aucun cas n'est classé hors portée pour cette raison.

## Pièges à ne pas retrouver tout seul

- **`__SIM_DEMO_VUS` / `__SIM_DEMO_PRESSES` survivent au remontage du player.**
  Sans remise à zéro par étape, les pressions de l'étape précédente s'ajoutent à
  celles du premier passage. Premier faux verdict rencontré.
- **`reducedMotion` ne rend que le DERNIER geste** : inutilisable pour mesurer la
  résolution des cibles.
- **`sim-debloquer` apparaît au DÉBUT de la démonstration.** Le seul marqueur de
  fin est `sim-revoir-demo` (ou `sim-revoir-geste` en lecture).
- **« Résolue » ≠ « visible »** : une colonne masquée rend un rectangle de
  largeur zéro, et le ruban défile horizontalement. D'où `__SIM_DEMO_BOITES`.
- **Le format `0.##########` et `dd/mm/yyyy` sont posés par la GRILLE**
  (francisation), pas par la démonstration. Les compter comme « état non
  restauré » produit des centaines de faux défauts.
- **`E0` se relève quand l'étape est POSÉE**, pas dès que la sonde existe :
  `applyStep` change de feuille et laisse le moteur recalculer. Trop tôt, on
  compare deux relevés pris sur des feuilles différentes.
- **Une valeur déclarée se compare à la valeur CALCULÉE**, pas au contenu : une
  cellule qui porte `=D10+D21` satisfait `{v: 990}`.
- **La plage d'un `SORT_RANGE` inclut ou non la ligne d'en-tête selon le
  scénario** : accepter les deux lectures, sinon un tri parfait est déclaré faux.
- **Une évaluation ne démarre jamais au milieu** (`departForce`) : comparer
  `window.__SIM_ETAPE` à l'étape visée avant de conclure.
- **L'ÉCHANTILLONNAGE NE DOIT PAS INTERROGER LA GRILLE.** Le relevé complet lit
  des centaines de cellules ; l'appeler toutes les 40 ms pendant qu'une
  démonstration écrit sature la façade d'Univer jusqu'à
  « [redi]: Detecting cyclic dependency. The last identifier is "FWorkbook2" » —
  et le classeur reste **définitivement** inutilisable ensuite. `m01-e02#2`
  s'arrêtait ainsi à 5/8, sans fin ni bouton « Revoir ». D'où
  `__SIM_ETAT_VOLATIL()`, qui ne lit que des états React.
- **Lire les commentaires cellule par cellule déclenche le même cycle** :
  `getNote()` résout `SheetsNoteModel` dans le conteneur d'injection à CHAQUE
  appel. Une seule lecture groupée (`getNotes()`) suffit.
- **`seriesCount` compte les séries VISIBLES**, pas le total : c'est la lecture
  du validateur du produit (`validate.ts`).
- **« Vide » et « absent » sont le même état** pour `printArea`, `repeatRows` et
  `repeatCols` : `appliquerReglages` traduit `""` en `undefined`.
- **Un lot de 10 cas par processus** supprime tout recyclage en cours de route ;
  c'est le découpage de la passe finale. Le montage du navigateur est borné à
  90 s et retenté trois fois — `chromium.launch()` peut ne jamais rendre la main.
- **Ne jamais tuer une passe avec `pkill` sans revérifier** : des processus
  orphelins ont écrit des résultats APRÈS le nettoyage. Vérifier
  `ps -Ao args | grep audit-rejeu`, puis re-supprimer les sorties.
