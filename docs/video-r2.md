# Vidéos privées R2 — branche video-r2

Implémentation préparée le 05/10/2026. Pas de déploiement ni de migration production par cette mission. L'intégrateur applique la migration Prisma, active R2, règle le LMS et démarre le worker avant de basculer un chapitre.

## Lecture et retour arrière

`Chapter.videoUrl` garde l'identifiant Vimeo. `videoR2Key` contient le chemin du master HLS privé ; ce champ seul active le nouveau lecteur. `videoVimeoDuration` garde la durée originale lors de la première bascule. Le bouton de retour Vimeo remet la clé R2 à null et restaure cette durée. Les identifiants des chapitres, inscriptions et progressions restent les mêmes.

Chaque requête de playlist contrôle le compte actif, l'inscription, ses dates et la publication du chapitre/de la formation. L'aperçu explicite est réservé au super-admin. Les playlists imbriquées repassent par le LMS ; les références de segments, clés et fichiers d'initialisation sont remplacées par des GET S3 signés pour 10 800 secondes. Références externes, variables HLS et sorties du répertoire du paquet sont refusées. Les playlists ne sont jamais mises en cache par le LMS. Le lecteur renouvelle les URLs avant expiration (150 minutes), en conservant la position et l'état de pause.

Safari/iOS utilise `<video playsInline controls>` et son HLS natif. Les autres navigateurs utilisent hls.js chargé uniquement pour R2. Le lecteur Vimeo persistant n'est ni démonté ni modifié. Les règles existantes sont conservées : position toutes les 30 secondes et à la sortie, visionnage réel hors sauts, fin validée par le serveur, seuil UI 50 % et plancher serveur 25 %, temps de présence existant, aucun enregistrement en aperçu.

Les liens signés sont des accès temporaires transmissibles, pas un DRM. Un segment déjà autorisé reste accessible jusqu'à expiration même si une inscription est retirée entre-temps ; aucun nouveau master/variant n'est alors autorisé. Le bucket doit impérativement rester privé, sans domaine public ni r2.dev actif.

## Réglages à saisir dans Paramètres plateforme

Les cinq valeurs sont chiffrées via `lib/crypto.ts` dans `SystemConfig`. Endpoint et bucket sont affichés à l'admin après déchiffrement ; les identifiants et le token restent masqués.

| Clé | Valeur |
| --- | --- |
| `r2_endpoint` | `https://ACCOUNT_ID.r2.cloudflarestorage.com` |
| `r2_bucket` | Nom du bucket privé Standard, par exemple `switching-lms-videos` |
| `r2_access_key` | Access Key ID du token R2 limité à ce bucket |
| `r2_secret_key` | Secret Access Key associé |
| `video_worker_token` | Token aléatoire d'au moins 32 caractères, identique côté worker |

Un champ secret vide conserve sa valeur. Ne pas changer le bucket/endpoint pendant des conversions en cours. Après une rotation des identifiants, les anciens liens signés peuvent cesser de fonctionner ; le lecteur sait renouveler sa playlist.

CORS du bucket, en remplaçant le domaine par celui du LMS (sans slash final) :

```json
[
  {
    "AllowedOrigins": ["https://LMS_DOMAIN"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["Content-Type", "Range"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range"],
    "MaxAgeSeconds": 3600
  }
]
```

Prévoir une règle de cycle de vie qui abandonne les multipart incomplets après un jour. Les sources complètes et les paquets remplacés sont conservés volontairement : ne pas les effacer sans politique de rétention et vérification des chapitres actifs.

## Dépôt et conversion

L'admin dépose un fichier (5 Gio maximum) depuis l'éditeur. Le navigateur envoie directement à R2 des parties de 32 Mio signées, avec trois tentatives par partie. Le LMS compare tailles, ordre et ETags côté S3 avant de finaliser. Il inscrit ensuite un travail durable en PostgreSQL. Une ancienne vidéo continue de fonctionner pendant le dépôt et la conversion. Une vidéo READY est activée seulement lorsque l'admin choisit la vidéo puis enregistre le chapitre.

