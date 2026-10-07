# Introductions Word, PowerPoint et Outlook

Phase 1 : copie locale uniquement. Aucun envoi ni enregistrement production autorisé.

| Application | Modules | Leçons | Vidéos | Objets | Préfixe privé |
|---|---:|---:|---:|---:|---|
| word | 19 | 41 | 60 | 120 | introductions/word/2026-10-v1/ |
| powerpoint | 16 | 64 | 80 | 160 | introductions/powerpoint/2026-10-v1/ |
| outlook | 16 | 51 | 67 | 134 | introductions/outlook/2026-10-v1/ |

Les identifiants IntroVideo sont `word-m01-intro`, `powerpoint-m01-l01`, etc. Les clés R2 utilisent les identifiants source sans application, sous leur préfixe dédié. Les identifiants Excel historiques restent identiques.

## Résolution et inventaire

`python3 scripts/bureautique-intros/resolve.py --output /chemin/cibles.json` ouvre une transaction production READ ONLY, avec secret lu dans `.db-url` et jamais journalisé. Le dossier de sortie doit exister. Il contrôle titre/ordre/module, titre/application/mode/publication de chaque leçon et couverture intégrale des leçons publiées.

Une fois les trois chaînes terminées et les rendus VALIDÉS par le chef :

```
node_modules/.bin/tsx scripts/bureautique-intros/inventory.ts word /chemin/word/rendus /chemin/cibles.json /chemin/inventaire-word.json --renders-finalized
```

Rejouer pour les deux autres applications. Comptes exacts, JPEG, H264 1920×1080 + AAC, durée, taille, SHA256 et stabilité de chaque fichier sont vérifiés. Seuls `banc-l.mp4`, `banc-l.jpg`, `banc-m.mp4`, `banc-m.jpg`, ainsi que les deux images de contrôle PowerPoint `m08-l03-projection-corrigee.jpg` et `m09-l01-controle-bulle.jpg`, sont exclus explicitement. Un autre média inattendu bloque. Aucun inventaire final pendant la fabrication.

## Phase 2 : uniquement après GO explicite

```
INTRO_PHASE2_GO=BUREAUTIQUE_207 node_modules/.bin/tsx scripts/bureautique-intros/upload.ts /chemin/word/rendus /chemin/inventaire-word.json /chemin/recu-word-000.json 0 40 --apply-after-go
```

Objets aplatis dans l'ordre du manifeste : vidéo puis vignette. Rejouer à partir de 40, 80, etc. Maximum 40 objets/commande et délai 270 s. Les reçus sont écrits après chaque vérification complète. Si une commande s'interrompt, reprendre au premier index non reçu, dans un NOUVEAU fichier de reçus (garder le précédent). HEAD taille/SHA avant reprise, création conditionnelle sans écrasement, GET intégral SHA/taille ensuite.

```
node_modules/.bin/tsx scripts/bureautique-intros/merge-receipts.ts /chemin/inventaire-word.json /chemin/recus-word.json /chemin/recu-word-000.json /chemin/recu-word-040.json /chemin/recu-word-080.json
node_modules/.bin/tsx scripts/bureautique-intros/seed.ts /chemin/inventaire-word.json /chemin/recus-word.json --dry-run
```

Avant écriture : `python3 scripts/bureautique-intros/backup.py` crée un dump intégral et vérifie sa compression. Définir `INTRO_BACKUP_VERIFIED` avec le chemin de la preuve JSON affiché, puis `INTRO_PHASE2_GO=BUREAUTIQUE_207` avec `--apply-after-backup`. Le seed contrôle à nouveau taille/SHA du dump et exige une preuve production de moins d'une heure. Chaque application est atomique, les entrées identiques sont ignorées, un conflit interdit tout écrasement. Le dry-run reste transaction READ ONLY. Le mode `--apply-local` refuse tout autre hôte/base que le clone jetable désigné. Les fixtures sans `finalizedAt` sont interdites en envoi et en enregistrement production.

## Recette locale

```
python3 scripts/bureautique-intros/resolve_test.py
node_modules/.bin/tsx --test scripts/bureautique-intros/common.test.ts
node_modules/.bin/tsc --noEmit -p scripts/bureautique-intros/tsconfig.json
```

Sur le clone restauré `lms_bureautique_intros_test_20261007`, avec AUTH_SECRET de recette et preuve de sauvegarde : `qa-fixture.ts cibles.json dossier-prive` neutralise SystemConfig et prépare comptes/cookies et manifestes FAUX réservés au test. Ces fichiers `fixture-*.json` ne doivent jamais alimenter une phase 2. `qa-seed.ts dossier-prive preuve.json` vérifie 207 enregistrements, répétition, refus d'une cible modifiée et conservation des 150 introductions Excel. `qa-routes.ts dossier-prive preuve.json` exerce les routes réelles sans serveur, avec session injectée seulement dans le bundle de test. `qa-upload.ts dossier-prive preuve.json` teste le véritable uploader avec SDK et trousseau entièrement factices, donc sans appel réseau/R2.

Après build et démarrage local seulement quand `pgrep -f outils/production.mjs` est vide :

```
node_modules/.bin/tsx scripts/bureautique-intros/qa-api.ts http://localhost:3118 dossier-prive/cookies.json preuve-api.json dossier-prive/fixture-word.json dossier-prive/fixture-powerpoint.json dossier-prive/fixture-outlook.json
```

414 liens, 156 leçons, 51 premières leçons avec module ; matrice des droits, expiration 300 s, exercices/évaluations intacts, clé d'une autre application refusée, 150 liens Excel. Configuration S3 factice locale : cette recette n'affirme PAS la lecture réelle des objets R2 nouveaux. Après mise en ligne, `qa-api.ts` peut faire uniquement des GET HTTPS sur le domaine LMS, avec GO et trois inventaires réels. Les contre-tests qui modifient une clé ne s'exécutent que sur le clone exact.

Le plan opérationnel et les preuves sont dans `~/lms-intros-mission/bureautique/`.

Après les fixtures : `qa-finalize-local.ts dossier-prive inventaire-word.json inventaire-powerpoint.json inventaire-outlook.json` retire uniquement les 207 fixtures strictement identifiées sur le clone et configure le relais S3 local ; appliquer ensuite les trois manifestes réels via seed --apply-local. Ne pas relancer ce remplacement après application réelle.

`qa-media-bridge.py dossier-prive cibles.json` sert les sources en lecture seule sur 127.0.0.1:3119 (Range compris), uniquement par chemins S3 locaux avec paramètres de signature. Ce relais est un banc factice, pas une implémentation de la validation cryptographique R2. Durée maximale 280 s ; aucun appel R2. `qa-browser.js` s’exécute sur le standalone local 3118 : trois tailles, module puis leçon, seconde leçon sans module, six lectures par moteur avec plages played réelles. Les contrôles HTTP restent sur les routes applicatives réelles. Vérifier le moteur effectif du CLI ; WebKit peut nécessiter le contexte dédié du lanceur de recette.
