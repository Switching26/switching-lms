# Guide interactif de la formation — conception et aperçu

Formation « Excel 2024 — Du débutant à l'avancé » · 27 modules · 246 chapitres de simulation ·
27 évaluations notées.

**Statut : APERÇU SEUL.** Rien n'est intégré. Aucun fichier applicatif n'a été touché — `git status`
ne montre que `artifacts/`. Aucun commit, aucun push, aucun déploiement, aucune migration.
Base : `origin/main` au commit `a596cd2`.

**Livrables**

| Fichier | Contenu |
|---|---|
| `artifacts/guide-formation-interactif-preview.html` | aperçu autonome et réellement manipulable |
| `artifacts/guide-formation-interactif-desktop.png` | capture 1440 × 900, étape 6 en cours de démonstration |
| `artifacts/guide-formation-interactif-mobile.png` | capture 390 × 844, étape 2, carte en feuille basse |
| `generated/qa-guide/qa.mjs` | banc Playwright — 66 contrôles, 3 environnements |

---

## 1. Le parti pris

> Un guide qui explique l'atelier **dans une page** ne sert à rien : au moment où l'apprenant en a
> besoin, il est dans l'atelier, pas dans la documentation.

Le guide proposé n'est donc **ni une page d'aide, ni un module**. C'est une **couche transversale**
posée par-dessus l'atelier réel : le projecteur désigne le vrai bouton, la carte explique, et
l'apprenant **fait le geste sur la vraie interface**. Il n'y a aucune capture d'écran, aucune
imitation : ce qu'il manipule pendant le guide, c'est l'atelier.

### Pourquoi pas un 28ᵉ module

Trois raisons, dans cet ordre :

1. **Il fausserait tous les compteurs.** « 246 chapitres », « 27 modules », le pourcentage de
   progression, le `attemptCount`, la jauge du panneau *Leçons* : un module d'accueil ferait de
   chaque apprenant quelqu'un à 1/28 dès la connexion, et le catalogue afficherait 27 modules là où
   la fiche formation en annonce 27.
2. **Il arriverait au mauvais moment.** Un module se joue une fois, au début. Or « comment on
   revoit une démonstration ? » se demande à la 40ᵉ leçon, pas à la première.
3. **Il ne survivrait pas au produit.** Un module décrit l'interface par des mots et des images ; à
   la première évolution du cockpit, il ment. Le guide transversal, lui, **pointe l'élément vivant** :
   il suit l'interface au lieu de la décrire.

### Ce qu'il coûte au reste du LMS : rien

Le guide ne crée aucune entité, ne consomme aucune progression, n'écrit aucune note, ne touche à
aucun score. C'est une couche d'interface. Son seul point d'ancrage produit est un bouton dans la
barre du cockpit.

---

## 2. Le parcours : 9 sujets, 10 étapes

L'étape 1 accueille et pose les règles du jeu ; les 9 suivantes couvrent exactement les 9 sujets
demandés. Chaque étape suit le même gabarit en trois temps :

- **ce que c'est** — deux ou trois phrases, jamais plus ;
- **à retenir** — l'objectif d'apprentissage, explicite : ce qu'il faut avoir compris en sortant ;
- **à vous d'essayer** — un geste réel à faire sur l'atelier, avec retour immédiat.

| # | Sujet | Cible du projecteur | Ce que l'apprenant FAIT |
|---|---|---|---|
| 1 | Accueil et règles du guide | — (voile plein) | lit ; découvre qu'il peut sauter, revenir, fermer |
| 2 | Modules, chapitres, progression | bouton **Leçons** | ouvre le sommaire, change de chapitre, voit le fil changer |
| 3 | Ressources PDF | bouton **Ressource pédagogique téléchargeable** | ouvre un support, le télécharge, le referme |
| 4 | Prise de notes | bouton **Notes** | écrit, attend « Note enregistrée », voit la pastille verte |
| 5 | Leçon / exercice / évaluation | badge d'étape | saisit `=SOMME(B4:D4)` en E4 et obtient 3 520 |
| 6 | Démonstrations guidées | encart d'aide | clique **Montrez-moi**, regarde, puis **Revoir** |
| 7 | Indices et aides | bouton **Un indice** | lit l'indice, puis répond à un QCM sur ce qu'un indice ne fait jamais |
| 8 | Évaluation sans aide | barre du cockpit | voit la barre virer à l'or, passe une question |
| 9 | Parcours après évaluation | carte de bilan | lit acquis / priorités, clique vers la leçon exacte |
| 10 | Reprise et avancement | segments de progression | rouvre *Leçons*, voit la jauge de formation |

### Les interactions ne sont pas décoratives

Ce ne sont pas des animations : ce sont les **vrais** comportements.