Le worker est un script du même dépôt LMS, sur le Mac existant ; pas de nouvelle application ni d'API OpenAI. Il récupère une mission par HTTPS avec le token dédié, puis les paramètres S3 par cette même réponse privée. Il n'a pas besoin d'accès à PostgreSQL. Une seule conversion tourne par worker. Bail de cinq minutes, heartbeat toutes les 30 secondes, reprise après interruption, maximum trois tentatives. Chaque tentative écrit un paquet immuable distinct. La publication READY intervient après contrôle de tous les fichiers et références distants.

Installer les dépendances du worker avec `npm ci --include=dev` (tsx est une dépendance de développement). Prérequis Mac : Node 20+, ffmpeg/ffprobe avec libx264, AAC et le filtre scale ; 15 Gio libres au minimum. Les trois encodages sont séquentiels, limités à deux threads, sans agrandir les petites sources. Sorties H.264/AAC, 1080/720/480, segments de 6 secondes, débit vidéo plafonné respectivement à 2500/1400/700 kbit/s, audio à 96 kbit/s. Vidéos de plus de 12 heures refusées. Ce plafond disque est un minimum opérationnel, pas une garantie pour toute source longue : surveiller l'espace disponible et les journaux.

```sh
mkdir -p .local/video-worker
VIDEO_LMS_URL=https://LMS_DOMAIN VIDEO_WORKER_TOKEN='TOKEN_CONFIGURE' npm run video:worker
```

Pour traiter une seule mission, ajouter `-- --once`. Sans ce flag, le worker interroge la file toutes les 15 secondes. Exemple launchd fourni dans `scripts/video/video-worker.launchd.plist.example` : remplacer REPO/LMS_DOMAIN/token, créer les dossiers de logs, protéger le plist à 0600, puis l'installer via l'intégrateur. Le Mac doit rester réveillé ; sinon le dépôt attend dans la file et les lectures déjà prêtes continuent. Aucune installation automatique de service n'a été faite par cette mission.

### Pourquoi ne pas convertir sur le service LMS Railway

Trois encodages sollicitent CPU, RAM et disque temporaire ; un fichier peut durer des heures et une requête HTTP/redeploy peut l'interrompre. Le worker Mac retire cette charge du service LMS et conserve une file durable. Aucun abonnement de conversion supplémentaire. L'électricité, le temps machine et la disponibilité du Mac restent à prévoir.

Railway facture aujourd'hui CPU 20 $/vCPU-mois, RAM 10 $/Go-mois, volume 0,15 $/Go-mois, sortie réseau 0,05 $/Go. À titre d'ordre de grandeur, 100 h sur 2 vCPU + 2 Go RAM représentent environ 8,33 $ de calcul, hors plan et disque ; envoyer 100 Go de sorties ajouterait environ 5 $. Le temps réel pour 46 h de source ne peut pas être déduit d'une mire : il faut mesurer un cours représentatif. [Tarifs Railway](https://docs.railway.com/pricing), vérifiés le 05/10/2026.

## Migration depuis les paquets locaux de l'autre agent

Structure attendue : `<dossier>/<vimeoId>/master.m3u8`, playlists de variantes et tous leurs segments relatifs. Le sidecar racine `verification.json` fourni par la mission sauvegarde est ignoré et reste local. Les liens symboliques, autres fichiers inattendus, références externes/traversantes, segments manquants et playlists VOD inachevées sont refusés. Le script calcule un hash de contenu et conserve les anciens champs/valeurs dans un reçu écrit avant toute activation.

