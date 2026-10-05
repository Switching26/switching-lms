# Mission CODE — vidéos privées du LMS dans R2

Livraison du 05/10/2026, branche **video-r2**, worktree `/Users/switchingformation/checkos/work/lms-video-r2`, base `origin/main` **4a46900**. Le développement et les vérifications locales sont terminés. L'intégration, l'activation du compte R2 et le déploiement restent au chef. Aucun push sur main, déploiement Railway ou accès en écriture à la base LMS production n'a été effectué.

## Résultat

Le LMS dispose désormais d'un lecteur HLS privé, d'un dépôt vidéo admin, d'une file de conversion durable et d'un script de migration. La nouvelle lecture s'active uniquement quand le chapitre possède `videoR2Key`. L'identifiant Vimeo et sa durée d'origine restent conservés pour un retour arrière par chapitre. Aucun identifiant de chapitre, inscription ou progression n'est remplacé.

Les playlists contrôlent l'authentification, le compte actif, l'inscription et ses dates, ainsi que la publication. Les variantes repassent par le LMS ; les segments, clés éventuelles et fichiers d'initialisation utilisent des GET S3 signés trois heures. Les références externes et sorties du paquet sont refusées. Safari/iOS utilise HLS natif, Chromium utilise hls.js ; les requêtes média transmettent leur origine CORS.

La reprise, les sauvegardes toutes les 30 secondes et à la sortie, la validation serveur de fin, le seuil UI 50 %, le plancher serveur 25 % et l'aperçu sans progression sont conservés. Le lecteur Vimeo persistant continue de sélectionner la même iframe pour un chapitre non migré.

## Dépôt et conversion retenus

L'admin choisit ou glisse une vidéo dans l'éditeur. Le navigateur envoie directement des parties de 32 Mio dans le bucket privé, avec contrôle serveur des tailles et ETags. Le dépôt terminé entre dans la table `VideoJob` ; la vidéo précédente continue à fonctionner. Le worker du même dépôt, exécuté sur le Mac, produit les qualités 1080/720/480 en H.264/AAC et segments de six secondes, contrôle le paquet puis le marque READY. L'admin choisit la vidéo prête et enregistre le chapitre.

Cette solution évite la conversion longue sur le petit service LMS Railway. Le worker n'a pas besoin d'accès à PostgreSQL : il réclame les missions par HTTPS avec un token dédié, un bail renouvelé, trois tentatives maximum et des paquets distincts par tentative. Si le Mac est arrêté, les dépôts attendent ; les vidéos déjà prêtes restent lisibles.

Un exemple launchd est livré, sans installation automatique. Prévoir Node 20+, `npm ci --include=dev`, ffmpeg/ffprobe et au moins 15 Gio libres. Limite du dépôt : 5 Gio ; limite d'une source : 12 heures. Le disque et le temps d'encodage sont à surveiller sur les vrais cours. Aucun abonnement de conversion supplémentaire ; l'électricité et la disponibilité du Mac restent à prévoir.