- L'étape 5 fait passer la saisie par un **mini-moteur de calcul** : `=SOMME(B4:D4)` est *évalué*,
  pas comparé à une chaîne. `=SUM(B4:D4)` marche aussi ; une plage différente donne un autre total.
  Le résultat affiché est donc calculé, comme dans l'atelier — la règle du player, « une formule
  affiche son RÉSULTAT, jamais un nombre inventé », est respectée jusque dans l'aperçu.
- L'étape 6 rejoue la mécanique de `DemonstrationGeste.tsx` : curseur qui se déplace, halo sur la
  cible, bulle ancrée, **frappe caractère par caractère**, validation, puis les deux boutons
  *Revoir la démonstration* et *J'ai compris — continuer*.
- L'étape 8 bascule réellement le cockpit en mode évaluation : `#10201B` → `#3A2410`, badge
  **ÉVALUATION NOTÉE**, disparition du bouton *Un indice*, encart doré avec *Passer la question*.

---

## 3. Fidélité au cockpit réel

L'arrière-plan n'est pas une maquette : c'est une réplique tirée du code, valeur par valeur.

| Élément | Source | Valeur reprise |
|---|---|---|
| Barre du cockpit | `SimulationPlayer.tsx` | hauteur 44 px, fond `#10201B`, `#3A2410` en évaluation |
| Boutons de la barre | idem | 28 px, `rgba(255,255,255,.09)`, actif = fond blanc + texte `#10201B` |
| Segments de progression | idem | `#4ED08A` fait · blanc en cours · `rgba(255,255,255,.16)` à venir |
| Badges d'étape | idem | *À comprendre* `#E8F0F3`/`#3E5A67` · *À vous de jouer* `#E7F3EB`/`#107C41` · *Évalué* `#FBF1DF`/`#8A5A12` |
| Encarts d'aide | idem | aide `#FDEDEC`/`#F3D2CE` · démonstration `#E7F3EB`/`#BFE3CD` · évaluation `#FBF1DF`/`#EBD9B4` |
| Panneaux glissants | `PanneauRessources.tsx` | `translateX(101%)`, `.26s cubic-bezier(.32,.72,0,1)`, largeurs 460 / 340 / 380 |
| Vert Excel | `DemonstrationGeste.tsx` | `#107C41`, foncé `#0b5c30`, encre `#171a18` |
| Palette warm, ombres, ressort | `tailwind.config.ts` | `warm-50…700`, `cubic-bezier(.22,1.4,.36,1)` |
| Polices | `globals.css` | DM Sans, titres Fraunces — **avec leurs repli déclarés** (voir §7) |

Les libellés sont ceux du produit, au caractère près : « Ressource pédagogique téléchargeable »,
« À vous de jouer », « J'ai compris, continuer », « Étape précédente », « Montrez-moi »,
« Revoir la démonstration », « Passer la question », « Compté dans votre note ».

Le contenu de la feuille (ventes T1, cinq produits, trois mois) et l'arborescence de trois modules
sont **fictifs et cohérents** : l'aperçu ne touche à aucune donnée réelle et n'en affiche aucune.

---

## 4. Le point difficile : la place, sur un téléphone

C'est le seul vrai problème de conception de ce guide, et il a demandé deux corrections
successives. Il mérite d'être expliqué parce qu'il se reposera à l'intégration.

### Le conflit

Sur un téléphone, la carte du guide et l'atelier se disputent le **même bas d'écran**. Or les trois
contrôles que le guide demande justement d'actionner — **Montrez-moi**, **Un indice**,
**Passer la question** — vivent dans la bande consigne, en bas. Une feuille basse posée « en bas par
principe », l'idiome mobile évident, **recouvrait exactement ce qu'elle demandait de cliquer**.

Le premier banc l'a montré sans ambiguïté : trois étapes échouaient avec
`<div id="carteGuide"> intercepts pointer events`.

### La solution retenue : placement calculé, puis repli

Le placement mobile n'est plus un choix fixe, c'est un calcul (`placerMobile`) :

1. On liste les **zones interdites** : le contrôle à toucher (`toucher`, déclaré par étape), la
   cible du projecteur, tout panneau ouvert. Les zones hors du champ visible sont ignorées — les
   compter fausserait le résultat.
2. On essaie quatre dispositions, dans cet ordre de préférence : *feuille basse pleine*,
   *bandeau haut plein*, puis les deux mêmes **repliés**.
3. On retient la **première qui ne recouvre rien**. Si aucune n'est libre, on prend la moins
   gênante, en version repliée, pour que ce qui reste couvert soit le plus petit possible.