```sh
# Lecture seule par défaut ; nécessite DATABASE_URL pour lister les chapitres.
npm run video:migrate -- --dir /Users/switchingformation/lms-video-mission/hls

# Dépôt uniquement, sans changer le chapitre.
npm run video:migrate -- --dir /chemin/hls --chapter CHAPTER_ID --upload --confirm UPLOAD_R2 --resume --concurrency 12

# Bascule précise, après contrôle du résultat précédent.
npm run video:migrate -- --dir /chemin/hls --chapter CHAPTER_ID --upload --apply --confirm MIGRATE_R2_CHAPTERS
```

Pour une base distante, ajouter explicitement `--allow-production` aux commandes qui écrivent. Pour remplacer un chapitre déjà migré, ajouter `--replace`. La mission n'a utilisé ni ces flags de production ni de base distante. Le script refuse l'activation sans un chapitre précis. Une modification simultanée du chapitre bloque sa bascule. Le reçu `.local/migration-*.json` permet au chef de retrouver la précédente clé et la durée. Retour Vimeo depuis l'éditeur : sélectionner le retour, puis enregistrer ; aucun segment n'est supprimé et aucun progrès n'est réinitialisé.

`--resume` évite de renvoyer les objets dont la taille et l'ETag MD5 correspondent au fichier local. `--concurrency` borne les dépôts simultanés entre 1 et 16 (défaut 1). Après chaque paquet, les références distantes, le nombre d'objets, chaque taille et chaque empreinte sont contrôlés ; le journal indique `X/111 envoyés`. Le préfixe immuable dépend du contenu du paquet. En cas d'interruption, relancer avec `--resume` et un chemin de reçu encore inexistant.

Le dépôt lit les nouveaux champs Prisma et la configuration chiffrée. Pour envoyer les paquets avant la migration de production, utiliser un clone local restauré du dump, appliquer la migration sur ce clone et y saisir les réglages R2. Ne jamais pointer les contrôles de simulation sur ce clone contenant les données réelles : ils exigent une deuxième base jetable distincte.

## Coût R2 estimé au 05/10/2026

R2 Standard : 0,015 $/Go-mois, 4,50 $/million d'écritures, 0,36 $/million de lectures, sortie Internet gratuite. Franchises mensuelles : 10 Go, un million d'écritures et dix millions de lectures ; unités arrondies vers le haut. [Tarifs officiels R2](https://developers.cloudflare.com/r2/pricing/), vérifiés le 05/10/2026.

Hypothèse de 100–150 Go HLS + 47,5 Go de sources conservées : **2,07–2,82 $/mois**, hors taxes/change et autres usages du compte. Sans sources : 1,35–2,10 $. La taille réelle du catalogue converti reste à mesurer.

46 h en segments de six secondes : environ 82 800 segments pour trois qualités. 47 lectures intégrales à une qualité représentent environ 1,30 million de segments. Ces usages seuls restent sous les franchises d'opérations. Les segments vont directement de R2 au navigateur. [Liens présignés](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [CORS](https://developers.cloudflare.com/r2/buckets/cors/).

## Vérifications et limites

`npm run build`, typecheck applicatif, `npm run check:video` et les 26 contrôles `check:sim` (avec une base simulation séparée) sont requis. Les scripts QA sous `scripts/video/qa-*` refusent la base production ; leurs comptes, cookies et objets sont uniquement locaux. Le mock utilise S3rver avec un proxy qui vérifie la signature SigV4 des URLs présignées, leur expiration et l'absence d'accès anonyme ; l'adaptateur ajoute ListParts, absent de S3rver. Ce n'est pas une preuve d'accès au compte R2 réel, encore inactif.

Avant bascule réelle : chef applique la migration, saisit les cinq réglages, configure CORS et le bucket privé, démarre le worker, vérifie un chapitre réel et Safari/iPhone/iPad, puis migre progressivement. Aucun cours réel ni inscription production n'a été changé. Les dépendances existantes présentent des alertes npm ; aucun `audit fix --force` ni changement général de dépendances n'a été entrepris dans cette mission.
