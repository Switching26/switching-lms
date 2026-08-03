# Parcours de révision après une évaluation — conception et intégration

Formation « Excel 2024 — Du débutant à l'avancé » · 27 modules · 246 chapitres de simulation ·
27 évaluations notées.

**Statut : intégré dans ce worktree, vérifié, non déployé.** Les 27 blocs de remédiation sont
écrits dans les scénarios, le moteur est branché à l'API et aux deux écrans, et l'ensemble passe
`tsc`, le build Next et 1 240 contrôles dédiés. **Rien n'est semé, rien n'est poussé, rien n'est
déployé, aucune migration n'a été appliquée ailleurs qu'à une base de test jetable** (§10).

Une revue de sécurité indépendante a trouvé deux défauts BLOCANTS après la première intégration.
Les deux sont reproduits, corrigés et couverts par des contre-épreuves : §2.2 (une coordonnée peut
être la réponse) et §2.4 (la note ne venait pas du serveur).

Aperçu de référence : `artifacts/parcours-post-evaluation-preview.html` (quatre états, 390 px /
desktop). L'écran réel s'en écarte sur un point, signalé au §3.4.

---

## 1. Le principe

> Une évaluation ratée ne demande pas un nouvel exercice. Elle demande de savoir **quoi rouvrir**.

Aucune nouvelle épreuve, aucun défi, aucun quiz de rattrapage : les 27 évaluations existantes
suffisent. Le résultat d'un passage devient une **liste courte et ordonnée de leçons à rouvrir**,
appuyée sur un bilan par compétence.

Trois règles portent tout le reste :

1. **Rien ne s'affiche qui ne soit déclaré.** Pas d'inférence textuelle, pas de repli sur « la leçon
   la plus proche ».
2. **Aucune correction n'est donnée.** Le bilan dit quelle compétence n'est pas tenue et quelle
   leçon la porte. La réponse reste dans la leçon.
3. **En cas de doute, silence.** Un bilan incomplet, invérifiable ou mal formé disparaît
   entièrement ; la note, elle, reste affichée.

---

## 2. La fuite préexistante, corrigée d'abord

Avant d'ajouter quoi que ce soit, il fallait fermer une porte ouverte.

### 2.1 Ce qui fuyait

`stripGradedSecrets` ne retirait que cinq clés — `attendu`, `expected`, `solution`, `aide`,
`hint` — et **seulement au premier niveau de l'étape**. Or les réponses des 27 évaluations ne
vivent à aucun de ces endroits : elles vivent dans `action`.

```jsonc
"action": { "type": "TYPE", "target": "D3",
            "accept": ["=SIERREUR(RECHERCHEV(B3;$H$3:$J$6;2;FAUX);\"Code inconnu\")"] }
```

La formule attendue partait telle quelle au navigateur. L'onglet réseau donnait le corrigé complet
d'une évaluation notée. Le champ `clientValidation: false` était bien émis par l'API… et lu par
personne : `verify/route.ts` existait et n'était appelée par aucun composant.

### 2.2 Premier blocant : une coordonnée peut ÊTRE la réponse

La première correction partageait le scénario en deux — le CRITÈRE public, la RÉPONSE secrète — et
rangeait toutes les coordonnées de geste du côté public, au motif qu'elles s'affichent déjà sous la
consigne. C'était faux, et mesurable :

```
M04-EV01-03  « Trouvez la ligne en trop »           → servi  {"row": 7}
M07-EV01-05  « Placez-vous sur la cellule fautive » → servi  {"cell": "E6"}
M26-EV01-06  « sélectionnez le tableau »            → servi  {"range": "A1:C6"}
```

Dans ces trois cas, TROUVER la coordonnée EST la question. Mesure sur les 27 évaluations :
**187 cibles servies sur 353 n'étaient nommées nulle part dans leur consigne.**

**La règle retenue** : une coordonnée ne part au navigateur que si la consigne de SON étape la
nomme déjà. Le test porte sur la consigne seule, pas sur le classeur — ce qui est écrit dans la
consigne est donné, ce qui est visible dans la feuille demande encore de chercher. Un bouton est
cherché par son libellé (« Gras »), pas par son identifiant technique.

**Conséquences, toutes assumées :**

- les tables de cellules attendues ne partent plus DU TOUT, ni valeurs ni références — 111 des 115
  références d'`EXPECT_STATE` n'étaient pas dans leur consigne. L'atelier envoie désormais un
  **relevé borné de la zone utile** du classeur, et le serveur y prélève lui-même les cellules
  qu'il attend : le navigateur ne sait plus lesquelles comptent ;
- une saisie dont la cible n'est pas nommée ne **verrouille plus aucune cellule** — verrouiller la
  bonne reviendrait à la désigner ;
- le **nettoyage silencieux des cellules parasites est désactivé en évaluation**. Sans les
  références attendues, la remise d'aplomb aurait pris les réponses de l'apprenant pour des
  parasites et les aurait effacées au changement d'étape. C'est d'ailleurs la bonne règle en soi :
  sur une copie notée, on n'efface pas ce que l'apprenant a écrit. Leçons et exercices gardent le
  mécanisme intact ;
- une vingtaine de formulations de `attendu.ts` ont reçu un repli (« la ligne demandée » au lieu de
  « la ligne 7 »), sans quoi l'écran affichait « la ligne undefined ».

**Résultat mesuré : 0 cible muette sur les 27 évaluations**, 150 coordonnées encore servies, toutes
nommées dans leur consigne. Contre-épreuves sur m04, m07, m26 et m27 : la cible existe dans le
corpus, elle n'est plus servie, la phrase affichée reste propre et ne la cite pas.

**Le rectangle à relever ne renseigne sur rien non plus.** L'atelier doit bien relever QUELQUE PART.
Le borner sur les cellules attendues aurait fait du rectangle un indice — « A1:E11 » dirait que la
cible est en colonne E. Il se calcule donc depuis le **contenu public seul** — classeur de départ et
`setup` des étapes —, plus une marge fixe, arrondie à un palier. Trois contre-épreuves : déplacer une
cible ne change pas le rectangle, retirer toutes les cibles non plus, mais élargir le contenu public
le fait bouger — sans quoi le contrôle passerait sur une fonction constante. Vérifié que les
**162 cellules attendues** du corpus tombent toutes dedans, sans quoi une étape deviendrait
impossible : l'apprenant ferait juste et serait compté faux.

### 2.3 Ce qui a été fait pour les réponses elles-mêmes

**`lib/simulation/expurge.ts`** — deux filets, pas un :

1. une **liste blanche** par type d'action (`actionPublique`) : chaque champ qui a le droit de
   partir est nommé ; tout le reste tombe, y compris un champ ajouté demain à un type existant ;
2. un **balayage récursif** (`retirerClesSecretes`) qui retire les clés porteuses de réponse à
   n'importe quelle profondeur — filet de sécurité pour un type d'action ajouté sans passer par la
   liste blanche.

La ligne de partage est le **critère** contre la **réponse** :

| Ce qui reste (public) | Ce qui part (secret) |
|---|---|
| la cellule où l'on tape (`target`), les références des cellules jugées | les formules acceptées (`accept`), les valeurs attendues |
| le bouton, la ligne, la colonne, la feuille visés | la configuration attendue du graphique, du tableau croisé, de la macro, de la mise en page |
| la plage d'un tri (l'atelier exécute le tri) | la colonne et le sens du tri, les valeurs d'un filtre, la plage à nommer |
| le classeur de départ, les consignes, les démonstrations d'énoncé | `aide`, `feedback`, le bloc `remediation` |

