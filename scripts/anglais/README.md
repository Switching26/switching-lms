# Hébergement anglais dans le LMS

Aucune commande de ce dossier ne cible une base implicitement. Toujours fournir `DATABASE_URL` explicitement au semis et à Prisma. Le dossier `.local/` est ignoré par Git.

## Préparer

1. Copier des dépendances indépendantes puis `npx prisma generate`.
2. Appliquer les migrations avec `DATABASE_URL=... npx prisma migrate deploy` (migration ANGLAIS additive).
3. `scripts/anglais/importer-lecteur.sh <dossier-source>` copie `public` hors vignettes, essais et rapports de recette, `services`, `activities`, `data`, sans médias, serveur ou modèles. La provenance est dans `anglais-lecteur/SOURCE.txt`. La copie est tracée dans le standalone Next et servie par une route authentifiée, jamais par `public/`.
4. `DATABASE_URL=... npx tsx scripts/anglais/seed-formation.ts` : contrôle sans écriture. Source par défaut `~/checkos/work/lms-anglais-contenu`. `ANGLAIS_CONTENU`, `ANGLAIS_PROTOTYPE`, `ANGLAIS_ASSETS_U01`, `ANGLAIS_VIGNETTES` permettent de préciser les sources locales en lecture seule.
5. `--apply --confirm SEED_ANGLAIS` écrit puis relit 10 sections/74 chapitres **en brouillon**, sous le titre validé `Anglais niveau 1 — Débutant (A1/A2)`. Deux relances ne créent pas de doublons et une version de simulation n'augmente que si son contenu change. Le semis refuse une formation déjà publiée. BILAN porte le document original `EVAL/bilan-final.json`, avec son plan d'hébergement (pas de lecon.json dans la source).

## Médias

`npx tsx scripts/anglais/importer-medias.ts` inventorie et calcule les empreintes sans envoi. `.local/medias-inventaire.json` garde la liste mesurée.

`ANGLAIS_IMPORT_SECRET=... npx tsx scripts/anglais/importer-medias.ts --url https://hote --apply --from 0 --limit 1000`

Répéter avec `--from 1000`, 2000, etc. La dernière passe revérifie **tous** les fichiers (nombre, tailles, SHA-256). La même commande reprend après coupure à l'offset confirmé par le serveur. Morceaux de 4 Mio ; aucun extracteur d'archive externe. Le manifeste et les morceaux constituent l'enveloppe d'import. `--replace` est nécessaire pour un fichier différent déjà présent ; une empreinte identique n'est pas écrasée. Les liens symboliques, chemins absolus et traversées sont refusés.

La route `/api/anglais/import` exige un Bearer secret configuré par `ANGLAIS_IMPORT_SECRET`, indépendamment des sessions apprenants. Elle écrit uniquement sous `UPLOAD_DIR/anglais/`. Les morceaux inachevés restent dans `.imports/`, inaccessible via le lecteur. Les verrous PostgreSQL disparaissent avec la connexion ; aucun fichier verrou orphelin après un arrêt.

## Lecteur et sécurité

- `/anglais/` → `/anglais/index.html`, paramètres préservés (évite la normalisation du slash final par Next).
- Tout fichier exige une session active ET une inscription active à une formation anglaise publiée ; le super-admin peut prévisualiser un brouillon. Les chapitres non publiés restent refusés aux apprenants.
- `/anglais/api/{sante,niveau,activites,lecon/ID,medias/ID}` et `contenu/ID/script/fichier.json` reproduisent les formats du prototype depuis Simulation.scenario.
- `api/sante` indique `preview: true` uniquement pour une session super-admin ; le lecteur combine cette confirmation avec le mode aperçu pour proposer la relecture auteur.
- `api/chapitre/<chapterId>` traduit la clé du LMS vers U01, etc.
- `api/etat/ID` GET/PUT : `{version:1,valeurs,commun}`, 1 Mio max, SimulationAttempt.stepLog.etat. Fusion par horodatage des entrées ; sérialisation par verrou transactionnel. Un aperçu ne modifie pas la progression.
- `api/progression/ID` POST/GET : compteurs absolus `{vues,faites,total,termine}` ; total comparé au plan, jamais de temps ou score officiel reçu ici. Progress.completedAt est écrit à la fin. Le suivi de présence existant compte les secondes.
- Pour T1–T6 et EVAL, la fin exige aussi une remise présente dans l’état enregistré ; le serveur refuse une complétion anticipée même lorsque toutes les étapes ont été parcourues.
- Prononciation/transcription : `ANGLAIS_PRONONCIATION_URL` optionnelle, même chemin `api/...`, corps et paramètres relayés, aucun cookie transmis. Sans service : réponse jouable `code: indisponible`, sans score.
- Le protocole postMessage valide origine ET fenêtre source. L'iframe persiste en immersion ; notes/documents appartiennent au LMS. Le cadre du tenant conserve sa charte ; la palette marine est limitée au lecteur anglais.
- Les MP3/MP4 prennent en charge GET/HEAD, Range simple et suffixe, 206/416 ; aucun cache public.

## Recette strictement locale

PostgreSQL 16 sur 127.0.0.1:55432, base `anglais` pour l'apprenant ; base séparée `anglais_registre_test` pour le test destructeur du registre.

`DATABASE_URL=postgresql://anglais@127.0.0.1:55432/anglais npx tsx scripts/anglais/preparer-recette-locale.ts` crée les comptes fictifs et publie **dans cette seule base** 72 chapitres (les blancs restent fermés). Ce script refuse toute autre URL. Identifiants dans `.local/comptes.json`, jamais commis.

`node scripts/anglais/check-api.mjs` et `node scripts/anglais/check-import-reprise.mjs` exercent les vraies routes sur :3096. Le second utilise uniquement le secret jetable de `.env.local` et nettoie ses fichiers témoins.

La procédure de mise en production et les preuves de recette sont dans `~/checkos/scratchpads/lms-anglais-l1/INTEG/RAPPORT-LMS.md`. Aucune production n'est autorisée par ce README.
