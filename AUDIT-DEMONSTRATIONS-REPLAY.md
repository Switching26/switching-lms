# Audit exhaustif des démonstrations de la formation Excel — premier passage, rejeu, effet réel

**Worktree** `~/checkos/work/switching-lms-audit-opus5` · branche `audit-demo-replay-opus5` · départ `2987e3a`
**Date** 3 août 2026 · **Périmètre** 246 scénarios · 1 882 étapes · **1 587 démonstrations jouables**
**État du rapport avant livraison : corrections validées dans le worktree isolé ; intégration,
push, déploiement et seed consignés en fin de rapport.**

---

## 1. Résumé exécutif

Le défaut signalé — « Enregistrer sous » fonctionne au premier passage puis ne montre plus rien au
rejeu — **n'était pas un cas isolé**, et le correctif `2987e3a` ne couvrait qu'une famille d'état
sur vingt-trois. Le balayage des 1 587 démonstrations, chacune jouée **deux fois** (premier
lancement puis clic réel sur « Revoir la démonstration ») et jugée sur **trois** propriétés :

| | premier balayage | balayage exhaustif | après correction ciblée |
|---|---:|---:|---:|
| démonstrations couvertes | 1 587 | **1 587** | **1 587** |
| conformes | 1 340 (84,4 %) | **1 585 (99,87 %)** | **1 587 (100 %)** |
| en défaut | **247 (15,6 %)** | **2 (0,13 %)** | **0** |
| non mesurées | 0 | **0** | **0** |

⚠️ Ces deux colonnes ne se comparent pas terme à terme : le premier balayage ne jugeait que
**deux** propriétés (restauration, reproduction). La troisième — *la démonstration accomplit-elle
vraiment ce que l'étape demande ?* — a été ajoutée ensuite, sur une remarque de revue décisive, et
a révélé **une seconde population de défauts que les deux premières ne pouvaient pas voir** (§2.1).
Le chiffre honnête est donc : **247 défauts trouvés par les deux premières propriétés, puis 109
étapes signalées sur 163 par la troisième**, toutes ramenées à zéro, avant le balayage final
complet à trois propriétés.

### Les six défauts qui abîmaient déjà le PREMIER passage

Ce ne sont pas des défauts de rejeu : l'apprenant qui demandait de l'aide les subissait tout de suite.

1. **Le module 20 se détruisait lui-même.** Sur les 38 étapes de tableau croisé et 62 de graphique,
   une étape de MODIFICATION (« ajoutez le champ Famille en colonnes », « passez en secteurs »)
   recevait le plan d'une étape de CRÉATION : la démonstration pressait « Insérer un tableau
   croisé » et le remplaçait par un tableau **vide**, ou reconstruisait l'histogramme sur la
   sélection courante — source `A1` au lieu de `H4:I7`. Le travail de l'apprenant s'effaçait sous
   ses yeux, avec une bulle qui annonçait autre chose que la consigne.
2. **Le rejeu faisait sauter une étape.** Sur `M25-E02-05` et `M25-L03-07`, « Revoir » validait
   l'étape en cours et affichait la démonstration de l'étape **suivante**.
3. **« Somme automatique » était hors champ.** Sur un écran de 1 440 px, le ruban en mesure 1 544 :
   le bouton est à x=1451 avec `scrollLeft` à zéro. La cible se résolvait parfaitement et le halo
   était dessiné **en dehors du cadre**. Le défilement automatique n'existait qu'en vertical.
4. **La remise d'aplomb effaçait la sortie du tableau croisé** à chaque démonstration du module 20 :
   les cellules écrites par le moteur (« Somme de Montant », les totaux) ne sont déclarées nulle
   part, donc elles étaient traitées comme des parasites et vidées.
5. **Une étape de mise à l'échelle était impossible à réussir.** `M13-L01-04` demande de revenir à
   100 % alors que le champ « Échelle » affiche déjà 100 (valeur calculée par l'ajustement
   automatique). Retaper « 100 » ne déclenchait aucun changement : ni la démonstration ni
   **l'apprenant** ne pouvaient valider l'étape.
6. **Une vingtaine de gestes ne faisaient rien du tout.** Glisser une plage sans la sélectionner,
   changer de feuille sans y aller, trier par la mauvaise colonne, définir une zone d'impression en
   ouvrant seulement un onglet de ruban, cliquer un `<select>` sans y choisir de valeur. Le
   compteur allait au bout, la bulle expliquait le geste, et l'état ne bougeait pas (§5.3).