Les coûts de conversion Railway sont évalués dans le runbook, à partir des [tarifs officiels vérifiés aujourd'hui](https://docs.railway.com/pricing). Le Mac évite aussi l'envoi des paquets encodés depuis Railway.

## Vérifications réalisées

| Vérification | Résultat |
| --- | --- |
| `npm run build` | Vert, build de production standalone |
| Typecheck applicatif local | Vert |
| `npm run check:video` | Typecheck worker/migration/QA + 2 tests HLS verts |
| `npm run check:sim` | 26 contrôles verts, 0 rouge, 0 non lancé ; registre sur PostgreSQL jetable séparé |
| Dépôt depuis le vrai éditeur | Multipart direct → file QUEUED → FFmpeg → trois qualités READY |
| Activation depuis l'éditeur | Enregistrement puis aperçu retrouvé après réouverture |
| Lecture apprenant réelle dans Chrome | Reprise à 8 s, lecture jusqu'à 12 s, puis sauvegarde et reprise à 12 s |
| Fin de lecture réelle | `ended=true` à 42,071563 s ; `completedAt` enregistré et `lastPosition=0` en base |
| Accès privé | Anonyme 401 ; non-inscrit 403 ; aperçu non-admin refusé |
| Dates et compte | Inscription future/expirée et compte désactivé refusés |
| URLs segments | GET valide lu ; sans signature, signature altérée et lien expiré : 403 |
| Chapitre R2 sans Vimeo | Lecture autorisée et complétion prématurée refusée au plancher de 25 % |
| Retour arrière | Vimeo et durée d'origine restaurés, progression intacte, réactivation R2 vérifiée |
| File durable | Une seule attribution, heartbeat, reprise d'un bail expiré, ancien worker refusé, arrêt après trois tentatives |
| Migration | Dry-run sans mutation ; dépôt seul sans bascule ; activation explicite sur base locale |
| Paquet réel fourni par la mission sauvegarde | Vimeo 1194247802 : 892 fichiers, 305 735 208 octets, trois variantes, dry-run puis dépôt/bascule dans le S3 et le chapitre locaux |

Le paquet réel contient `verification.json` : ce sidecar est conservé sur disque et n'est jamais téléversé ni servi. Les médias et playlists de la mission sauvegarde n'ont pas été modifiés.

Captures contrôlées : **1440×900**, **1024×768**, **768×1024**. La capture portrait utilise la commande existante « Replier les chapitres ». Les dimensions du viewport ont été mesurées ; aucune largeur débordante. Les images et résultats expurgés sont conservés dans `docs/video-r2-qa/`, et un visualiseur HTML autonome est joint à la conversation.

Le serveur S3 local est un mock S3rver avec vérification supplémentaire des signatures SigV4 présignées et de leur expiration ; il ajoute ListParts, absent du mock d'origine. Cela valide le parcours local, pas une connexion au compte R2 réel encore inactif. Les cookies et secrets QA restent dans `.local/`, ignoré par Git.

## Migration Prisma à appliquer par le chef

Migration livrée : `prisma/migrations/20261005120000_private_r2_video/migration.sql`. Elle ajoute deux colonnes nullables et la table de file ; aucun chapitre existant n'est basculé par cette migration. Le chef l'applique dans le processus d'intégration/déploiement, après ses contrôles. SQL exact ci-dessous.

```sql
-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN     "videoR2Key" TEXT,
ADD COLUMN     "videoVimeoDuration" INTEGER;

-- CreateTable
CREATE TABLE "VideoJob" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "multipartId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPLOADING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "hlsKey" TEXT,
    "duration" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoJob_status_createdAt_idx" ON "VideoJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "VideoJob_chapterId_idx" ON "VideoJob"("chapterId");
```

## Réglages R2 et mise en service par le chef

Dans Paramètres plateforme, saisir endpoint `https://ACCOUNT_ID.r2.cloudflarestorage.com`, bucket privé Standard, Access Key ID, Secret Access Key et token worker aléatoire d'au moins 32 caractères. Les cinq valeurs sont chiffrées avec le mécanisme existant du LMS. Le token doit être identique dans `VIDEO_WORKER_TOKEN` sur le Mac, avec `VIDEO_LMS_URL` égal au domaine public du LMS.

Conserver le bucket privé, désactiver les accès publics et autoriser CORS GET/HEAD/PUT uniquement depuis le domaine LMS. Le JSON CORS et l'exemple launchd sont dans `docs/video-r2.md`. Prévoir l'abandon des multipart incomplets et une politique explicite de rétention des sources/anciens paquets ; aucun effacement automatique des vidéos utilisées.

Migration des paquets existants : `npm run video:migrate` en dry-run par défaut. Dépôt avec `--upload --confirm UPLOAD_R2`. Activation d'un chapitre précis avec `--upload --apply --chapter ID --confirm MIGRATE_R2_CHAPTERS`. Sur base distante, `--allow-production` est également obligatoire ; remplacer une vidéo déjà migrée exige `--replace`. Un reçu est écrit avant bascule, et un changement simultané du chapitre bloque son activation. Tous les essais de cette mission ont utilisé des bases et objets locaux.

## Coût mensuel estimé et risques restants

Hypothèse de 100–150 Go HLS et conservation des 47,5 Go de sources : **environ 2,1–2,8 $/mois**, hors taxes, change et autres usages du compte. Taille finale à mesurer. [Tarifs officiels R2 vérifiés le 05/10/2026](https://developers.cloudflare.com/r2/pricing/).

Les limites restantes sont concrètes : R2 et ses clés ne sont pas actifs, le chef doit intégrer la migration et démarrer le worker, et Safari/iPhone/iPad doivent être vérifiés sur des appareils réels. Les captures sont celles de Chrome à ces tailles. Le catalogue des 111 cours n'a pas été migré en production. Une URL de segment déjà signée reste transmissible et utilisable jusqu'à expiration ; ce mécanisme protège un bucket privé, sans DRM. Les alertes npm existantes n'ont pas fait l'objet d'une mise à niveau générale dans ce chantier.

Runbook détaillé : `docs/video-r2.md`. Journal horodaté : `/Users/switchingformation/lms-video-mission/journal-code.md`. Le skill commun `switching-lms-knowledge` a été mis à jour avec la branche préparée, les chemins de reprise et les pièges CORS/sidecar observés ; il indique explicitement que cette version n'est pas déployée.

## Fichiers de la livraison

- `app/api/admin/config/route.ts`
- `app/api/chapitres/[id]/route.ts`
- `app/api/internal/video-worker/route.ts`
- `app/api/progress/[chapterId]/route.ts`
- `app/api/upload/video/r2/[jobId]/route.ts`
- `app/api/upload/video/r2/route.ts`
- `app/api/videos/[chapterId]/playlist/route.ts`
- `app/learner/formation/player.tsx`
- `app/super-admin/formations/[id]/modifier/page.tsx`
- `app/super-admin/formations/editor.tsx`
- `components/admin/PlatformSettings.tsx`
- `components/admin/R2VideoUpload.tsx`
- `components/learner/HlsVideoPlayer.tsx`
- `docs/video-r2-qa/lecteur-1024x768.png`
- `docs/video-r2-qa/lecteur-1440x900.png`
- `docs/video-r2-qa/lecteur-768x1024.png`
- `docs/video-r2-qa/results.json`
- `docs/video-r2-rapport.md`
- `docs/video-r2.md`
- `lib/video/hls.ts`
- `lib/video/r2.ts`
- `package-lock.json`
- `package.json`
- `prisma/migrations/20261005120000_private_r2_video/migration.sql`
- `prisma/schema.prisma`
- `scripts/video/hls.test.ts`
- `scripts/video/migrate-r2.ts`
- `scripts/video/qa-api.ts`
- `scripts/video/qa-browser-activate.js`
- `scripts/video/qa-browser-captures.js`
- `scripts/video/qa-browser-finish.js`
- `scripts/video/qa-browser-play.js`
- `scripts/video/qa-browser-resume.js`
- `scripts/video/qa-browser-upload.js`
- `scripts/video/qa-clip.ts`
- `scripts/video/qa-fixture.ts`
- `scripts/video/qa-migration.ts`
- `scripts/video/qa-queue.ts`
- `scripts/video/qa-r2-only.ts`
- `scripts/video/qa-rollback.ts`
- `scripts/video/qa-s3.cjs`
- `scripts/video/transcode.ts`
- `scripts/video/tsconfig.json`
- `scripts/video/video-worker.launchd.plist.example`
- `scripts/video/worker.ts`
