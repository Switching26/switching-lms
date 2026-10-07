# Introductions vidéo Excel

Chantier préparé sur la branche `intros-video-excel`, à partir de `7a786db`.
La phase 1 reste locale ; seuls les médias du nouveau préfixe R2 ont été envoyés.
Le **GO PHASE 2** du chef autorise la mise en production après les contrôles et la sauvegarde complète.

## Données et accès

- 27 introductions de module et 123 introductions de leçon, dans la nouvelle table `IntroVideo`.
- Chaque entrée cible exactement un `Section` ou un `Chapter`, avec une relation nullable et une contrainte SQL d'exclusivité.
- Les deux relations sont en `ON DELETE CASCADE` : supprimer une leçon ou un module enlève sa correspondance vidéo et laisse les objets R2 conservés.
- Aucun chapitre, scénario, enregistrement de voix, master HLS ou calcul de durée officielle n'est modifié.
- Les 150 vidéos totalisent 98,5 minutes, soit environ **+99 min**, facultatives et hors du calcul officiel.
- L'inventaire versionné est `scripts/excel-intros/inventaire.json` : cibles, clés, tailles, SHA-256 et durées mesurées.
- Préfixe privé dédié : `introductions/excel/2026-10-v1/` (150 MP4 H.264/AAC + 150 JPG).

Les MP4 courts réutilisent le client S3 du LMS : une route authentifiée produit un lien R2 signé pour **300 secondes**, sans reconversion HLS ni transit des fichiers vidéo par Railway. Le bucket conserve son régime privé ; un lien signé demeure transmissible jusqu'à son expiration.

Les routes `/api/intro-videos/chapter/[chapterId]` et `/api/intro-videos/[id]/[asset]` revérifient la session. Les apprenants doivent avoir une inscription active et des contenus publiés ; les administrateurs partenaires doivent avoir un organisme actif et la licence correspondante (ou le statut interne). Le super-admin peut prévisualiser. Anonyme : 401 ; hors droits : 403. Les réponses ne sont pas mises en cache et ne transmettent pas le référent.

CNFDI : le clone de production ne possède pas de licence de distribution Excel. Sa lecture est vérifiée avec un **apprenant CNFDI inscrit**, sans inventer de droits d'administration. Un administrateur partenaire licencié est testé séparément.

## Ouverture de l'atelier

Une leçon utilise la vidéo à la place de `AfficheModule`. Le titre, le texte, les étapes, l'estimation et le traitement de « Commencer la leçon » restent ceux du lecteur existant, avec son retour de focus à la grille.

L'introduction de module apparaît avant la première leçon publiée de la section. « Commencer le module » ouvre l'introduction de cette leçon. Les nombres de leçons, exercices et évaluations viennent des chapitres publiés. L'introduction est facultative, ne crée pas de chapitre et ne participe pas à la notation.

Le bouton central accessible est le seul bouton de lecture initial. Les commandes natives apparaissent après le premier clic : Safari/iPad n'affiche ainsi pas un second bouton central superposé. Aucune lecture automatique. Sans média, le rendu existant reste inchangé ; en erreur, la leçon reste accessible. Les styles sont en ligne et la disposition s'empile en portrait.

## Outils et reprise

`inventory.ts` contrôle les 150 cibles uniques, les codecs, les dimensions et calcule les empreintes. `upload.ts` travaille par lots de 40 objets maximum : HEAD avant dépôt, refus d'un objet différent, création conditionnelle, puis relecture GET complète et comparaison SHA-256. Aucun remplacement ni effacement R2.

`seed.ts inventaire.json --apply-after-backup` exige `INTRO_BACKUP_VERIFIED`. Sa transaction contrôle la formation Excel, chaque cible et ses clés. Une entrée identique est laissée en place ; un conflit annule le lot entier. Ne l'utiliser sur la production qu'après le GO, la sauvegarde complète vérifiée et les contrôles avant/après.

Les fixtures QA refusent la production et utilisent uniquement `lms_intros_test_20261007`. La batterie destructrice du registre utilise une base vide différente dont le nom contient `test`. Les secrets, sessions et profils WebKit sont hors du dépôt ; aucun mail n'est envoyé.

## Preuves de phase 1

Les preuves et le journal sont sous `~/lms-intros-mission/`. Ils contiennent les empreintes de toutes les tables avant/après migration, les sauvegardes vérifiées, les 300 contrôles R2, les accès API, les builds, les notes Excel, les captures aux trois tailles et les mesures de lecture Chrome/WebKit.

Le garde-fou de notation est exécuté avant et après : **27/27 à 100 %**, avec comparaison exacte des JSON. Les captures des exercices sont comparées pixel par pixel à un build du lecteur initial.

Pour les mesures vidéo, examiner toutes les plages `played` : Chrome peut séparer de très petites plages lors d'un démarrage ou d'une mise en tampon. Sur un Chrome partagé, mesurer aussi depuis Node : les animations et timers d'une page en arrière-plan peuvent être suspendus. Ne jamais assimiler un délai du harnais à une erreur de lecture sans vérifier `currentTime`, les images décodées, les plages effectivement lues et l'état final.

La recette finale Chrome prouve une lecture complète du module et plus de cinq secondes de la leçon, avec images et audio décodés ; WebKit/iPad lit les deux vidéos intégralement. Dans WebKit, attendre `networkidle` avant la navigation suivante évite les avertissements de préchargement RSC des liens latéraux observés dans le premier harnais. La recette finale des neuf captures ne produit aucune erreur JavaScript. Les annulations de requêtes MP4 lors d'une pause suivie d'une navigation sont conservées dans le rapport.

Les profils `default/` et `.playwright-cli/` ont été retirés du dossier de preuves après fermeture de la session propriétaire. Les profils et cookies de test conservés pour une éventuelle reprise restent dans le répertoire privé, hors des preuves et du dépôt.

Après GO PHASE 2 : sauvegarde complète de production, fetch/rebase avec les changements concurrents, contrôles, push normal, Railway SUCCESS et migration additive, transaction des 150 correspondances, puis recette en ligne avec un compte apprenant de test sans mail. Nettoyer uniquement ce compte de test et ses données ; conserver les objets R2.