Le **mode compact** garde le titre, le numéro d'étape, l'énoncé de la tâche, le sommaire et la
navigation ; il masque le texte long, le rappel et les pastilles. Un chevron rend la main à
l'apprenant à tout moment. Et **la carte se redéploie d'elle-même dès que la tâche est faite** :
le contexte revient au moment exact où il ne gêne plus.

Résultat mesuré sur 390 × 844 : étapes 2, 3, 4 et 10 → feuille basse ou repliée basse selon le
panneau ouvert ; étapes 6, 7, 8 → bandeau haut, les commandes de la bande consigne restent
entièrement libres ; étape 9 → repliée, le bilan défile dessous.

### Le même problème, en plus discret, sur desktop

La première capture 1440 × 900 a montré la carte posée à cheval sur l'énoncé de la consigne. Le
contrôle visé restait cliquable, mais **le texte pédagogique était à moitié masqué** — inacceptable
pour un guide dont le sujet est justement de savoir lire la consigne. Correction : quand la cible
occupe plus de 55 % de la largeur (une bande, donc) et que la carte se place au-dessus, elle
s'**aligne à droite** au lieu de se centrer. L'énoncé, aligné à gauche, reste lisible à côté.

---

## 5. Accessibilité

- **Cibles tactiles.** Tous les contrôles **du guide** font ≥ 44 px : en-tête 44 × 44, pastilles de
  progression 18 × 44, navigation 44 min, choix de QCM 44 min, lignes de sommaire 44 min.
  Les contrôles **du cockpit** gardent leurs 28 px visuels — c'est l'application réelle, et les
  changer aurait rompu la fidélité — mais reçoivent une zone tactile de 44 px via `.hit44`
  (`::after` de 44 px de haut, centré, sans effet sur la mise en page). Le banc vérifie les deux.
- **Clavier.** `←` / `→` naviguent, `Échap` ferme le sommaire puis le guide, le focus revient au
  bouton *Guide* à la fermeture. Tous les contrôles sont des `<button>` atteignables au `Tab`.
- **Lecteurs d'écran.** `role="dialog"` + `aria-labelledby`/`aria-describedby` ; le corps de la carte
  est une région `aria-live="polite"` — le changement d'étape est annoncé sans voler le focus. Les
  boutons du cockpit portent `aria-pressed` et `aria-label`, les panneaux `aria-hidden`, le
  projecteur `aria-hidden` (purement visuel), les pastilles un `aria-label` explicite.
- **`prefers-reduced-motion`.** Toutes les animations et transitions tombent à 0,001 ms, la
  respiration du projecteur et l'appel du bouton *Guide* sont désactivés, et la démonstration
  **joue toutes ses phases** mais à durée nulle : elle finit sur le même état, écrit la même valeur,
  affiche les mêmes boutons. Le banc rejoue le parcours complet dans ce mode.
- **Non modal assumé.** Le voile est `pointer-events: none` : l'atelier reste entièrement
  manipulable pendant le guide. C'est la condition pour que « à vous d'essayer » veuille dire
  quelque chose. L'assombrissement est un signal, pas une barrière.

---

## 6. QA — 66 contrôles, 0 échec

`node generated/qa-guide/qa.mjs` · trois environnements : **desktop 1440 × 900**,
**mobile 390 × 844** (`isMobile`, `hasTouch`, DPR 3), **reduced-motion**.

Chaque environnement passe les 22 mêmes contrôles :

- réplique du cockpit (barre à 44 px, 440 cellules, ruban) ;
- accroche de première visite, ouverture du guide ;
- **les 10 étapes jouées pour de vrai**, chacune avec sa mini-interaction et la validation de sa
  tâche — le panneau s'ouvre, le chapitre change, le PDF s'ouvre et se ferme, la note s'enregistre
  et survit à la réouverture, la formule est évaluée à 3 520, la démonstration va au bout **et se
  rejoue**, l'indice s'affiche, le QCM refuse puis accepte, le cockpit vire à l'or, le bilan
  renvoie vers la bonne leçon ;
- sommaire et saut libre, précédent/suivant, clavier, fermeture/réouverture ;
- cibles tactiles ≥ 44 px, zone `.hit44` du cockpit ;
- absence de débordement horizontal ;
- carte du guide dans le cadre **sur les 10 étapes** et jamais sous le bandeau ;
- alignement du projecteur sur sa cible (± 0 px mesuré) ;
- remise à zéro complète par *Rejouer* ;
- **console propre** : aucune erreur, aucun avertissement, aucune `pageerror`.

Deux garde-fous méritent d'être signalés parce qu'ils vérifient une exigence de conception, pas un
détail d'affichage :