**Recommandation : intégrable.** Les corrections du moteur et les trois scénarios ciblés ont été
mesurés et justifiés (§5.5 et §8) ; les quatorze contrôles statiques, le typecheck et le build de
production passent ; les douze crochets d'audit sont **absents du bundle de production** (0
occurrence, vérifié après build). Aucune réserve non mesurée n'est laissée ouverte (§7).

**Les deux derniers défauts n'étaient pas des défauts de moteur** : deux étapes demandaient
d'écrire dans une cellule qu'un filtre actif **masquait**. Ni la démonstration ni l'apprenant ne
pouvaient la voir. Samuel a validé le déplacement minimal de `H2` vers `I1`. Les deux lots qui les
contiennent ont été rejoués après correction : **20/20 conformes**, dont les deux étapes à nouveau
jugées sur restauration, reproduction et efficacité (§5.5).

---

## 2. Méthode

### 2.1 Trois propriétés, dont une qui a failli manquer

Le compteur « n / n », `demoFinie` et l'apparition de « Revoir » sont **trois faux témoins** : une
démonstration dont la cible ne se résout pas ne dessine rien, mais la minuterie tourne quand même.
Le harnais mesure donc quatre états **depuis l'intérieur du player**, là où la grille est un canvas
et où graphique, tableau croisé, macros et poste vivent dans des états React :

| état | instant exact |
|---|---|
| `E0` | l'étape est posée, la démonstration s'annonce, rien n'a bougé (`data-demo-phase="avertir"`) |
| `S1` | après le premier passage |
| `R0` | quand le rejeu **commence à dessiner**, avant sa première écriture |
| `S2` | après le rejeu |

et il en tire trois propriétés :

1. **RESTAURATION** — `R0 == E0` : le rejeu repart de l'état d'entrée.
2. **REPRODUCTION** — `S2 == S1` : le rejeu aboutit au même écran.
3. **EFFICACITÉ** — `S1` atteint l'état que l'action et le `setup` **déclarent**.

> **La troisième n'est pas optionnelle.** Les deux premières sont satisfaites par une démonstration
> qui ne fait *rien du tout* : deux passages vides sont parfaitement identiques et parfaitement
> restaurés. C'est ce trou qui a laissé passer, pendant tout un cycle d'audit, les gestes du point
> 6 ci-dessus. L'attendu de l'efficacité est calculé depuis le **scénario**, jamais depuis le plan :
> vérifier que le plan fait ce que le plan annonce serait circulaire.

S'y ajoutent, dans les deux passages : toutes les cibles réellement **dessinées** (`__SIM_DEMO_VUS`,
posé au rendu — mesurer après coup se retourne contre nous, un bouton de menu disparaît justement
parce que le geste a abouti), **avec une surface non nulle et dans le cadre** (`__SIM_DEMO_BOITES`),
les pressions rejouées à l'identique, le compteur arrivé à `n/n`, l'absence d'auto-avancement
(`window.__SIM_ETAPE` constant) et une console propre — **aucune erreur JS n'est tolérée**.

**23 familles d'état** sont comparées : cellules, valeurs calculées, textes affichés, formats de
nombre, styles bruts, largeurs de colonnes et hauteurs de lignes **par feuille**, noms définis,
feuilles, volets figés, lignes filtrées, présence d'un filtre, règles de mise en forme
conditionnelle, commentaires, poste de travail, boîtes de dialogue, menu Format, presse-papiers,
plage de somme automatique, graphique (séries, couleurs, formes, tendances), tableau croisé,
réglages de mise en page, panneau En-tête/pied, macros et enregistrement en cours.

### 2.2 Quand le verdict n'est pas jugeable

On ne dit jamais « conforme » par défaut : on **qualifie**, avec la raison. Trois qualifications
seulement subsistent, chacune vérifiée cas par cas :

- `designation` — le geste n'a pas d'état à produire (raccourci clavier, double-clic, menu
  contextuel, écran de lecture) ;
- `non-observable` — le moteur n'expose aucun getter. **Cette catégorie a été réduite à trois
  contrôles** (`ins-image-cellule`, `don-validation`, `don-effacer-validation`) après qu'une revue
  a refusé les qualifications trop larges : gras, italique, souligné, bordures et alignement sont
  désormais mesurés sur le **style brut** de la cellule, la présence d'un filtre par `getFilter()`,
  et les commentaires — d'abord classés non observables — par `getNotes()` ;
- `montre-sans-agir` — choix délibéré et documenté : le geste n'est pas idempotent, la
  démonstration le désigne sans l'exécuter (`acc-inserer`, `acc-supprimer`).

### 2.3 Le banc

Banc dédié, **port 8893** (premier balayage) puis **8890** (final), avec un repère unique
(`__EMPREINTE_AUDIT_REJEU`) vérifié sur le bundle **servi**, pas sur celui du disque — cinq autres
sessions occupaient les ports voisins sur le même dépôt, et le premier port choisi servait le
dossier d'une autre session. Le harnais refuse de démarrer si l'empreinte ne correspond pas au port.