Les tables de cellules (`cells`, `pivot.cells`, `macro.effet`) gardent leurs **clés** — l'atelier
doit lire ces cellules-là pour les soumettre au juge — et perdent leurs **valeurs**.

Les démonstrations d'énoncé sont conservées en **fail-closed strict** : audit des 27 évaluations,
77 gestes, tous de type `MONTRER` sur les 26 écrans d'énoncé. Si un seul geste n'était pas un
`MONTRER` pur, ou portait `ecrire`, toute la démonstration serait abandonnée — une démonstration
amputée d'un geste laisserait croire à l'apprenant qu'il a tout vu.

### 2.3b La correction est passée au serveur

Privé de réponses, le navigateur ne peut plus corriger. C'est exactement ce que `clientValidation:
false` annonce, et il est désormais **lu** :

- `lib/simulation/frappe.ts` porte le juge complet (`jugerEtape`), appelé **des deux côtés** : en
  local pour les leçons et les exercices, par `verify/route.ts` en évaluation notée. Une seule
  implémentation, donc un seul verdict pour un même geste.
- `verify/route.ts` a été aligné : mêmes gardes d'accès que la route qui sert le scénario
  (`lib/simulation/acces.ts`, partagé — l'ancienne copie ignorait l'expiration et la date
  d'ouverture de l'inscription), réservée au mode `EVALUATION`, et `stepId` **obligatoire** et
  concordant avec le rang (`409` sinon : un scénario corrigé entre le chargement de la page et le
  geste décalerait les identifiants).

### 2.4 Second blocant : la note ne venait pas du serveur

Le PUT recevait un `score` et un `stepLog` de deux booléens par étape —
`premierEssai`, `tentee`. Le serveur les assainissait (rang, type, barème repris
du scénario) puis les **croyait**. Reproduit sur `m10-ev01` : une requête portant
les 15 identifiants avec `premierEssai: true`, **sans avoir joué une seule
étape**, obtenait **25/25 — 100 %**.

Une correction intermédiaire — recalculer l'arithmétique et exiger la couverture
complète — ne fermait rien : elle ne changeait pas la matière première, qui
restait déclarée par le client.

**La correction réelle déplace la source de vérité.** Deux tables (migration
préparée, §9.1), et une règle : le navigateur ne déclare plus AUCUNE réussite.

- un **passage** (`SimulationRun`) est ouvert au démarrage réel de l'évaluation,
  repris tel quel au rechargement de la page, remplacé par un rang supérieur au
  « Repasser » ;
- seul `verify` écrit un **verdict** (`SimulationStepVerdict`), et seulement après
  avoir jugé lui-même l'observation contre le scénario en base ;
- le PUT final calcule note, bilan et complétion **depuis ces verdicts, et rien
  d'autre**. Le champ `stepLog` du corps a disparu, `score` aussi.

**Les quatre règles du registre**, et pourquoi chacune :

| Règle | Tenue par | Ce qu'elle empêche |
|---|---|---|
| Un verdict par étape et par passage | contrainte d'unicité en base | deux requêtes simultanées créant deux lignes |
| `premierEssai` monotone — jamais relevé | écriture conditionnelle unique, pas de lire-puis-écrire | une faute perdue dans une course, donc un point donné à tort |
| Ordre imposé (une étape à la fois) | `maxStepIndex` du passage | balayer toutes les étapes pour sonder le juge |
| Passage borné à son propriétaire | l'appartenance est dans le filtre SQL | rejouer l'identifiant de passage d'un autre |
| Clôture sur le curseur SERVEUR | `passagePourCloture` | ouvrir un passage vide puis annoncer « j'ai fini » depuis le client — le chapitre était validé et une note enregistrée |
| Curseur neuf à **-1**, pas à 0 | `maxStepIndex @default(-1)` | à 0, l'étape 1 était déjà recevable (1 ≤ 0 + 1) sans que l'étape 0 l'ait été, et un scénario à une seule étape se clôturait sans le moindre verdict |
| « Passer » irréversible | marqueur `passee` en base, vérifié dans le WHERE de la promotion | une correction déjà en vol revenait après coup et accordait le point d'une question abandonnée |
| Écriture et clôture **sérialisées** | `SELECT … FOR UPDATE` sur le passage, dans la même transaction | un verdict s'écrivant entre le calcul de la note et la pose de `closedAt` : la note ne décrivait plus le registre |
| Relecture automatique sans pénalité | `siJuste` transmis au SERVEUR | l'atelier relit le classeur de lui-même après une remise d'aplomb ; si la relecture était fausse, une faute était inscrite pour un geste que personne n'avait fait |
| Clôture **idempotente** | `cloturerPassage` rend la même note sur un passage déjà clos | une note perdue parce que l'écriture de la tentative avait échoué, sans autre issue que refaire les quinze questions |
| Échec strictement générique | réponse constante de `verify` | se faire souffler la réponse en essayant : les messages de `validateStep` citent parfois le sens d'un tri, un nombre de séries, une référence de macro |

**Pourquoi cela suffit** : fabriquer un verdict demande de produire une observation que le juge
accepte, donc de connaître la réponse — et le scénario servi n'en contient plus aucune (§2.2).
Les deux verrous sont solidaires ; l'un sans l'autre ne vaudrait rien.

**`attemptCount` suit le rang du passage serveur** au lieu d'une condition dérivée de l'état client,
qu'un navigateur pouvait gonfler ou figer.

**Choix conservateur assumé** : la règle « une faute retire le point » est monotone, y compris pour
une faute arrivant après la réussite. C'est ce qui la rend juste sous concurrence — l'ordre
d'arrivée n'est pas l'ordre d'émission. Mesuré : sur vingt écritures simultanées dont une faute, la
version non monotone accordait le point à tort.

### 2.5 L'atelier n'affirme que ce que le serveur a confirmé, et le dit quand il ne peut pas

Deux affirmations étaient faites trop tôt :

- « cette note est enregistrée dans Mes résultats » — annoncée même quand le
  serveur refusait la complétion, et même quand la requête n'arrivait pas ;
- « ce chapitre est terminé » (`onCompleted`, qui coche le chapitre dans le
  sommaire) — émise **avant** la réponse, donc y compris quand la base ne cochait
  rien. L'écart ne se révélait qu'au rechargement de la page.

`deciderApresCompletion` — fonction pure, donc vérifiable — est STRICTE : hors aperçu, une
affirmation exige une confirmation explicite. Réponse absente, muette ou partielle valent « on ne
sait pas », donc « on n'affirme rien ». L'aperçu admin fait exception : rien n'y est jamais écrit,
et refuser de conclure rendrait la relecture d'un atelier interminable.

**La note affichée vient du serveur.** L'atelier l'estimait lui-même ; les deux pouvaient différer,
et « Mes résultats » aurait contredit l'écran de fin. La carte attend donc le bilan, et le dit.

**Le passage s'ouvre au clic « Commencer », pas au montage**, et l'entrée dans l'atelier est bloquée
tant qu'il n'est pas ouvert : ouvrir au montage gonflait le compteur d'essais dès qu'un chapitre
s'affichait, et entrer sans passage aurait laissé jouer une évaluation dont rien n'aurait été noté.
En échec, l'apprenant reste sur l'écran d'ouverture, avec l'explication et le bouton pour réessayer.

**La reprise n'hérite jamais d'un passage joué.** L'atelier repart toujours de la première question
sur une évaluation, et il ne peut pas restituer le classeur au milieu — il n'a plus les réponses,
c'est précisément ce qui ferme la fuite. Un passage entamé est donc **abandonné** au rechargement et
remplacé par un rang neuf, ce que l'écran d'ouverture annonce déjà. Un passage encore vierge, lui,
est repris tel quel : il n'a rien coûté, et brûler un rang à chaque rechargement serait absurde. Les
verdicts abandonnés restent intacts dans leur passage clos — aucun `premierEssai` acquis n'est
dégradé, et une question passée ne peut pas être regagnée.

**Les deltas ne se perdent plus en chemin.** Temps passé, erreurs et aides étaient remis à zéro
AVANT l'envoi : une requête tombée les emportait. Ils sont désormais remis dans la file d'attente en
cas d'échec, où ils s'additionnent aux suivants.

**Trois verrous d'envoi** — un par geste qui fait avancer l'atelier. Sans eux, un double tap lançait
deux requêtes : deux passages ouverts, ou une étape sautée que le serveur n'avait jamais vue passer,
donc tout ce qui suivait refusé pour rupture d'ordre. Boutons désactivés et `aria-busy` pendant la
requête, verrou levé quoi qu'il arrive — sinon une panne réseau condamnerait le bouton.

**Une panne du juge est visible et rejouable.** Si le verdict ne revient pas — réseau tombé, attente
dépassée, passage devenu non recevable — rien n'est compté comme faute, un bandeau l'explique, et le
geste peut être refait. Sans lui, l'apprenant retapait indéfiniment une réponse juste devant un
atelier muet.

### 2.6 La concurrence, qui n'existait pas avant

Un verdict distant ouvre trois accidents qu'une correction locale ne connaît pas : appliquer un
verdict sur l'étape **suivante**, appliquer deux verdicts **dans le désordre**, ou retirer le point
« premier essai » d'une étape **déjà réussie** parce qu'une observation fausse était encore en vol.

`lib/simulation/file-verdicts.ts` prend un **billet à l'émission** de l'observation, applique les
verdicts dans l'ordre des billets, et referme trois portes : étape changée, étape déjà résolue,
verdict plus ancien qu'un verdict déjà appliqué. Une requête sans réponse ne compte **ni** réussite
**ni** faute, et ne fige pas la file (abandon à 15 s).

### 2.7 Troisième blocant : un drapeau du client rendait les essais gratuits

La route de correction acceptait un champ `siJuste` dans le corps. Posé, il faisait qu'un **échec
n'écrivait aucune faute** — il était né d'un besoin légitime : l'atelier relit parfois le classeur
de lui-même après une remise d'aplomb, et cette relecture n'est le geste de personne.

Mais un drapeau qui décide du **coût** d'un essai ne peut pas venir de celui qui essaie. Un
navigateur modifié n'avait qu'à le poser toujours : essayer autant de fois qu'il voulait sans rien
payer, jusqu'à obtenir `ok: true`, puis empocher le point « premier essai ». La réponse continuait
de dire si c'était juste — l'oracle était intact, seul le prix disparaissait.

Il a été **retiré du protocole, sans remplacement**. Ce n'est pas une perte : en évaluation, la
remise d'aplomb ne pose plus de verrou (§2.2, elle ne répare ni n'efface plus rien), donc plus
aucune observation ne se perd, donc le rattrapage n'a plus rien à rattraper. Toute observation jugée
compte désormais selon les mêmes règles, pour tout le monde.

Dans la foulée, la réponse d'un échec a été réduite à `{ ok: false, message }`. Elle portait encore
`compte`, qui distingue « vraie faute » de « tâtonnement » : dire lequel des deux, c'est dire si le
geste était du bon **genre**, donc renseigner sur l'action attendue. L'atelier retombe sur
« tâtonnement » pour l'affichage — la note ne dépend plus de lui depuis le §2.4.

*Éprouvé en HTTP réel* : trois frappes fausses avec `siJuste: true` inscrivent bien trois fautes, et
la réponse est identique au bit près à celle des mêmes frappes sans le drapeau (§9.6).

### 2.8 Quatrième blocant : rejouer une clôture doublait les compteurs

La clôture était idempotente : reclore un passage rend la même note sans rien modifier. C'est ce qui
permet au navigateur de réessayer quand la réponse s'est perdue, sans imposer de tout refaire.

Mais le PUT ne s'arrête pas à la clôture — il **reporte** ensuite le passage sur
`SimulationAttempt` et `Progress`, et ce report contient des écritures qui, elles, ne sont pas
idempotentes : `errorCount`, `hintCount` et `timeSpentSeconds` s'y écrivent en incréments.
Une réponse perdue après le commit, puis le réessai que la clôture autorise justement, les comptait
deux fois : le temps passé sur le chapitre doublait. Un vieux passage clos rejoué pouvait de plus
faire **reculer** `attemptCount`, en y réécrivant son propre rang, plus ancien.

Un **reçu** a été posé sur le passage — `SimulationRun.attemptSyncedAt` — écrit **dans la même
transaction** que le report, sous `SELECT … FOR UPDATE`. Les deux issues sont alors les bonnes :

* réessai **après** le commit → le reçu est là, on ne réécrit rien et la même clôture rend
  exactement le même résultat ;
* réessai **avant** le commit → la transaction a été annulée avec le reçu, le report se refait.

`attemptCount` passe par ailleurs en `Math.max` : le compteur d'essais ne peut plus que monter.

*Éprouvé en HTTP réel* : onze appels de clôture sur le même passage, dont six simultanés, laissent
`errorCount 3`, `hintCount 2`, `timeSpentSeconds 60` — appliqués une seule fois (§9.6).

### 2.9 Cinquième blocant : deux passages différents reportaient en parallèle

Le reçu du §2.8 fermait le rejeu du **même** passage. Il ne fermait pas le cas voisin, et c'est le
plus vicieux de la série : le verrou était posé sur la **ligne du passage**. Deux passages clos
**distincts** du même couple (simulation, apprenant), reçus vides tous les deux, verrouillent deux
lignes **différentes**. Rien ne les sérialisait. Ils reportaient tous les deux, dans la **même**
tentative, chacun avec l'état lu avant d'entrer.

*Reproduit sur PostgreSQL* avec l'implémentation d'alors : passage de rang 1 retardé, passage de
rang 2 immédiat → état final `attemptCount = 1` **après être passé à 2**, `bestScore` retombé à 10
après 20. Même exposition sur le journal, qui doit rester cohérent avec `bestScore`.

S'y ajoutait un défaut de lecture : `attemptCount`, `bestScore` et `completedAt` étaient lus par la
route **avant** d'entrer en transaction. Même sérialisés, deux reports successifs partaient donc du
même état périmé, et le `Math.max` du second se calculait sur une valeur qui n'existait plus.

Trois corrections, ensemble :

* le verrou porte désormais sur le **couple** (simulation, apprenant) — `pg_advisory_xact_lock`,
  pris **en premier** pour que l'ordre de prise soit partout le même et qu'aucun interblocage ne
  soit possible ; il sérialise les reports de passages différents, ce qu'un verrou de ligne ne peut
  pas faire ;
* les valeurs sensibles sont **relues dans la transaction**, après le verrou, et c'est le seul état
  sur lequel le rapporteur a le droit de calculer ;
* `maxStepSeen` suit la même règle : son `Math.max` partait aussi d'une lecture d'entrée.

`attemptCount` et `bestScore` ne peuvent plus que monter, et le journal n'est écrit que si la note
qu'il décrit vaut au moins la meilleure note **relue**.

*Contre-épreuve* : l'ancienne implémentation, rejouée sur la même base, redonne bien
`attemptCount = 1` — le contrôle vert prouve donc quelque chose.

### 2.10 Sixième blocant : la remontée non finale n'était pas rejouable

Tout ce qui précède portait sur la **clôture**. Mais l'atelier remonte la progression à **chaque
étape franchie**, et cette remontée-là n'a aucun passage à clore : le reçu du §2.8 ne la couvrait
pas du tout. Or elle porte les trois compteurs qui s'ajoutent — `errorDelta`, `hintDelta`,
`timeDeltaSeconds`. Serveur qui commit, réponse perdue, navigateur qui renvoie les mêmes deltas :
comptés deux fois.

Le navigateur **scelle** désormais chaque enveloppe avec une clé. Les deltas sortis de la file
d'attente sont figés avec elle et y restent tant que le serveur n'a pas confirmé : un réessai
renvoie la **même** enveloppe, même clé, mêmes deltas. Ce qui s'accumule entre-temps va dans la
file, pas dans l'enveloppe, et part sous une clé neuve au tour suivant — rien n'est perdu, rien
n'est compté deux fois. C'était le point délicat : la version précédente remettait les deltas dans
la file en cas d'échec, ce qui les sauvait de la perte mais les exposait au doublon.

Côté serveur, la clé est déposée dans `SimulationFlush` **par l'insertion elle-même**, sous la
contrainte d'unicité `(simulationId, userId, cle)` et dans la même transaction que les incréments :
lire puis écrire laisserait une fenêtre. Elle est **exigée** — une clé suppléée par le serveur
rouvrirait le trou en silence — et portée par le couple, si bien que deux apprenants peuvent
employer la même sans se gêner.

### 2.11 Septième blocant : une clé pouvait désigner deux corps

Le §2.10 scellait la **clé** avec les deltas. Pas avec le reste. Or `persist` part sans être attendu
à chaque étape franchie : deux appels pouvaient se chevaucher, partager la clé, et porter un
`currentStep` — voire un `finish` — **différents**. Cas critique : une remontée intermédiaire lente,
puis la clôture, sous la même clé. Si l'intermédiaire arrivait la première, la clôture était rejetée
comme doublon et la note n'était jamais écrite.

Trois corrections :

* **le corps entier est figé au scellage**, étape et drapeau de fin compris — une clé ne désigne
  jamais deux corps ;
* **les envois sont sérialisés**, un seul en vol, et la file est vidée dans un **ordre strict** :
  au premier envoi non réglé, cette enveloppe et toutes les suivantes restent en attente. Une
  première version continuait la vidange, ce qui n'était pas un ordre du tout — une enveloppe
  rejouée après sa suivante pouvait faire reculer `currentStep` et `lastPosition`, compter une
  session hors de son tour, ou rouvrir une tentative déjà close ;
* l'ordonnancement vit dans **`creerFileEnvois`**, module pur, donc vérifiable hors navigateur.

Côté serveur, `noteEnregistree` a dû être repris deux fois. Il valait `termine`, qui dit seulement
« la clôture est valide » : un report refusé annonçait quand même une note écrite. Puis une
comparaison `score === scoreServeur && completedAt != null` — qui reste un **faux positif** dès
qu'un passage antérieur portait exactement la même note. Il vient désormais du **reçu du passage**,
et de rien d'autre : ou bien le report vient d'avoir lieu, ou bien il est refusé parce que ce
passage porte déjà son reçu. Toute autre issue vaut « non enregistrée ».

### 2.12 Un renoncement qui n'en était pas un

Trouvé pendant le parcours navigateur, et sans rapport avec la concurrence. Le bouton
« Passer la question » appelait `demarrerDemonstration` **dans les deux modes**. En évaluation, le
plan de démonstration vaut `null` — `if (mode === "EVALUATION") return null` — donc **rien n'était
révélé** ; mais l'atelier basculait quand même en « mode démonstration » et affichait un encart de
renoncement **sans avoir rien dit au serveur**. Le renoncement n'était inscrit que par un second
bouton. Fermer l'onglet entre les deux laissait une interface qui annonçait une question passée, et
un passage qui ne l'avait jamais enregistrée.

Un seul clic désormais : l'écriture serveur est attendue avant d'avancer, le verrou d'envoi ferme le
double tap, et le bloc de démonstration ne s'affiche plus du tout en évaluation — il y était devenu
un cul-de-sac.

### 2.13 Une phrase qui envoyait refaire l'évaluation pour rien

Même veine. Quand l'enregistrement n'aboutissait pas, l'écran de fin disait « Repassez l'évaluation
pour qu'elle compte ». Or le bouton juste en dessous ne repasse rien : il **réessaie
l'enregistrement du même passage**, dont la note est déjà calculée et conservée côté serveur.
Envoyer l'apprenant refaire quinze questions à cause d'une panne de réseau était une punition pour
un incident qui n'est pas le sien. La phrase désigne maintenant le réessai, et dit explicitement
qu'il n'y a pas besoin de refaire l'évaluation.

### 2.14 Effet de bord assumé sur `attendu.ts`

Sept retouches, six purement défensives (un `phrasePoste(undefined)` levait une exception). **Une
seule change ce que voit l'apprenant** : la colonne d'un tri n'est plus annoncée dans « Attendu : »
pendant une évaluation — c'est la réponse à « appliquez le premier des deux tris », et l'afficher
revenait à la souffler. Prouvé sans effet ailleurs : 3 122 phrases de leçon et d'exercice
inchangées, aucun repli atteint hors évaluation (contrôle I1).

---

## 3. L'expérience, écran par écran

### 3.1 Écran de fin d'évaluation

`components/simulation/BilanFin.tsx`, dans le cadre existant : même fond `#0B1512`, même cockpit,
même carte blanche. Contenu, dans cet ordre :

