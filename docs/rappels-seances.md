# Rappels de visioconférence — exploitation à préparer

Aucun service, secret ou ordonnanceur n'est créé par cette livraison.

## Point d'entrée

`POST /api/internal/reminders/run`, serveur Node.js, sans corps obligatoire.
Définir à la mise en service `TRAINER_REMINDERS_SECRET` avec une valeur aléatoire longue, stockée uniquement dans les variables protégées du LMS et de l'appelant.
Envoyer `Authorization: Bearer <secret>` en HTTPS. Secret absent : 503 ; mauvais secret : 401.

Exemple de commande, à adapter avant mise en service :

```sh
curl --fail-with-body --silent --show-error --max-time 240 \
  -X POST "$LMS_BASE_URL/api/internal/reminders/run" \
  -H "Authorization: Bearer $TRAINER_REMINDERS_SECRET"
```

Réponse : `{ scanned, sent, skipped, failed }`. `sent` compte des séances entièrement notifiées : chaque séance produit DEUX mails personnalisés, un à l'élève et un à la formatrice. Chaque enveloppe porte un seul destinataire, sans Cc ni Cci Switching. Le compte élève n'est pas obligatoire ; son adresse vient de l'attribution. Une erreur de transport renvoie un compteur `failed` et un HTTP 503 pour faciliter la surveillance.

## Tâche planifiée Railway toutes les cinq minutes — décision Samuel

À installer uniquement lors de la mise en ligne autorisée :

1. Créer un service Railway de tâche planifiée avec une image contenant `curl`.
2. Dans ses paramètres **Cron Schedule**, saisir `*/5 * * * *` (toutes les cinq minutes). La documentation Railway fixe ce minimum : [Cron Jobs](https://docs.railway.com/cron-jobs).
3. Définir `LMS_BASE_URL` avec l'URL HTTPS du LMS et `TRAINER_REMINDERS_SECRET` avec le même secret partagé que sur le service LMS. Ne pas afficher le secret dans les journaux.
4. Utiliser la commande `curl` ci-dessus comme commande de démarrage, via `/bin/sh -c` pour développer les variables d'environnement. Elle effectue un seul appel puis se termine. Aucun worker permanent, aucune boucle ni attente à la minute ; aucun accès à la base ou identifiant Gmail dans ce service cron.
5. Vérifier l'exécution et le retour HTTP, puis suivre le compteur `failed` dans les journaux de la tâche. Une exécution échouée sera reprise au prochain passage pour les destinataires encore manquants.

En cadence normale, le rappel part entre 25 et 30 minutes avant le début, tolérance acceptée par Samuel. Si un passage est retardé ou manqué, le suivant rattrape toutes les séances encore à venir dans la fenêtre des 30 minutes ; le rappel peut alors partir moins de 25 minutes avant. On ne cherche jamais une égalité exacte entre l'heure courante et « début moins 30 minutes ».

## Fenêtre et idempotence

- Séance PLANNED, non annulée, attribution non archivée, formatrice active, périmètre organisme actuel valide.
- Début entre maintenant et maintenant + 30 minutes, inclus ; les séances déjà commencées sont exclues.
- `learnerReminderSentAt` et `trainerReminderSentAt` sont les deux horodatages individuels. `reminderSentAt` reste vide jusqu'au succès des DEUX envois, puis conserve son sens de rappel complet.
- Pour chaque destinataire, une transaction distincte prend un verrou PostgreSQL par séance et un verrou de ligne, relit l'état actuel, envoie son mail et valide son horodatage. Le premier succès est donc validé avant de tenter le second. Deux appels parallèles ne produisent pas deux rappels ; une reprise normale n'envoie rien pour une séance déjà traitée. Un appel traite au maximum 100 séances, les suivantes attendent le passage suivant.
- Un déplacement remet les trois horodatages à zéro dans la même mutation du socle ; annulation/suppression excluent la séance des prochains passages.
- Une note seule ne remet pas le rappel à zéro ; changer seulement le lien visio le conserve également (socle SOC2-01).
- Les dates en base sont des instants ; tout affichage mail est en `Europe/Paris`, changement d'heure inclus.
- Si l'un des envois échoue, son horodatage reste vide et la réussite de l'autre est conservée en base. Le prochain passage envoie uniquement le mail manquant ; un redémarrage du processus ne perd pas cet état. Une panne de transport de l'élève n'empêche pas l'essai à la formatrice, et inversement.
- Un déplacement ou une réactivation après annulation ouvre un nouveau cycle de rappel. Retourner à un ancien créneau permet donc un nouveau rappel. Une note ou un lien seuls conservent les réussites partielles. Aucun reçu n'est stocké dans la table des réglages.

Limite opérationnelle : une coupure ou erreur de base après acceptation d'un message par Gmail et avant validation de son horodatage individuel peut produire un doublon au rejeu. Gmail ne fournit pas ici une clé d'idempotence de transport ; les horodatages et les verrous protègent les échecs de transport partiels et les rejouements ordinaires/concurrents, pas cette fenêtre de panne. Il ne faut pas promettre une garantie absolue « exactement une fois ».

## Notifications de mutation

Création → SESSION_SCHEDULED ; changement de date, durée ou lien → SESSION_UPDATED (ancien et nouveau créneau) ; annulation → SESSION_CANCELLED. Supprimer une séance encore programmée envoie également son annulation. Une note seule n'envoie rien ; terminer une séance n'envoie pas de mail de planning. `notifiedAt` est renseigné après succès des deux notifications. Ces notifications de mutation n'ont pas de reçus individuels ni de reprise automatique ; l'idempotence par destinataire concerne les rappels.
Les routes renvoient la séance JSON et `notification: { sent, skipped, reason? }` (suppression : `{success:true, notification}`). Un échec mail ne défait pas une mutation déjà enregistrée et ne demande pas de recréer la séance. Les conflits sont renvoyés en HTTP 409 avec `conflicts` pour l'écran.