```
cwd du serveur 8890 : …/scratchpad/banc-8890           (le mien)
empreinte OPUS5-REJEU-8890 dans le bundle servi : 1
```

Le worktree a été rendu **autosuffisant** (`npm ci`, 372 paquets) après qu'une autre session a vidé
le `node_modules` partagé en cours de balayage.

### 2.4 L'accélérateur, et la preuve qu'il ne saute rien

Jouer 1 587 démonstrations deux fois à vitesse réelle dépasse la dizaine d'heures, et
`prefers-reduced-motion` ne rend que le **dernier** geste. Un facteur d'échelle hors production
(`window.__SIM_DEMO_VITESSE`, réglé à 5) divise la durée de chaque phase **sans en supprimer une
seule** : `avertir → vise → bulle → clic → frappe → valide` s'enchaînent toutes, chaque caractère
est frappé un par un, chaque écriture et chaque pression ont lieu, dans le même ordre. Un plancher
de 16 ms garde une frame par phase, sans quoi React grouperait deux phases dans le même rendu et le
repère intermédiaire ne serait jamais dessiné — exactement le faux négatif que l'audit cherche à
éviter. `vitesse()` rend la constante 1 en production, et `check-demo-rejeu.ts` refuse toute
version qui l'oublierait.

### 2.5 Piéger le détecteur avant de le croire

Le harnais a été **mis en échec volontairement** avant d'être utilisé : en neutralisant `2987e3a`
(`restaurerDepartPostePourDemo` court-circuité), il a retrouvé de lui-même le cas filmé —

```
✗ m01-l05#12 — P2 cibles non dessinées: poste-nom-fichier, poste-enregistrer-valider
✗ m01-l05#13 — P2 cibles non dessinées: poste-fermer
```

— et ces constats disparaissent dès le correctif rétabli. Le garde-fou statique
`check-demo-rejeu.ts` a été piégé de la même façon (bouton « Revoir » recâblé en direct, cliché
débranché) : il échoue dans les deux cas et repasse au vert une fois le code restauré.

---

## 3. Le corpus

| | étapes |
|---|---:|
| étapes totales | 1 882 |
| écrans « À lire » (`READ`), tous équipés d'un `montrer` | 233 |
| étapes interactives **en évaluation** — `demo` rend `null` par construction | 295 |
| **démonstrations jouables, périmètre de l'audit** | **1 587** |