1. **Note de CE passage**, avec le mot *passage* explicite ;
2. **sort de la meilleure note**, dans un encart distinct (les trois formulations d'origine) ;
3. **ce qui est acquis**, en pastilles, non cliquable ;
4. **à revoir, dans cet ordre** : au plus trois blocs — intitulé de la compétence, rappel, jauge en
   points, questions concernées, boutons vers les leçons exactes ;
5. **une notion presque tenue**, repliée, pour les compétences `fragile` ;
6. **la phrase anti-corrigé**, visible et assumée ;
7. **actions** : *Revoir « … »*, *Repasser l'évaluation*, *Continuer sans réviser*.

### 3.2 Le cas 100 %

Rond vert, note pleine, toutes les compétences en pastilles, **aucun bloc de révision**. Féliciter
puis suggérer une révision serait absurde.

### 3.3 Le cas fermé

Un seul écran sert les quatre fermetures. Note affichée, phrase honnête (« le bilan par compétence
n'est pas disponible pour ce passage »), pas un mot de conseil.

### 3.4 « Mes résultats » enrichie

`components/learner/BilanResultats.tsx`, deux ajouts :

- **« À revoir en priorité sur cette formation »** : trois lignes au maximum, chacune rattachée à
  son module d'origine ;
- **« Bilan par compétence »**, repliable sous chaque évaluation.

**Écart avec la maquette, et il est délibéré.** L'aperçu annonçait « Bilan de votre meilleur
passage, le 3 mars ». Cette date n'existe pas en base : `SimulationAttempt.completedAt` est la date
de **première** complétion et n'est jamais réécrite — c'est ce qui en fait une preuve de parcours —
et `updatedAt` bouge à chaque envoi de progression, donc aussi après un passage moins bon qui n'a
pas remplacé le journal. Aucune des deux ne date le passage décrit. L'écran dit donc « votre
meilleur passage » **sans date**. La rétablir demanderait une migration Prisma, hors périmètre.

### 3.5 Passage courant contre meilleur passage

| Écran | Décrit | Source |
|---|---|---|
| Fin d'évaluation | **le passage qui vient d'être joué** | journal assaini du PUT courant |
| Mes résultats | **le meilleur passage** | `stepLog` en base — `doitRemplacerJournal` ne l'écrit que si `score >= bestScore` |

Un passage moins bon affiche son propre bilan sur l'écran de fin **sans** remplacer celui de « Mes
résultats ». Les libellés disent lequel est lequel, dans les deux cas.

### 3.6 Cas limites

| Cas | Comportement |
|---|---|
| Question passée | comptée comme non réussie, libellée « question 15 passée, comptée comme non réussie », jamais « ratée » |
| Score faible | trois priorités, l'action principale pointe la leçon la plus en amont |
| Journal absent (tentative ancienne) | aucune reconstitution, aucun bilan |
| Chapitre cible dépublié | le renvoi disparaît ; si la compétence n'a plus aucun renvoi, elle sort des priorités |
| Repasser l'évaluation | l'atelier est **remonté** par le parent, pas réinitialisé en place — c'est le seul chemin éprouvé pour remettre à zéro un classeur, ses graphiques, ses tableaux croisés et ses macros |

### 3.7 Mobile et desktop

La zone de fin porte son **propre** `overflow-y` : l'atelier est un portail `position: fixed` en
`overflow: hidden`, et une carte à trois priorités mesure 1 736 px de haut pour 798 px disponibles
sur 390 × 844. Cibles tactiles ≥ 44 px partout, boutons empilés sous 560 px.

---

## 4. Les données : un bloc déclaré, jamais déduit

Le bloc `remediation` vit dans `Simulation.scenario`, qui est déjà du JSON : **aucune migration**.

```jsonc
"remediation": {
  "competences": [
    { "id": "simuler-emprunt",
      "titre": "Simuler un emprunt",
      "enonce": "Passer d'un taux annuel et d'une durée à une mensualité, puis au coût du crédit.",
      "revoir": ["m10-l05"] }
  ],
  "parEtape": { "M10-EV01-11": "simuler-emprunt", "M10-EV01-13": "simuler-emprunt" }
}
```

**Pourquoi rien n'est déduit** — les trois heuristiques envisagées ont été écartées sur preuve :

| Variante | Pourquoi elle échoue |
|---|---|
| Depuis `action.type` | 131 étapes sur 321 sont `TYPE`. Le type dit le geste, jamais la notion. |
| Depuis le texte de `consigne` | Les consignes d'évaluation sont écrites pour **ne pas** nommer la solution. `M10-EV01-02` vise `RECHERCHEV` + `SIERREUR` sans citer ni l'un ni l'autre. |
| Depuis `action.accept` | Un nom de fonction ne désigne pas une leçon : `SI` est enseigné en `m07-l01` **et** en `m10-l03`, `SOMME.SI`/`NB.SI` en `m07-l02` **et** en `m10-l04`. |

**Résolution des renvois.** Un renvoi s'écrit `m10-l05`, c'est-à-dire exactement le nom du fichier
de scénario, traduit en chapitre réel par la règle **structurelle** qu'applique le seul écrivain de
ces chapitres, `seed-module.ts` :

```
mNN-lNN → leçon : Section.order = NN · Chapter.order = 100 + n
mNN-eNN → exercice : 200 + n        mNN-evNN → évaluation : 300 + n
```

Aucune correspondance par titre, aucune correspondance approximative : la clé est un couple
d'entiers, elle tombe juste ou pas. Si elle ne tombe pas, ou si le chapitre est dépublié, le renvoi
est **supprimé**, jamais remplacé.

---

## 5. Les 27 mappings

163 compétences, 295 étapes notées, 513 points, 229 renvois. Chaque étape notée est reliée à une
compétence et à un ou plusieurs chapitres réels ; aucune déduction automatique n'a été employée.

| Éval | Comp. | Étapes | Pts | | Éval | Comp. | Étapes | Pts |
|---|---|---|---|---|---|---|---|---|
| m01 | 6 | 10 | 13 | | m15 | 4 | 7 | 14 |
| m02 | 6 | 11 | 14 | | m16 | 6 | 12 | 26 |
| m03 | 6 | 9 | 13 | | m17 | 6 | 9 | 13 |
| m04 | 5 | 12 | 22 | | m18 | 7 | 10 | 16 |
| m05 | 6 | 11 | 14 | | m19 | 7 | 13 | 22 |
| m06 | 5 | 10 | 14 | | m20 | 7 | 11 | 13 |
| m07 | 7 | 10 | 18 | | m21 | 6 | 11 | 26 |
| m08 | 7 | 13 | 15 | | m22 | 6 | 11 | 23 |
| m09 | 6 | 13 | 18 | | m23 | 6 | 11 | 22 |
| m10 | 7 | 14 | 25 | | m24 | 7 | 12 | 28 |
| m11 | 7 | 11 | 20 | | m25 | 7 | 11 | 21 |
| m12 | 5 | 9 | 14 | | m26 | 6 | 13 | 25 |
| m13 | 6 | 11 | 23 | | m27 | 5 | 10 | 21 |
| m14 | 4 | 10 | 20 | | | | | |

**Méthode de rédaction.** Pour chaque évaluation : lecture des consignes et des formules acceptées
étape par étape, lecture des leçons du module et des modules antérieurs, puis choix du renvoi.
Trois principes ont guidé les cas ambigus :

1. **On renvoie vers ce que l'apprenant a déjà vu.** Le contrôle A11 refuse tout renvoi vers un
   module postérieur. Une évaluation qui teste une notion enseignée plus tôt renvoie en arrière —
   `m02-ev01` totalise avec `=B8+B9+B10+B11`, donc renvoie vers `m01-l07`, pas vers `m06-l02`.
2. **Un renvoi peut viser un exercice** quand aucune leçon du module ou des précédents ne porte le
   geste. Deux cas dans le corpus : `m03-ev01` demande de changer de feuille, ce que seul
   `m03-e03` pratique avant le module 15 ; `m17-ev01` demande de masquer une série sans la
   supprimer, ce que seul `m17-e03` montre. Un renvoi vers une **évaluation** est refusé (A10).
3. **Une compétence par notion, pas par geste.** Les blocs sont regroupés quand deux étapes
   testent la même chose (poser une formule puis la recopier), séparés quand elles testent deux
   notions d'une même leçon (saisir une heure / calculer une durée).

**Relecture humaine.** Les 27 blocs ont été relus contre l'évaluation ET les leçons ciblées. C'est
le seul point que le code ne peut pas garantir : les contrôles prouvent la cohérence — étape
existante, couverture complète, renvoi existant, module antérieur — jamais la **pertinence**
pédagogique. Les intitulés sont ceux que l'apprenant lira ; ils restent à valider par Samuel.

---

## 6. Fail-closed : les quatre fermetures

| Situation | Détection | Effet |
|---|---|---|
| Bloc `remediation` mal formé, même partiellement | `litBlocRemediation` renvoie `null` au premier défaut (11 variantes testées) | aucun bilan ; note conservée |
| Aucun passage serveur exploitable à la complétion | pas de passage ouvert, ou version de scénario périmée | **rien n'est écrit** : ni note, ni meilleure note, ni journal, ni complétion. L'atelier le dit à l'apprenant. |
| Étape sans verdict serveur | registre muet sur cette étape | elle vaut zéro. Rien n'est supposé en faveur de l'apprenant. |
| Journal invérifiable | **une seule** étape absente du scénario actuel, **ou une seule étape notée du scénario absente du journal**, ou liste de référence vide | aucun bilan ; note conservée |
| Couverture partielle | au moins une étape notée sans compétence | diagnostic conservé, **`priorites = []`** |
| Renvoi non résolu | chapitre absent ou dépublié | le lien disparaît ; une priorité sans aucun renvoi sort des priorités |

Le deuxième sens de la deuxième fermeture est le plus important, et c'est celui qui manquait à la
version de conception : un journal **tronqué** — bogue client, envoi interrompu, requête forgée —
voyait toutes ses étapes reconnues, était donc déclaré « couverture complète », et publiait un
classement des priorités établi sur une partie seulement des points perdus. Le conseil était faux
sans que rien ne le signale, et le dénominateur de la note l'était aussi.

Il n'y a **pas de seuil de tolérance**. Un bilan « à 80 % juste » envoie 20 % des apprenants vers
la mauvaise leçon.

---

## 7. Règles pédagogiques

| Statut | Seuil | Pourquoi |
|---|---|---|
| `acquis` | 100 % des points | Le barème ne compte **que** les réussites au premier essai. Tolérer 90 % ici reviendrait à tolérer deux fois. |
| `fragile` | ≥ 50 % et < 100 % | Démontrée sur la majorité des points : envoyer réviser serait disproportionné, taire l'écart serait faux. |
| `a-revoir` | < 50 % | La moitié des points n'est pas tenue. |

**Ordre des priorités** : `a-revoir` avant `fragile` (une notion manquée passe devant une notion
presque tenue, même si elle coûte moins) ; à statut égal, le plus grand nombre de points perdus ; à
égalité, la notion la plus en amont du parcours.

**Plafond à trois** : un apprenant à 20 % perd des points sur sept compétences. Sept conseils,
c'est zéro conseil. Les autres restent consultables dans le bilan complet de « Mes résultats ».

Le seuil de 50 % est le seul arbitraire du dispositif. Il ne change **jamais** la note, ni la liste
des compétences affichées — seulement l'ordre et le repliement.

---

## 8. Anti-divulgation

| Risque | Traitement |
|---|---|
| Le bilan révèle la réponse | Il ne contient que des intitulés de capacité et des rangs de question. `check-remediation` (A14) refuse un intitulé qui citerait une formule ou une référence de cellule ; `check-bilan-api` (D1) confronte le bilan publié à 471 chaînes d'attendu des 27 scénarios. |
| Le bloc renseigne pendant l'épreuve | `remediation` est retiré du scénario servi et n'apparaît que dans la réponse du PUT, à la complétion. Sinon, lire « m10-l02 » dans l'onglet réseau indiquerait qu'une question porte sur la gestion d'erreur. |
| Le lien est un corrigé déguisé | Il pointe une leçon ou un exercice, jamais une évaluation (A10). |
| Le scénario servi contient les réponses | Corrigé : §2. 570 réponses distinctives confrontées, 0 fuite ; 22 chemins d'injection testés dans une évaluation réelle, avec contre-épreuve. |

---

## 9. Fichiers et contrôles

### 9.1 Ce qui a changé

```
prisma/schema.prisma                          SimulationRun + SimulationStepVerdict
prisma/migrations/20260803190000_…/           migration PRÉPARÉE, non appliquée (§10)
prisma/migrations/20260803210000_…/           migration PRÉPARÉE : reçu de passage (§2.8)
prisma/migrations/20260803230000_…/           migration PRÉPARÉE : reçu d'enveloppe (§2.10)
lib/simulation/run.ts                         NOUVEAU  passage serveur, verdicts, note
app/api/simulations/[chapterId]/run/route.ts  NOUVEAU  ouverture / reprise / repassage
scripts/simulation/scenarios/m01-ev01.json … m27-ev01.json   27 blocs "remediation"
lib/simulation/expurge.ts                     NOUVEAU  expurgation du scénario noté
lib/simulation/frappe.ts                      NOUVEAU  juge partagé client/serveur
lib/simulation/file-verdicts.ts               NOUVEAU  ordre des verdicts distants + file d'enveloppes
lib/simulation/acces.ts                       NOUVEAU  gardes d'accès partagées
lib/simulation/bilan.ts                       NOUVEAU  bilan publié + fermetures
lib/simulation/remediation.ts                 NOUVEAU  moteur de bilan (pur)
components/simulation/BilanFin.tsx            NOUVEAU  écran de fin d'évaluation
components/learner/BilanResultats.tsx         NOUVEAU  plan + bilan replié
app/api/simulations/[chapterId]/route.ts      GET expurgé · score recalculé · PUT renvoie le bilan
lib/simulation/journal.ts                     evaluerJournal · deciderApresCompletion
app/api/simulations/[chapterId]/verify/route.ts  gardes alignées · stepId exigé · frappe
components/simulation/SimulationPlayer.tsx    juge distant · file · carte de fin
components/simulation/SimulationChapter.tsx   clientValidation · remontage au rejeu
lib/data/quiz.ts                              bilan du meilleur passage · plan de révision
app/learner/resultats/page.tsx                plan + bilan replié
lib/simulation/attendu.ts                     replis défensifs (§2.14)
scripts/simulation/check-integrite-consignes.ts  ignore le bloc remediation (§9.3)
```

### 9.2 Contrôles exécutés

```
npx tsc --noEmit                                    0 erreur
npm run build                                       Compiled successfully
git diff --check                                    propre

npx tsx scripts/simulation/check-remediation.ts     586/586   27 blocs, moteur, fermetures
npx tsx scripts/simulation/check-bilan-api.ts       204/204   bilan publié, anti-divulgation,
                                                              note issue des seuls verdicts, affirmations de fin
npx tsx scripts/simulation/check-expurgation.ts     290/290   fuite du scénario servi, coordonnées muettes
npx tsx scripts/simulation/check-verdicts.ts         36/36    ordre des verdicts, verrou anti-double-envoi
npx tsx scripts/simulation/check-jouabilite.ts       57/57    couverture du relevé, ordre du corpus
npx tsx scripts/simulation/check-registre.ts        135/135   registre serveur, SUR UNE VRAIE BASE
npx prisma migrate deploy                           base neuve, 25 migrations appliquées
npx prisma migrate diff --exit-code                 « No difference detected »
+ 14 contrôles préexistants du simulateur, tous verts
```

`check-registre.ts` refuse de s'exécuter sans une `DATABASE_URL` dont le nom contient « test » :
ses règles sont des contraintes de base, des verrous et des écritures conditionnelles : les
éprouver sur un objet simulé ne prouverait rien. Il a tourné sur une base PostgreSQL locale jetable
**construite par `prisma migrate deploy` à partir des seuls fichiers de migration** — pas par
`db push` — puis supprimée. `prisma migrate diff` confirme qu'elle correspond exactement au schéma ; il couvre l'ouverture et la reprise, l'ordre, le
passage d'un autre apprenant, l'immuabilité du premier essai, **vingt écritures simultanées**, la
question passée, le repassage sans héritage, le rejeu d'un passage clos, le scénario périmé, et les
sept refus de clôture — passage vierge, inachevé, d'un autre apprenant, inventé, périmé, déjà clos,
et curseur forcé sans verdict. Il couvre depuis la dernière revue le **reçu d'écriture** (R18/R18′,
§2.8), la sérialisation des reports de passages **différents** (R20, §2.9), l'idempotence des
remontées non finales (R21, §2.10) et l'inertie du drapeau `siJuste` (R17, §2.7). Un contrôle intermittent y a été redressé :
R15a exigeait qu'au moins une écriture concurrente soit refusée par la clôture, ce qui dépend de
l'ordonnanceur — 82/83 un tour, 83/83 le suivant. Un contrôle intermittent ne prouve rien : il
vérifie désormais l'invariant réel (chaque écriture a une issue franche) et le refus systématique
est éprouvé à part, dans un ordre imposé (R15a′). Cinq exécutions consécutives : 96/96.

Les six nouveaux totalisent **1 308 contrôles**. Chaque garde-fou porte sa **contre-épreuve** :
on vérifie aussi que le défaut apparaîtrait sans lui — sinon un contrôle vert ne prouve rien.

### 9.3 Un contrôle préexistant a été ajusté

`check-integrite-consignes.ts` prouvait qu'aucune **mécanique** n'avait bougé depuis un commit de
référence. L'ajout du bloc `remediation` le faisait échouer sur les 27 évaluations. Le bloc est
maintenant retiré de la comparaison : ce n'est pas un assouplissement — `remediation` est une
annotation pédagogique, pas une mécanique, et elle a son propre garde-fou, plus sévère.

### 9.4 Vérification navigateur — bancs de composants

Banc temporaire monté sur les **vrais** composants (`BilanFin`, `PlanDeRevision`, `BilanReplie`) et
un bilan produit par le **vrai** moteur depuis le scénario réel du module 10, servi par le build de
production. Retiré après la vérification ; absent du bundle final.

| Largeur | États | Résultat |
|---|---|---|
| 390 × 844 | difficultés, 100 %, repli, résultats | 0 défilement horizontal · zone de fin défilante (1 736 / 798 px) · 0 cible < 44 px · 0 débordement · console vide |
| 1 440 × 900 | idem | idem |
| 320 × 700 | difficultés, résultats | idem |

Tabulation vérifiée : les dix contrôles réels sont atteignables dans l'ordre, tous à 44 px, tous
avec un indicateur de focus visible. Aucune formule ni référence de cellule dans le texte affiché.

L'instrumentation d'audit du player (`__SIM_FAUTES`, `__SIM_TATONNEMENTS`, `__SIM_APLOMB`,
`__SIM_DEMO_VUS`) est absente du bundle de production — vérifié sur les chunks construits.

### 9.5 Parcours complet joué dans l'application

C'était le risque de premier rang du §11 : tout était éprouvé pièce par pièce, mais aucune
évaluation n'avait été jouée de bout en bout avec une session apprenante. Elle l'a été.

**Montage.** Base PostgreSQL jetable `lms_qa_test`, décor posé par
`scripts/simulation/qa-decor-local.ts` (une apprenante inscrite, le module 10 avec ses leçons et son
évaluation, scénarios RÉELS du corpus), serveur `output: 'standalone'` du build de production sur
:3120, profil navigateur neuf, **service worker bloqué** avant toute navigation — un chunk servi par
un worker périmé aurait fait vérifier autre chose que le build courant.

| Ce qui a été observé | Résultat |
|---|---|
| Aucun passage n'existe avant le clic « Commencer » | vérifié en base |
| Ouverture au clic, `maxStepIndex = -1` | vérifié |
| Énoncé (READ) : verdict écrit, curseur avancé | vérifié |
| Parcours 1 440 × 900 mené jusqu'à la fin | 15 verdicts, 14 questions passées, passage clos, note 0 |
| Report sur la tentative | `score 0`, `bestScore 0`, `stepLog` à 15 entrées, `Progress.completedAt` posé |
| Rechargement d'un passage vierge | le même passage est repris |
| Rechargement après un verdict | passage neuf au rang suivant, **0 verdict hérité** |
| Parcours 390 × 844 mené jusqu'à la fin | passage suivant, `attemptCount` synchronisé sur le rang serveur |
| Écran de fin à 390 et 1 440 | 0 débordement horizontal, zone défilante, 0 cible < 44 px, 4 renvois, aucune formule ni référence de cellule |
| Console | aucune erreur applicative |

**Rejoué intégralement sur le dernier correctif.** Base neuve construite par `prisma migrate deploy`,
build de production, profil navigateur neuf, service worker bloqué. Résultats mesurés :

| | |
|---|---|
| Runs avant le clic « Commencer » | **0** |
| Après le clic | 1 run, `maxStepIndex = -1` |
| Parcours 390 × 844 | énoncé franchi puis **14 renoncements, un seul clic chacun** |
| État final du passage | `maxStepIndex 14`, 15 verdicts, **14 passées**, clos, reçu posé, note 0 |
| Tentative | `attemptCount 1`, `score 0`, `bestScore 0`, journal à 15 entrées, terminée |
| Chapitre | `Progress.completedAt` posé, 250 s, 1 session |
| PUT émis par le **vrai** client | 15, **15 clés UUID distinctes**, aucune clé pour deux corps, étapes strictement croissantes 1→14, un seul `finish` |
| Reçus d'enveloppe en base | 15 pour 15 clés |
| Écran de fin, 390 et 1 440 | 0 débordement, zone défilante, 0 cible < 44 px, 6 actions, **aucune formule ni référence de cellule** |
| « Mes résultats » | note, meilleur passage et plan de révision cohérents, aucune formule, aucun débordement |
| Console applicative | **propre** (seul message : le 404 `sw.js` injecté par la QA) |

**Défauts trouvés par ces parcours, et ce qu'ils sont devenus.**

1. *L'écran de fin héritait du défilement horizontal de la grille.* Le cadre de l'atelier ne défile
   pas verticalement mais bien horizontalement — la grille Excel est plus large qu'un téléphone.
   Atteindre une colonne de droite laissait `scrollLeft` à 170, et l'écran de fin qui remplace la
   grille commençait alors à **−158 px** : sa colonne gauche sortait de l'écran. Le contrôle de
   débordement ne le voyait pas, la largeur du document étant juste. Corrigé
   (`SimulationPlayer.tsx`, remise à zéro du défilement à l'arrivée sur l'écran de fin) ; mesuré
   après correction : carte à **x = 12**, largeur 366, bord droit 378 pour un écran de 390.
2. *Le bouton « Passer la question » ne renonçait pas.* Corrigé — voir §2.12. Trouvé uniquement
   parce que le harnais cliquait sur le vrai bouton et constatait qu'aucun verdict n'était écrit.
3. *La phrase d'un enregistrement manqué envoyait refaire l'évaluation.* Corrigée — voir §2.13.
4. *La bannière d'installation PWA masque le bouton de l'atelier sur mobile.* Elle est **antérieure
   à ce chantier** (`fixed bottom-4 right-4 z-40`, contre `z-30` pour le calque de l'atelier) et
   n'en fait pas partie. Elle se ferme proprement — un seul bouton, « Ne plus afficher », et elle ne
   revient pas. Consignée ici comme défaut ergonomique existant, **non corrigée** : la toucher
   serait sortir du périmètre, et elle ne bloque pas l'usage.

### 9.6 Attaques rejouées en HTTP contre le serveur

Les lignes marquées ⧗ ont été rejouées après le correctif §2.9/§2.10 ; les autres l'ont été sur le
build précédent, dont elles ne dépendent pas.

Menées avec une session apprenante authentifiée, en appelant les routes directement — c'est-à-dire
exactement ce qu'un navigateur modifié peut faire.

| Attaque | Résultat |
|---|---|
| Remontée non finale **sans** clé d'enveloppe | **400**, `enveloppe-absente` — jamais suppléée |
| Enveloppe neuve, deltas 3/3 | comptés une fois |
| 4 réessais de la **même** enveloppe | `errorCount` et `hintCount` **inchangés** |
| Clé neuve après coup | les nouveaux deltas s'ajoutent, exactement une fois |
| 8 envois **simultanés** d'une même clé | un seul compte (15 au total, pas 8 × 7) |
| `siJuste: true` posé sur 3 frappes fausses | **3 fautes inscrites**, `premierEssai` retiré — le drapeau est inerte |
| Les mêmes 3 frappes fausses sans le drapeau | registre identique, **réponses HTTP identiques au bit près** |
| Réponse d'un échec | `{ ok: false, message }` — ni classification, ni raison, ni cible |
| Clôture annonçant `score: 100` et un journal complet | refusée, aucune note écrite |
| 4 rejeux successifs de la même clôture | même note, `errorCount` et `hintCount` **inchangés** |
| 6 rejeux **simultanés** | idem, aucun compteur ne bouge |
| État final en base après 11 appels de clôture | `errorCount 3`, `hintCount 2`, `timeSpentSeconds 60` — appliqués **une seule fois** |

---

## 10. Ce qui reste avant le semis et le déploiement

Dans cet ordre, et rien n'a été engagé :

1. **Validation des intitulés par Samuel.** 163 intitulés et énoncés, écrits pour être lus par
   l'apprenant. C'est le seul contenu subjectif du chantier.
2. **Application des trois migrations** — `20260803190000_simulation_run_verdicts` (deux tables),
   `20260803210000_simulation_run_receipt` (une colonne nullable) et
   `20260803230000_simulation_flush_receipt` (une table). Aucun changement sur les données
   existantes. Préparées et éprouvées sur une base jetable ; **non appliquées** ailleurs.
3. **Semis des 27 évaluations** : `seed-module.ts`, dry-run puis `--apply --confirm SEED_SIMULATION`,
   sur les évaluations seules. `Simulation.version` s'incrémente à chaque correction de scénario.
   **Non fait** — aucune écriture en base n'a eu lieu.
4. **Déploiement Railway.** Non fait.

Le parcours complet a été rejoué localement de bout en bout sur le **dernier correctif** (§9.5),
sur une base neuve et le build de production. Aucun nouveau rejeu n'est requis avant le semis ;
seuls restent le GO de Samuel, les migrations, le semis ciblé puis le contrôle en production.

---

## 11. Risques restants

| Risque | Gravité | État |
|---|---|---|
| Annotation pédagogiquement fausse (bonne leçon syntaxiquement, mauvaise notion) | **élevée** | Le seul risque que le code ne peut pas attraper. Traité par relecture humaine des 27 blocs ; reste soumis à la validation de Samuel. |
| Parcours complet non joué dans l'application réelle | ~~élevée~~ | **Fermé** : joué de bout en bout en local, mobile et bureau, sur le build de production (§9.5). Les défauts du parcours ont été corrigés ; la bannière PWA antérieure au chantier est seulement consignée. |
| ~~Parcours navigateur complet non rejoué sur le dernier correctif~~ | — | **Fermé** : rejoué intégralement (§9.5), et c'est ce parcours qui a fait apparaître les défauts §2.12 et §2.13. |
| `errorCount` / `hintCount` restent à 0 en évaluation | faible | Conséquence assumée du §2.7 : la réponse d'un échec ne classe plus le geste, l'atelier ne peut donc plus distinguer faute et tâtonnement pour ses compteurs de diagnostic. Rien n'est perdu — le compte réel des fautes vit dans `SimulationStepVerdict.fautes`, par étape, et c'est lui qui fait la note. |
| Interblocage sur le verrou consultatif | faible | Le verrou du couple est pris avant tout autre, toujours dans le même ordre, et relâché au commit comme au rollback. Il sérialise les reports d'un même apprenant sur une même simulation, pas au-delà. |
| Bannière PWA au-dessus du bouton de l'atelier sur mobile | faible | **Défaut antérieur à ce chantier**, hors périmètre, non corrigé. Se ferme d'un bouton et ne revient pas (§9.5). |
| `SELECT … FOR UPDATE` non portable hors PostgreSQL | faible | Le registre et le reçu d'écriture reposent dessus. Sans importance ici — la production est PostgreSQL — mais à savoir si la base changeait. |
| Latence : un aller-retour par observation, avec écriture | moyenne | Chaque observation jugée écrit au plus deux fois dans le registre. À mesurer sur Railway avant mise en service. |
| Une évaluation sans passage ouvert ne note rien | faible | Fail-closed assumé : l'apprenant en est informé et invité à repasser. |
| Ordre imposé trop strict | faible | Le curseur avance sur réussite ET sur question passée. Un chemin non prévu par l'atelier serait refusé — c'est le but, mais c'est aussi ce qu'un parcours réel doit confirmer. |
| Latence de la correction serveur | moyenne | Un aller-retour par observation. La file impose l'ordre et borne l'attente à 15 s ; une requête tombée ne compte ni réussite ni faute. À mesurer sur Railway. |
| Remise d'aplomb désactivée en évaluation | moyenne | Elle ne répare plus, et n'efface plus. C'est voulu (§2.2) — on n'efface pas une copie notée — mais cela veut dire qu'une cellule parasite écrite par l'apprenant reste en place pendant tout le passage. Les étapes qui lisent une cellule produite plus tôt peuvent donc lire une valeur qu'il a lui-même abîmée. À observer sur un parcours réel. |
| Date du meilleur passage absente | faible | Assumé et documenté (§3.4). Demanderait une migration. |
| Scénario réécrit après un passage | moyenne | Fail-closed dans les deux sens (§6). |
| Bilan perçu comme un corrigé | moyenne | Aucune valeur ni formule affichée ; phrase explicite à l'écran ; deux contrôles automatiques. |

**Retour arrière.** Chaque brique se retire séparément. Le plus sûr : retirer le bloc `remediation`
des scénarios et resemer — le moteur retombe sur `couverture: "absente"` et l'écran de repli, qui
est l'écran actuel. Aucune donnée d'apprenant n'est modifiée par ce chantier : `stepLog`, `score`
et `bestScore` gardent exactement leur forme et leur sens.
