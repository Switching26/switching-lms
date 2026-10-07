# Rappels de visioconférence — exploitation à préparer

Aucun service, secret ou ordonnanceur n'est créé par cette livraison.

## Point d'entrée

`POST /api/internal/reminders/run`, serveur Node.js, sans corps obligatoire.
Définir à la mise en service `TRAINER_REMINDERS_SECRET` avec une valeur aléatoire longue, stockée uniquement dans les variables protégées du LMS et de l'appelant.
Envoyer `Authorization: Bearer <secret>` en HTTPS. Secret absent : 503 ; mauvais secret : 401.

Exemple de commande, à adapter avant mise en service :

```sh
curl --fail-with-body --silent --show-error --max-time 55 \
  -X POST "$LMS_BASE_URL/api/internal/reminders/run" \
  -H "Authorization: Bearer $TRAINER_REMINDERS_SECRET"
```

Réponse : `{ scanned, sent, skipped, failed }`. `sent` compte des séances : chaque séance produit UNE enveloppe adressée à l'élève et à la formatrice, sans Cci Switching. Le compte élève n'est pas obligatoire ; son adresse vient de l'attribution. Une erreur de transport renvoie un compteur `failed` et un HTTP 503 pour faciliter la surveillance.

## Déclenchement chaque minute

La doc Railway impose un minimum de cinq minutes au cron et ne garantit pas l'heure à la minute : [Cron Jobs](https://docs.railway.com/cron-jobs).
Pour R2, privilégier un **petit worker Railway persistant** qui appelle l'URL toutes les 60 secondes. Il n'a besoin que de l'URL et du secret partagé, pas d'accès à la base ni d'identifiants Gmail. Exemple de boucle de démarrage à copier dans un service dédié, uniquement lors du déploiement autorisé :

```sh
while true; do
  started=$(date +%s)
  curl --fail-with-body --silent --show-error --max-time 55 \
    -X POST "$LMS_BASE_URL/api/internal/reminders/run" \
    -H "Authorization: Bearer $TRAINER_REMINDERS_SECRET" || true
  elapsed=$(($(date +%s) - started))
  if [ "$elapsed" -lt 60 ]; then sleep "$((60 - elapsed))"; fi
done
```

Cette boucle ne lance pas deux requêtes simultanées et déduit la durée de l'appel de l'attente pour viser un départ toutes les 60 secondes. Un ordonnanceur externe à la minute (`* * * * *`) est une autre possibilité. Un cron Railway `*/5 * * * *` produirait normalement un rappel entre 25 et 30 minutes avant la séance, avec la variabilité du fournisseur ; il ne satisfait pas la cadence d'une minute demandée.

## Fenêtre et idempotence

- Séance PLANNED, non annulée, attribution non archivée, formatrice active, périmètre organisme actuel valide.
- Début entre maintenant et maintenant + 30 minutes, inclus ; les séances déjà commencées sont exclues.
- `reminderSentAt` vide, puis renseigné seulement après succès du transport.
- Un verrou PostgreSQL par séance et un verrou de ligne couvrent contrôle, envoi et horodatage. Deux appels parallèles ne produisent pas deux rappels ; une reprise normale n'envoie rien pour une séance déjà traitée. Un appel traite au maximum 100 séances, les suivantes attendent le passage suivant.
- Un déplacement remet le rappel à zéro via le socle ; annulation/suppression excluent la séance des prochains passages.
- Une note seule ne remet pas le rappel à zéro ; changer seulement le lien visio le conserve également (socle SOC2-01).
- Les dates en base sont des instants ; tout affichage mail est en `Europe/Paris`, changement d'heure inclus.
- Une seule soumission Gmail adresse les deux destinataires, évitant une réussite partielle entre élève et formatrice.

Limite opérationnelle : une coupure après acceptation du message par Gmail et avant validation de la transaction peut produire un doublon au rejeu. Gmail ne fournit pas ici une clé d'idempotence de transport ; `reminderSentAt` et les verrous protègent les rejouements ordinaires/concurrents, pas cette fenêtre de panne. Il ne faut pas promettre une garantie absolue « exactement une fois ».

## Notifications de mutation

Création → SESSION_SCHEDULED ; changement de date, durée ou lien → SESSION_UPDATED (ancien et nouveau créneau) ; annulation → SESSION_CANCELLED. Supprimer une séance encore programmée envoie également son annulation. Une note seule n'envoie rien ; terminer une séance n'envoie pas de mail de planning. `notifiedAt` est renseigné après succès de notification.
Les routes renvoient la séance JSON et `notification: { sent, skipped, reason? }` (suppression : `{success:true, notification}`). Un échec mail ne défait pas une mutation déjà enregistrée et ne demande pas de recréer la séance. Les conflits sont renvoyés en HTTP 409 avec `conflicts` pour l'écran.