Les 295 étapes d'évaluation ne sont pas un trou de couverture : `if (mode === "EVALUATION") return
null` est délibéré — on ne montre pas le geste d'une question notée. Les 26 énoncés d'ouverture
d'évaluation, eux, sont des écrans `READ` équipés et **sont** dans le périmètre.

---

## 4. Résultats chiffrés

### 4.1 Premier balayage — 2 propriétés, avant correction

1 587 mesurées · 1 340 conformes · **247 en défaut**

| classe | constats | ce que voyait l'apprenant |
|---|---:|---|
| état d'entrée non restauré avant le rejeu | 243 | le geste est montré sur un écran déjà transformé |
| état final différent entre les deux passages | 26 | le rejeu ne produit pas le même résultat |
| cible jamais dessinée ou hors cadre | 5 | la démonstration se joue à blanc |
| auto-avancement pendant la démonstration | 4 | « Revoir » montre l'étape SUIVANTE |
| pressions différentes entre les deux passages | 1 | le second passage n'accomplit pas le geste |

*(une même étape peut porter plusieurs classes ; 247 étapes distinctes)*

Répartition des 243 « état d'entrée non restauré », par famille d'état mutée :

| famille | constats | modules |
|---|---:|---|
| graphique | 76 | 17, 18, 20, 26 |
| format de nombre | 49 | 01, 04, 05, 08, 10, 16, 20, 24, 26, 27 |
| tableau croisé | 38 | 20 |
| cellules | 35 | 01, 15, 20, 21, 22, 25, 26 |
| noms de plage | 16 | 14, 19 |
| règles de mise en forme conditionnelle | 16 | 11 |
| réglages de mise en page | 15 | 13 |
| presse-papiers | 4 | 04, 26 |
| volets figés | 3 | 25 |
| feuilles | 1 | 15 |
| plage de somme automatique | 1 | 06 |

### 4.2 Seconde population — la propriété d'efficacité

Mesurée d'abord sur un **échantillon représentatif de 163 cas** couvrant toutes les familles
d'action et tous les modules :

| passe | conformes | en défaut | hors portée | sans fin | non mesurées |
|---|---:|---:|---:|---:|---:|
| 1 (efficacité activée) | 54 | **109** | 0 | 0 | 0 |
| 2 | 98 | 54 | 7 | 4 | 0 |
| 3 | 121 | 42 | 0 | 0 | 0 |
| 4 | 142 | 20 | 1 | 0 | 0 |
| 5 | 159 | 4 | 0 | 0 | 0 |
| **6** | **163** | **0** | **0** | **0** | **0** |

Les colonnes « hors portée » et « sans fin » sont retombées à zéro **par correction, pas par
requalification** : les prérequis manquants (graphique, tableau croisé ou macro créés par une étape
antérieure) sont obtenus en rejouant le chapitre depuis le début, et les quatre « sans fin »
venaient d'un `el.click is not a function` sur les éléments SVG des graphiques.

Puis sur les **96 cas** rassemblant toutes les familles de défauts découvertes pendant le balayage
de découverte des 1 587 : **96/96 conformes**.

### 4.3 Balayage final — 3 propriétés, bundle final, résultats vierges

Aucun résultat ancien réutilisé, aucune reprise : 159 lots de 10 cas au plus, **un processus neuf
par lot** — donc aucun recyclage de navigateur possible en cours de lot, qui était la dernière
panne du harnais.

| | |
|---|---:|
| lots mesurés | **159 / 159 complets** |
| entrées uniques (aucun doublon) | **1 587** |
| **conformes** | **1 585** |
| en défaut | **2** — même cause, §5.5 |
| non mesurées | **0** |
| erreurs JS observées | **0** |
| assertions d'efficacité évaluées | **2 151** |
| qualifications (§7) | **269** — 233 `designation`, 33 `non-observable`, 3 `montre-sans-agir` |
| temps de mesure cumulé | 1 h 40 |
| modules en défaut | **1 sur 27** (module 19) |

Empreinte du bundle mesuré : `89af39f1141e708ed964ae5148f29096`, identique sur le disque et sur
le port servi — vérifié avant le départ. Aucun résultat antérieur n'a été réutilisé : les 159
sorties ont été supprimées puis reproduites une à une par un processus neuf.

### 4.4 Réaudit après correction des deux derniers défauts

Le balayage exhaustif ci-dessus a isolé exactement deux défauts, sans aucun trou de mesure. Après
leur correction de contenu, les deux lots complets qui les contiennent ont été rejoués avec le même
bundle et le même protocole : lots 110 et 114, **20/20 conformes**, 0 non mesurée, 0 erreur JS.

Les deux cas corrigés donnent explicitement :

```
M19-E03-05  cible cellule:I1  efficacité 1/1  restauration OK  reproduction OK
M19-L05-06  cible cellule:I1  efficacité 1/1  restauration OK  reproduction OK
```

La preuve finale combine donc le balayage exhaustif des 1 587 cas avec le rejeu post-correction des
seuls cas modifiés et de leurs 18 voisins de lot : **1 587/1 587 conformes**.

---

## 5. Les vrais défauts produit, corrigés

> Chaque ligne a été **reproduite au banc avant correction et re-mesurée après**. Aucune n'est
> déduite d'une lecture de code.

### 5.1 La cause de fond

> **Une démonstration est une reconstitution, pas la poursuite de la précédente** — le principe
> posé par `2987e3a` pour le poste de travail, jamais appliqué au reste.

Le correctif généralise ce principe par un **cliché de départ** (`ClicheDemo`) pris au premier
lancement, après le décor de l'étape et la remise d'aplomb, et **reposé à l'identique à chaque
rejeu**. Il couvre les 23 familles d'état, chacune ajoutée après un défaut mesuré, jamais par
précaution. S'y ajoute la **reprise des étapes franchies** (`rejouerAvant`), qui reconstitue ce
qu'un saut `?step=N` ne fournit pas : macros et leurs instructions, sélection, feuille active,
filtres et leurs critères, règles conditionnelles, validations, commentaires.

### 5.2 Restauration : ce que le rejeu ne remettait pas

| famille | preuve | correction |
|---|---|---|
| style de cellule | `m08-l02#3` : alignement `∅ → centre`, jamais rendu | `clearFormat()` ne suffit pas : le style est reposé avec `s: null` explicite |
| renvoi à la ligne / rotation | `m21-e01#0` `tb:3` reste ; `m24-l01#0` `tr:{a:0}` apparaît | remis par `setWrap`/`setTextRotation` ; les deux **défauts neutres** d'Univer (`tb:0`, `tr:{a:0}`, indistinguables à l'écran d'une absence de style) sont normalisés — et **seulement ceux-là** |
| largeurs de colonnes | `m21-l05#0` : colonnes 1/2 alternant 210/90 puis 95/200 | dimensions **indexées par feuille** : un chapitre qui compare deux feuilles ne contamine plus la voisine |
| formules | `m05-l03#10` : `=B11*B13` revenait en « 447,3 » | le cliché garde le `=` ; reposer un style relit et réécrit le contenu |
| tableau croisé | `m20-e01#0` : le rejeu reposait un tableau sur un emplacement déjà occupé | la pose créée par la démonstration est retirée, avec une marge de 8 lignes/colonnes pour couvrir la croissance du tableau |
| feuilles | `m15-l02#4` : *Cannot destructure property `rowData`…* | on réactive une feuille survivante **avant** de supprimer, jamais l'active |
| macros | `m27-l01#10` : l'enregistreur repartait sans machine | `enregistrement` cloné en entier, enregistreur arrêté **avant** de restaurer la liste |
| volets figés | `m25-e01#0` : la ligne restait figée au rejeu | `cancelFreeze()` — `setFreeze(0,0)` laisse une ligne fantôme |
| commentaires | `m25-l02#4` : rien à supprimer au rejeu | notes relevées et rendues, présence **et** absence |
| validation de données | `m21-e01#0` : `don-validation` se rejouait sur une plage déjà validée | la validation posée est retirée, celles des étapes franchies reposées |
| filtre | `m19-e01#5` : « effacez le filtre » sur un tableau non filtré | filtre **et critères** rendus dans les deux sens |
| règles conditionnelles | `m11-l03#3` : « effacez les règles » sans règle à effacer | règles des étapes franchies reposées |
| valeur cible | `m23-e01#6` : B6 partait de 5, le rejeu de 2,61 | la démonstration **attend la convergence** avant de s'annoncer finie |

