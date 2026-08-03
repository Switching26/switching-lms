# Intégration du guide interactif — plan

Suite de `CONCEPTION-GUIDE-FORMATION-INTERACTIF.md`, direction validée par Samuel le 03/08/2026.
Périmètre de cette première version : **le cockpit des simulations Excel uniquement**. Le player
classique SEO/SEA/VBA n'est pas touché.

---

## 1. Le principe d'architecture, en une phrase

> Le guide **lit** le cockpit. Il ne le pilote jamais.

C'est la garantie de non-mutation, et elle est **structurelle, pas déclarative** : le composant
`GuideFormation` ne reçoit aucun setter, aucun callback métier, aucune fonction du player. Il reçoit
trois choses — un booléen `ouvert`, deux fonctions d'ouverture/fermeture qui ne touchent qu'à ce
booléen, et une référence au conteneur pour se positionner. Il ne peut donc pas incrémenter une
progression, envoyer une réponse ou écrire une note : il n'en a pas le moyen.

Conséquence directe sur la conception des étapes : le guide n'ouvre pas les panneaux à la place de
l'apprenant, comme le faisait l'aperçu. Il **observe** que l'apprenant les a ouverts, via
`MutationObserver` sur le conteneur de l'atelier, et valide la tâche à ce moment-là. C'est plus
juste pédagogiquement — l'apprenant fait le geste — et cela supprime la seule voie par laquelle le
guide aurait pu modifier quoi que ce soit.

## 2. Ancrage sur les vrais contrôles

Le cockpit porte déjà des identifiants stables, posés pour les tests et documentés comme tels dans
`SimulationPlayer.tsx` (« Identifiant stable : le libellé a changé, un test qui vise le texte se
casse à chaque reformulation »). Le guide s'y accroche plutôt que de viser des classes ou du texte :

| Étape | Sélecteur | Existait déjà |
|---|---|---|
| Navigation | `[data-control="sim-sommaire"]` | oui |
| Ressources PDF | `[data-control="sim-ressources"]` | oui |
| Notes | `[data-control="sim-notes"]` | oui |
| Leçon / exercice / évalué | `[data-control="sim-badge-etape"]` | **à ajouter** |
| Démonstration | `[data-control="sim-montrer"]`, `sim-voir-geste`, `sim-revoir-demo` | oui |
| Indices | `[data-control="sim-indice"]` | **à ajouter** |
| Évaluation | `[data-control="sim-cockpit"]` | **à ajouter** |
| Parcours post-évaluation | `[data-control="sim-bilan-reviser"]`, `sim-bilan-renvoi` | oui |
| Reprise | `[data-control="sim-progression"]` | **à ajouter** |

Les quatre ajouts sont des attributs `data-control` posés sur des éléments existants : aucun effet
sur le rendu, aucune logique, aucun risque de régression.

## 3. Dégradation propre