- `libre(page, sel)` contrôle par `elementFromPoint` que le contrôle demandé est bien l'élément le
  plus haut à son centre. Il est posé **avant chaque clic disputé** — `#btnMontrer`, `#btnIndice`,
  `#btnPasser`, l'entrée de sommaire, la cellule E4. Aucun clic n'est forcé (`force: true`
  n'apparaît nulle part) et aucune assertion n'a été retirée ni assouplie.
- L'étape 8 vérifie qu'**aucun corrigé ne fuit** : le texte de l'encart d'évaluation ne contient ni
  `=SOMME`, ni `3520`, ni `3 520`.

### Trois défauts trouvés par le banc, et corrigés

1. **Pastilles de progression inatteignables.** Un point de 8 px avec une zone tactile étendue en
   `::after` faisait déborder chaque cible sur sa voisine, qui interceptait le clic. Corrigé : chaque
   pastille est un bouton de 18 × 44 px contenant un point de 8 px — les cibles se juxtaposent au
   lieu de se recouvrir.
2. **Bandeau d'aperçu par-dessus la bande consigne.** Le bandeau `fixed` recouvrait la dernière
   rangée, donc *Montrez-moi*. Corrigé : sa hauteur est réservée (`--ruban-h`), `#app` s'arrête
   au-dessus, et le placement de la carte en tient compte.
3. **Carte mobile sur les contrôles demandés** — §4.

---

## 7. Ce qu'il faut arbitrer avant d'intégrer

Rien n'est bloquant ; ce sont des décisions produit, pas des correctifs.

1. **Où vit le bouton.** L'aperçu le met dans la barre du cockpit, entre le compteur d'étapes et la
   croix de sortie. C'est l'endroit où il est utile — dans l'atelier — mais la barre est déjà dense
   sous 640 px : le libellé « Guide » y disparaît, seul le `?` reste. Alternative à trancher : le
   remonter dans la `TopNav` du LMS, où il serait visible partout (accueil, documents, résultats)
   mais moins présent au moment du blocage. **Recommandation : garder le cockpit**, et ajouter plus
   tard une entrée secondaire dans la `TopNav` si le besoin se confirme.
2. **Première visite.** L'aperçu propose une accroche « Première fois ici ? » ancrée au bouton.
   En production, elle suppose de mémoriser que l'apprenant a vu le guide. Le moins coûteux est un
   `localStorage` par utilisateur ; une vraie persistance demanderait un champ Prisma. **À décider :
   `localStorage` (rien à migrer) ou colonne `User.guideVu` (fiable entre appareils).**
3. **Polices.** L'aperçu est strictement autonome — aucune requête réseau, donc aucune police
   téléchargée. Il s'appuie sur les **repli déjà déclarés dans le produit** : `DM Sans → system-ui`,
   `Fraunces → Georgia`. Sur un poste sans ces polices installées, le rendu est légèrement plus
   étroit que la production, qui les sert. Ce n'est pas un écart de conception.
4. **Cellules figées pendant le guide ?** Aujourd'hui l'atelier reste entièrement manipulable, ce
   qui est voulu. Reste un cas : un apprenant qui, pendant l'étape 5, saisit dans une **autre**
   cellule que E4. Le geste est accepté, la tâche du guide n'est pas validée, et rien ne le lui dit.
   **Suggestion : ajouter un retour doux** (« ce n'est pas la cellule visée par le guide ») plutôt
   que de verrouiller la feuille, ce qui contredirait le principe.
5. **Étendue.** Le guide est écrit pour l'atelier de simulation. Le **player classique** (SEO, SEA,
   VBA — vidéo, PDF, quiz, chapitres) partage les notes, les documents et la progression, mais pas
   la démonstration ni l'évaluation gestuelle. Un guide dérivé y demanderait 5 étapes sur 9.
   **À arbitrer : deux jeux d'étapes selon le type de formation, ou un seul guide qui masque les
   étapes sans objet.**
6. **Le tutoiement.** L'aperçu vouvoie, comme le reste du LMS (« Vous bloquez ? », « Votre note »).
   C'est cohérent avec le produit, à confirmer.

---

## 8. Ce que ce travail n'a pas fait

- Aucun fichier de `app/`, `components/`, `lib/`, `prisma/`, `scripts/` n'a été créé ni modifié.
- Aucun commit, aucun push, aucun déploiement Railway, aucune migration, aucun `seed`.
- Aucune donnée réelle lue ou affichée : la feuille, les modules, les documents, la note de 62 %
  et les deux priorités du bilan sont des exemples construits pour l'aperçu.
- Aucune réponse d'évaluation, aucun secret de correction : la seule formule montrée
  (`=SOMME(B4:D4)`) appartient à une **leçon**, où la démonstration est précisément ce que le
  produit offre.

**Prochaine étape : votre validation de la direction.** L'intégration ne commencera pas sans elle.