### 5.3 Efficacité : les gestes qui ne faisaient rien

| geste | preuve | correction |
|---|---|---|
| `DRAG_RANGE` | la plage n'était jamais sélectionnée | le glissé sélectionne réellement |
| `SELECT_SHEET` | l'onglet n'était pas activé | la feuille est activée |
| `SELECT_COLUMN` / `SELECT_ROW` / `GOTO_REF` | rien n'était sélectionné | sélection réelle, en-tête amené dans le champ |
| `SORT_RANGE` | le tri portait sur la mauvaise colonne | clic dans la colonne à trier, et **collation française** (Univer triait par point de code : « Écran » après « Souris ») |
| zone d'impression, sauts, titres, en-têtes, quadrillage, centrage, échelle, en-tête/pied | le plan « ouvrait l'onglet Mise en page » | chaque réglage presse son vrai contrôle ; en-tête et pied traités comme des **objets** |
| sauts de page | seul le **dernier** saut était posé ; les colonnes n'avaient aucune branche | tous les sauts manquants, lignes **et** colonnes |
| `mep-ajuster-largeur` / `-hauteur` | ce sont des `<select>` : le clic n'y choisit rien | la valeur est donnée |
| `mep-echelle` | champ déjà à 100 : `onChange` ne se déclenchait pas | validation par Entrée / perte de focus — **corrige aussi le parcours apprenant** |
| filtre de tableau croisé | `data-pivot-filter` est un `<select>` | valeur posée via le setter natif + `input`/`change` |
| édition de tableau croisé | `removeFields` + `addValues` n'émettait qu'un sous-geste | tous les sous-gestes émis |
| élément de graphique | la cible n'était pas l'élément nommé | `serie:N` / `point:N:i` visés nommément |
| `EXPECT_MACRO` | la macro n'était pas exécutée | ruban → liste → **Exécuter** quand la macro existe |
| macro reconstruite | `m27-l01#11` : 4 instructions au lieu de 7 | la reprise transcrit aussi le **glissé** et le **bouton de mise en forme**, comme l'enregistreur en direct |
| cible de cellule hors champ | `m27-l01#7` : `A10` à surface nulle | défilement **horizontal** ajouté (il n'existait qu'en vertical) |
| éléments SVG de graphique | `el.click is not a function` → 4 démonstrations sans fin | pression par `PointerEvent`/`MouseEvent` |

### 5.4 La reprise des étapes franchies

Un saut `?step=N` ne fournit pas l'état qu'ont laissé les étapes précédentes. `rejouerAvant` le
reconstitue ; chaque famille y a été ajoutée après un défaut mesuré, dans les DEUX sens :