Le cockpit ne rend pas tous ses contrôles en permanence : `sim-sommaire` n'existe que si un sommaire
est fourni, `sim-notes` que si `onNote` est passé, `sim-ressources` que si des documents existent
(et l'intersection « chapitres de simulation × documents » est vide en production, cf. le skill),
`sim-indice` que hors évaluation, `sim-montrer` qu'après un blocage.

Le guide résout donc sa liste d'étapes **à l'ouverture**, en interrogeant le DOM :

- une étape dont la cible est absente et qui est marquée `exigeCible` disparaît de la liste, du
  sommaire et de la numérotation ;
- une étape dont la cible est absente mais qui reste utile à lire (la démonstration, par exemple,
  dont le bouton n'apparaît qu'après trois erreurs) est **conservée sans projecteur** : la carte
  explique, le voile reste plein, et la tâche est présentée comme « à faire quand le bouton
  apparaîtra ».

Un guide à 6 étapes sur un chapitre pauvre reste un guide juste. Il ne montre jamais un projecteur
qui pointe le vide.

## 4. Fichiers

| Fichier | Nature | Rôle |
|---|---|---|
| `lib/simulation/guide-formation.ts` | **nouveau** | les étapes, en données pures : titres, textes, cibles, prédicats de validation. Aucun import React, donc testable par le checker sans navigateur. |
| `components/simulation/GuideFormation.tsx` | **nouveau** | le composant client : projecteur, carte, sommaire, placement calculé, mode compact, clavier, ARIA, `localStorage`. |
| `components/simulation/SimulationPlayer.tsx` | **modifié** | bouton `Guide` dans la barre, montage du composant, 4 `data-control` ajoutés, une prop `cleGuide`. |
| `components/simulation/SimulationChapter.tsx` | **modifié** | passe-plat de `cleGuide`. |
| `app/learner/formation/player.tsx` | **modifié** | passe `userId` en `cleGuide`. |
| `scripts/check-guide-formation.ts` | **nouveau** | contrôles anti-régression sans navigateur. |
| `components/PwaInstallBanner.tsx` | **modifié** | marqueur `data-pwa-invite` sur ses trois variantes. |
| `app/globals.css` | **modifié** | retrait temporaire de l'invitation pendant qu'une surcouche est ouverte. |
| `generated/qa-guide/qa-integration.mjs` | **nouveau** | QA Playwright sur l'application réelle. |

Rien d'autre. Pas de route API, pas de migration, pas de table, pas de dépendance ajoutée.
Volume total sur les fichiers applicatifs : **118 lignes ajoutées, 6 retirées**, réparties sur
cinq fichiers.

## 5. État de première visite

- Clé : `sf-guide-formation:v1:<userId>` dans `localStorage`. `userId` remonte déjà jusqu'au player
  apprenant (`page.tsx` le passe, ligne 110) : deux passe-plats suffisent, aucune migration Prisma.
- Sans identifiant (aperçu admin), repli sur `sf-guide-formation:v1:anon` — le guide reste
  utilisable, seule la mémoire de première visite devient locale au navigateur.
- La version dans la clé sert à reproposer le guide après une refonte du cockpit : incrémenter
  `VERSION_GUIDE` suffit.
- `localStorage` est lu dans un `useEffect`, jamais au rendu : pas de désaccord serveur/client.
  Un accès qui échoue (mode privé, quota) est avalé — le guide fonctionne, il ne se souvient pas.

## 6. Événements observés, et rien d'autre

Le guide n'écoute que le DOM, à travers un seul `MutationObserver` sur le conteneur de l'atelier
(`attributes`, `childList`, `subtree`) plus un `resize`/`scroll` pour le placement. Chaque étape
porte un prédicat pur `valide(racine: HTMLElement): boolean`, par exemple :

```ts
// Le panneau « Leçons » est ouvert : le bouton le dit (`aria-pressed`), et le
// panneau lui-même le confirme (`aria-hidden`). Deux chemins, pour qu'un
// renommage d'attribut ne rende pas le guide sourd aux gestes de l'apprenant.
valide: (r) => estOuvert(r, "sim-sommaire", "Toutes les leçons")
```

Aucun `addEventListener` sur les contrôles du cockpit, aucun `click()` programmatique, aucune
écriture. Le checker le vérifie par analyse statique du fichier (§7).

## 7. Anti-régressions — `scripts/check-guide-formation.ts`

Contrôles sans navigateur, lancés en CI locale comme les `check-*.ts` existants :

1. **Aucun secret.** Les textes du guide ne contiennent ni formule, ni `=SOMME`, ni valeur de
   correction, ni le mot « réponse » suivi d'un signe égal.
2. **Aucune mutation.** Le composant n'importe rien de `@/lib/progress`, `@/lib/simulation/attempt`,
   ne contient ni `fetch(`, ni `.click()`, ni `dispatchEvent`, ni `POST`, ni `PUT`.
3. **Ancrage réel.** Chaque `cible` déclarée dans `guide-formation.ts` existe bien comme
   `data-control` dans les sources du cockpit — un renommage de contrôle casse le test, pas le guide
   en production.
4. **Étapes bien formées.** Titre, texte, `retenir` et `tache` non vides ; identifiants uniques ;
   pas de `placement` inconnu.
5. **Cibles tactiles, largeur ET hauteur.** Le contrôle relit chaque balise `<button` du composant
   et exige 44 dans les deux dimensions ; il vérifie aussi que le bouton `sim-guide` du cockpit fait
   44 × 44, et que l'indicateur de progression n'est **pas** redevenu un rang de boutons. La version
   précédente ne listait que des hauteurs isolées : un bouton de 18 × 44 passait au vert. Sensibilité
   prouvée par mutation — remettre `width: 18` sur un bouton fait échouer le contrôle.
6. **Dialogue accessible.** `role="dialog"`, focalisable, `aria-labelledby`, `aria-describedby` qui
   s'adapte au mode replié, focus donné puis rendu — et **pas de piège à focus**, puisque le guide
   demande d'agir sur le cockpit.
7. **Vouvoiement.** Avec des frontières de mot Unicode : `\btes\b` reconnaissait « vous ê|tes ».
8. **Aucun nom de plateforme interne** dans les textes.
9. **Clé de stockage** versionnée et cloisonnée par apprenant.
10. **Branchement** : bouton présent, ancres posées, composant monté, et le bouton ne fait rien
    d'autre qu'ouvrir/fermer.
11. **Pureté** du fichier d'étapes : ni React, ni `window`, ni `document`.

Douze contrôles au total.

## 8. Résultat des vérifications

Tout est au vert, en local, sur la base jetable `switching_lms_guide`.

| Vérification | Résultat |
|---|---|
| `npx tsx scripts/check-guide-formation.ts` | **12/12** |
| `npx tsx scripts/check-ressources.ts` | 48 contrôles, 0 échec |
| `npx tsx scripts/check-actions-document.ts` | 36 contrôles, 0 échec |
| `npx tsc --noEmit` | 0 erreur |
| `git diff --check` | propre |
| `env -u TURBOPACK npm run build` | compilé, 49/49 pages |
| `node generated/qa-guide/qa-integration.mjs` | **67/67** sur 3 environnements |

La QA d'intégration tourne sur l'application réelle — connexion, formation, entrée
dans l'atelier — en **desktop 1440 × 900**, **mobile 390 × 844** (`isMobile`, `hasTouch`) et
**reduced-motion**. Aucun clic n'est forcé : `force: true` n'apparaît nulle part.

Ce qu'elle prouve, dans les trois environnements :

- le bouton **Guide** est présent, ≥ 44 px, libellé accessible, et atteignable au doigt ;
- l'accroche de première visite s'affiche une fois et ouvre le guide ;
- les 9 étapes sont **résolues sur le cockpit réel** ;
- le projecteur se pose sur le vrai bouton à **± 0 px** ;
- **le geste réel valide la tâche** : ouvrir vraiment le panneau *Leçons* déclenche la
  reconnaissance, sans que le guide y touche ;
- le cockpit **reste manipulable** sous le voile (`pointer-events: none`) ;
- les 9 étapes s'enchaînent sans que la carte sorte du cadre ni couvre son propre projecteur ;
- fermeture, **retour du focus au bouton**, réouverture ;
- les flèches naviguent **dans** la carte et restent inertes ailleurs ;
- `aria-describedby` pointe toujours un nœud existant, y compris replié ;
- le conteneur garde `scrollLeft === 0` et n'est plus un scrollport ;
- l'invitation d'installation est **rendue par l'application** mais ne recouvre rien, et
  **revient à la fermeture** ;
- les **13 à 14 cibles interactives** du guide, sommaire déplié, sont mesurées **≥ 44 × 44** —
  lignes de sommaire comprises (358 × 44) ;
- les 9 pastilles de progression sont visibles, **non cliquables**, et l'avancement est annoncé ;
- **aucune mutation** : empreinte base identique avant/après le guide.

### La preuve de non-mutation

Une empreinte MD5 est prise **juste avant l'ouverture du guide** et **juste après le
parcours**, dans chaque environnement. `SimulationAttempt` et `Note` sont pris
intégralement ; sur `Progress`, `timeSpentSeconds` et `sessionCount` sont exclus — ce sont
les compteurs de présence, écrits en continu par la page apprenant tant que le chapitre est
ouvert, guide ou pas. `completedAt` et `lastPosition` restent sous surveillance. Bilan de
bout en bout : **0 tentative, 0 note** créées sur les trois scénarios.

---

## 9. Les défauts trouvés en route, et corrigés

Aucun n'était visible sans mesure. Ils valent d'être listés, deux d'entre eux touchaient
le cockpit lui-même.

1. **`aria-pressed` absent sur *Leçons* et *Notes*.** Ces bascules n'annonçaient pas leur
   état — ni à un lecteur d'écran, ni au guide, dont le prédicat ne pouvait donc jamais
   reconnaître l'ouverture. Attribut ajouté ; le prédicat lit désormais aussi le panneau
   lui-même, pour ne pas dépendre d'un seul attribut.
2. **Le conteneur de l'atelier était un scrollport.** Les trois panneaux fermés, poussés
   hors cadre par `translateX(101%)`, portent son `scrollWidth` à 721 px pour 390 px
   visibles. `overflow: hidden` masquait le débordement mais laissait le conteneur
   scrollable : il suffisait qu'un élément prenne le focus pour que **tout l'atelier glisse
   de 40 px**, cockpit compris — mesuré en 390 × 844. Passé en `overflow: clip`, qui
   supprime le scrollport. C'est exactement l'intention déjà écrite dans le code (« cette
   structure n'a AUCUN défilement »), rendue impossible à contourner. `rectRelatif` tient
   en plus compte du défilement du conteneur, pour que le calcul reste juste en toutes
   circonstances.
3. **Boucle de rendu sur écran étroit** (React #185). `placer()` écrivait `compact`, qui
   figurait dans les dépendances de l'effet appelant `placer()`. Sur écran étroit, où
   `compact` est un *résultat* du calcul, la boucle était infinie. Poseurs idempotents, et
   `compact` retiré des dépendances.
4. **L'invitation d'installation recouvrait le guide.** Montée au niveau racine en `z-40`,
   alors que l'atelier vit dans un portail `z-index: 30` : elle passait devant la carte et
   ses commandes. Le composant prévoyait déjà ce cas pour `/evaluation/` (« la bannière
   recouvrait les questions ») ; on généralise avec un marqueur `data-pwa-invite` et une
   règle `html[data-surcouche] [data-pwa-invite] { display: none }`. Rien n'est désactivé :
   l'attribut disparaît à la fermeture et la bannière revient — la QA le vérifie.
5. **Huit pastilles de progression sur neuf étaient transparentes.** `background`
   (raccourci) et `backgroundColor` (longhand) dans le même objet de style React : le
   second, à `undefined`, annulait le premier. Le guide paraissait n'avoir qu'une étape.
   Une seule propriété de fond désormais.
6. **Le texte de la tâche se coupait au milieu d'un mot** sur écran étroit, sans rien qui
   annonce la suite. Voile en dégradé, comme le fait déjà la bande consigne du player.
7. **Les pastilles de progression étaient des boutons de 18 × 44 px** — sous les 44 × 44 annoncés,
   relevé en production par CheckOS. Mon assertion de QA ne les attrapait pas : elle exigeait
   `height >= 44` mais tolérait `width >= 18`, c'est-à-dire exactement leur largeur. Les élargir
   était impossible : dix cibles de 44 px font 440 px dans un pied de 384. Or elles ne faisaient que
   **doubler le sommaire**, qui porte la même navigation avec les titres, en lignes de 44 px, et
   reste accessible dans les deux états de la carte. Elles deviennent donc un **indicateur non
   interactif** : `<span aria-hidden>` dans un conteneur `role="img"` qui annonce l'avancement d'un
   seul tenant. Plus rien à toucher là, donc plus rien de trop petit — et une seule navigation au
   lieu de deux. Checker et QA mesurent désormais les deux dimensions, sans seuil de complaisance.

Deux faux positifs de mon propre contrôleur ont aussi été corrigés : `dispatchEvent`
détecté dans le commentaire qui explique qu'il est interdit, et `\btes\b` reconnaissant
« vous ê|tes » parce que `\b` ne considère que l'ASCII.

---

## 10. Ce qui reste ouvert

- **La bannière PWA recouvre l'atelier lui-même**, guide ou pas : c'est le même conflit
  `z-40` contre portail `z-30`, et il est antérieur à ce travail. Elle passe devant la bande
  consigne sur mobile. Corrigé ici seulement pendant que le guide est ouvert, parce que
  c'était le périmètre demandé. Le corriger pour tout l'atelier demande un arbitrage :
  masquer l'invitation dès qu'un atelier est ouvert, ou remonter le portail au-dessus de
  `z-40`.
- **Le player classique SEO/SEA/VBA** n'est pas couvert, comme convenu. Il partage notes,
  documents et progression, mais ni la démonstration ni l'évaluation gestuelle : un guide
  dérivé y aurait 5 étapes sur 9.
- **Le chapitre de QA local n'a pas de document attaché**, donc l'étape *Ressources* sort du
  parcours par la dégradation prévue — 9 étapes au lieu de 10. C'est le comportement voulu,
  et c'est aussi le cas en production, où l'intersection « chapitres de simulation ×
  documents » est vide.

---

## 11. Vérifications à rejouer

```bash
npx tsx scripts/check-guide-formation.ts
npx tsx scripts/check-ressources.ts
npx tsx scripts/check-actions-document.ts
npx tsc --noEmit
git diff --check
env -u TURBOPACK npm run build
# serveur local sur la base jetable, puis :
node generated/qa-guide/qa-integration.mjs
```

## 12. Ce que cette intégration ne fait pas

Aucun commit, aucun push, aucun déploiement Railway, aucune migration, aucun seed, aucune
écriture en base de production. La QA tourne sur la base locale jetable
`switching_lms_guide` du Mac, avec un compte de test créé pour l'occasion.