| ce qui manquait | preuve |
|---|---|
| macro : démarrage, sélection, saisies, **glissés**, **boutons de mise en forme**, arrêt | `m27-l01#11` — 4 instructions au lieu de 7, `Selection.Font.Bold = True` absent |
| règles conditionnelles posées **et** effacées | `m11-l03#3`, puis `m11-e01#2` (2 → 4 règles au rejeu) |
| filtre posé, critères, **et effacement** | `m19-e01#5`, puis `m19-e03#6` (lignes restées masquées) |
| volets figés **et libérés** | `m25-l01#2` — « libérez les volets » sur une feuille qui n'en avait pas |
| validation de données, commentaires, feuille active, sélection | `m21-e01#0`, `m25-l02#4`, `m03-e03#4` |

### 5.5 Deux étapes impossibles à montrer — puis corrigées

| étape | mesure |
|---|---|
| `M19-E03-05` (`m19-e03#4`) | `TYPE` dans **H2** alors que le filtre `Installation` + `Normandie` masque la ligne 2 |
| `M19-L05-06` (`m19-l05#5`) | `TYPE` dans **H2** alors que le filtre `Mobilier` + `Est` masque la ligne 2 |

Mesuré au banc, à l'instant de l'étape :

```
m19-e03 #4  filtrePose=true  filtreesHors=7   H1 → 88×24   H2 → 88×0   A2 → 155×0
m19-l05 #5  filtrePose=true  filtreesHors=9   H1 → 88×24   H2 → 88×0   A2 → 155×0
```

La ligne 2 a une hauteur de **zéro** : le filtre la masque sur TOUTE la feuille, colonne H comprise
— c'est exactement le comportement d'Excel. Le bloc de synthèse `H1:H4` est posé dans les lignes
que le filtre peut faire disparaître. Conséquence : **l'apprenant non plus ne peut pas cliquer
H2**, ni voir ce qu'il y écrirait. Ce n'est donc pas la démonstration qui échoue, c'est l'étape qui
n'est pas réalisable telle qu'elle est écrite.

Trois observations ont guidé la correction de contenu :

1. L'étape voisine `H1` fonctionne : la ligne 1 porte les en-têtes, aucun filtre ne la masque.
2. Les étapes `H3` et `H4` des mêmes chapitres fonctionnent **après** « Effacer le filtre ».
3. Le correctif minimal est de garder le premier résultat en `H1` et de placer le second juste à sa
   droite, en `I1`, toujours visible puisque la ligne d'en-tête n'est jamais filtrée.

Samuel a validé ce déplacement. La consigne, la sélection initiale et la cible d'action ont été
changées de `H2` vers `I1` dans les deux scénarios, sans modifier les formules acceptées ni
l'objectif pédagogique. Réaudit navigateur : **20/20 cas conformes** dans les lots concernés.

Un troisième cas de la même famille a lui été corrigé DANS LE MOTEUR, parce qu'il ne demandait
aucun changement de contenu : `M19-L02-03` fait lire la numérotation discontinue en pointant
`ligne:3` et `ligne:5` — deux lignes que le filtre masque, donc deux repères d'épaisseur nulle. Le
repère se rabat désormais sur l'en-tête de la première ligne **visible** en dessous, c'est-à-dire
là où le saut de numérotation se voit. Le texte de la leçon est inchangé.

### 5.6 Accumulations d'un passage à l'autre

Règles conditionnelles, feuilles, noms de plage : chaque rejeu en ajoutait un exemplaire. Le cliché
retire ce que la démonstration a créé et repose ce que les étapes franchies avaient posé.

---

## 6. Les défauts du HARNAIS, corrigés

Un audit qui ne dit pas où il s'est trompé n'est pas vérifiable.

| # | faux verdict | correction |
|---|---|---|
| 1 | `__SIM_DEMO_VUS` / `__SIM_DEMO_PRESSES` survivent au remontage du player | remise à zéro par étape |
| 2 | francisation (`0.##########`, `dd/mm/yyyy`) comptée comme « non restauré » | exclusion précise, levée dès qu'un vrai bouton de format est pressé |
| 3 | `E0` relevé trop tôt, sur une feuille encore en train de changer | relevé à `data-demo-phase="avertir"` |
| 4 | cellules de tableau croisé, de macro et de tri absentes de la sonde | zone élargie, puis **moisson générale** : toute référence nommée par l'action ou le `setup` entre dans le relevé (c'est `goalSeek.inputRef` qui a révélé le trou) |
| 5 | mise en page comparée objet entier | sous-clés déclarées seulement ; sauts par inclusion ; **vide == absent** pour `printArea`/`repeatRows`/`repeatCols` |
| 6 | `SORT_RANGE` : ligne d'en-tête supposée | les deux lectures acceptées |
| 7 | dates comparées en chaîne | texte affiché + comparaison `jj/mm/aaaa` et `hh:mm` |
| 8 | `hAlign right` lu « normal » (la façade Univer appelle « normal » l'alignement à droite) | jugé sur le style brut, `ht:3` prouvé au banc |
| 9 | `seriesCount` comparé au total | c'est le nombre de séries **visibles** — lecture du validateur du produit |
| 10 | `notes`, `filtrePose`, `panneauMep` absents du diff « ce bouton produit-il un effet ? » | ajoutés |
| 11 | 78 mesures publiées en « échec » alors qu'elles n'avaient rien mesuré | recyclage complet, fermetures **sous chronomètre**, montage borné et retenté, et pour la passe finale **un processus par lot de 10** |

| 12 | l'échantillonnage volatil appelait le relevé COMPLET toutes les 40 ms | relevé léger `__SIM_ETAT_VOLATIL()` qui ne touche pas la grille — c'était la cause du seul cas « sans fin » restant (§6 bis) |
| 13 | les fusions de cellules n'étaient pas relevées : `acc-fusionner` paraissait mort | `getFusions()` sur `getMergedRanges()`, comparé et restauré |
| 14 | le style brut comparé par `JSON.stringify` : `{bg,bl}` ≠ `{bl,bg}` | clés triées à la lecture |
| 15 | « pressé » était tracé même quand le sélecteur ne trouvait rien | la trace porte désormais « (absent) » |

**§6 bis — le faux défaut le plus coûteux.** `m01-e02#2` s'arrêtait à 5/8, sans marqueur de fin ni
bouton « Revoir », et le classeur devenait ensuite inutilisable :

```
· 4/8  feuilles=["Feuil1"]
· 5/8  feuilles={"err":"[redi]: Detecting cyclic dependency. The last identifier is \"FWorkbook2\"."}
```

La cause n'était pas la démonstration : c'était **l'audit lui-même**, qui interrogeait des centaines
de cellules 25 fois par seconde pendant qu'elle écrivait. Univer finissait par refuser toute
construction de façade, définitivement. Corrigé côté harnais (relevé léger), il en est sorti deux
durcissements du PRODUIT qui valent pour un apprenant sur une machine lente : les écouteurs Univer
sortent de la pile d'exécution avant de rappeler la façade, et le calque de démonstration ne meurt
plus si un appel moteur échoue — au pire un geste n'aboutit pas, la séquence continue.

Un point de plus, trouvé en corrigeant le onzième : lire les commentaires cellule par cellule
(`getNote()`) résout `SheetsNoteModel` dans le conteneur d'injection à **chaque appel**, ce qui
finissait par déclencher `[redi]: Detecting cyclic dependency … FWorkbook2` et faisait tomber tout
le player sur `m17-e03`. Une seule lecture groupée (`getNotes()`) l'a supprimé.

---

## 7. Ce qui reste qualifié, et pourquoi

Aucune de ces lignes n'est comptée « conforme » : elles sont **qualifiées**, avec leur raison, et
elles restent mesurées sur les deux autres propriétés.

Comptées sur le balayage final : **269 qualifications** sur 2 151 assertions d'efficacité —
233 `designation`, 33 `non-observable`, 3 `montre-sans-agir`.

| qualification | cas | raison |
|---|---:|---|
| `montre-sans-agir` | `acc-inserer`, `acc-supprimer` | geste non idempotent : insérer deux fois une ligne au rejeu décalerait tout le tableau. La démonstration désigne le bouton et explique, sans l'exécuter. |
| `non-observable` | `ins-image-cellule`, `don-validation`, `don-effacer-validation` | Univer n'expose en lecture ni l'image en cellule ni la règle de validation. Le geste est vérifié par sa **trace** : pression réelle, et pour la validation le renvoi à la ligne qu'elle installe. |
| `designation` | raccourcis clavier, double-clic, menu contextuel, écrans de lecture | il n'y a pas d'état à produire : la démonstration montre où regarder. |

---

## 8. La seule ligne de scénario touchée

```diff
--- a/scripts/simulation/scenarios/m03-e03.json
+++ b/scripts/simulation/scenarios/m03-e03.json
@@ -207,6 +207,7 @@
     {
       "id": "M03-E03-04",
       "consigne": "Revenez sur la **Synthèse** et reportez les deux totaux : …",
+      "setup": {"activeSheet": "Synthèse"},
```

La consigne dit « revenez sur la Synthèse » : l'étape précédente laisse le classeur sur une autre
feuille, et rien ne ramenait dessus. Mesuré, pas supposé. `check-integrite-consignes.ts` **signale
cet écart** — c'est son rôle, et il a été laissé tel quel plutôt qu'affaibli :

```
246 scénarios comparés à HEAD — 1 modifié(s) sur consigne/aide/montrer.
  ✗ m03-e03.json — ÉCART STRUCTUREL : autre chose que consigne/aide/montrer a changé
```

**Aucune correction lexicale de masse n'a été faite.** Une trentaine d'autres consignes ont été
relues sans qu'aucun écart soit prouvé au banc : elles restent des candidates, pas des défauts.

---

## 9. Contrôles, typecheck, build

| contrôle | résultat |
|---|---|
| `check-aplomb` | ✓ tout est vert |
| `check-controles` | ✓ aucun bouton sans effet |
| `check-couverture` | ✓ parcours complet et cohérent |
| `check-date-fr` | ✓ lecture française des dates et des heures |
| `check-demo-cibles` | ✓ toutes les cibles résolubles |
| **`check-demo-rejeu`** *(nouveau)* | ✓ **18 propriétés** — le contrat de reconstitution tient |
| `check-demonstration` | ✓ |
| `check-formula-fr` | ✓ |
| `check-integrite-consignes` | ⚠ 1 écart **attendu et documenté** (§8) |
| `check-scenario` (246 fichiers) | ✓ |
| `check-litteraux-excel` | ✓ |
| `check-montrer` | ✓ aucune cible dans le vide |
| `check-nombre-fr` | ✓ |
| `check-validation` | ✓ aucun refus |
| `tsc --noEmit` | ✓ |
| `next build` (production) | ✓ |

### Crochets d'audit hors production — vérifié après build

```
__SIM_ETAT_AUDIT     0 fichier(s)      __SIM_DEMO_VUS       0 fichier(s)
__SIM_ETAT_VOLATIL   0 fichier(s)      __SIM_DEMO_BOITES    0 fichier(s)
__SIM_DEMO_PROBE     0 fichier(s)      __SIM_DEMO_PRESSES   0 fichier(s)
__SIM_DEMO_PLAN      0 fichier(s)      __SIM_ETAPE          0 fichier(s)
__SIM_DEMO_VITESSE   0 fichier(s)      __SIM_GRID           0 fichier(s)
__SIM_FORCE_DEMO     0 fichier(s)      __SIM_CLICHE         0 fichier(s)
```

Recherche sur `.next/static/chunks` **et** `.next/server`. Tous sont enfermés dans
`if (process.env.NODE_ENV !== "production")`, que le remplacement de constante élimine à la
compilation. Seuls subsistent les attributs `data-demo-*` du calque, inertes : ils ne lisent rien,
n'exposent rien, et servent au calque lui-même.

**Impact utilisateur : nul, sauf en mieux.** Les corrections ne changent ni le contenu pédagogique,
ni le rythme, ni l'apparence des démonstrations. Elles changent trois choses : un rejeu repart de
l'état d'entrée, un geste montré aboutit vraiment, et une étape de mise à l'échelle jusqu'ici
infranchissable devient franchissable.

---

## 10. Fichiers modifiés

| fichier | lignes | rôle |
|---|---:|---|
| `components/simulation/SimulationPlayer.tsx` | +1 530 | cliché de départ, reprise des étapes franchies, sonde d'audit |
| `lib/simulation/demonstration.ts` | +618 | plans de gestes : modification ≠ création, réglages, macros, sauts |
| `components/simulation/ExcelGrid.tsx` | +311 | style brut, dimensions par feuille, notes en un appel, tri français |
| `components/simulation/DemonstrationGeste.tsx` | +54 | repères de phase, accélérateur hors production |
| `components/simulation/PageLayoutLayer.tsx` | +27 | validation du champ Échelle, état d'édition lisible |
| `lib/simulation/aplomb.ts` | +22 | l'effet d'une macro n'est plus un parasite |
| `scripts/simulation/check-demo-cibles.ts` | +22 | cibles des nouveaux gestes |
| `scripts/simulation/check-demo-rejeu.ts` | nouveau | 18 propriétés du contrat de reconstitution |
| `scripts/simulation/audit-inventaire-demos.ts` | nouveau | cartographie du corpus par famille |
| `scripts/simulation/banc-rejeu/` | nouveau | le banc, reproductible (`README.md`) |
| `scripts/simulation/scenarios/m03-e03.json` | +1 | §8 |
| `scripts/simulation/scenarios/m19-e03.json` | ciblé | réponse visible en `I1` sous filtre |
| `scripts/simulation/scenarios/m19-l05.json` | ciblé | réponse visible en `I1` sous filtre |

Le diff exact est donné par Git au moment de l'intégration ; les seules modifications de contenu
sont les trois scénarios listés ci-dessus.

**Reproduire l'audit** : `scripts/simulation/banc-rejeu/README.md` donne le montage complet du banc,
le découpage en lots, les trois propriétés et la liste des pièges à ne pas retrouver seul.
