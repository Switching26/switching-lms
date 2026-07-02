# Audit export RiseUp vers Switching LMS

Objectif : preparer la migration des apprenants encore en cours sur RiseUp vers le LMS Switching, sans ecriture en base tant que le rapport n'est pas valide par Samuel.

## Principe

La migration apprenants doit etre separee de l'ancien import de contenu RiseUp. Le script `scripts/import-riseup.ts` est un import de catalogue/formations et contient un mode `--apply` destructif qui supprime/recree des donnees. Il ne doit pas servir pour migrer les apprenants.

Le flux correct est :

1. Exporter depuis RiseUp la liste des apprenants et leurs formations.
2. Lancer un audit local en dry-run avec `scripts/audit-riseup-learners.mjs`.
3. Verifier le rapport : exclus, candidats, doublons, formations non reconnues, precision de progression.
4. Corriger l'export ou le mapping si besoin.
5. Faire un test d'import reel sur 2 ou 3 apprenants seulement, apres GO explicite.
6. Lancer le lot final seulement apres validation du test.

## Donnees minimales attendues dans l'export

Pour chaque apprenant / formation :

- email
- prenom
- nom
- formation ou training title
- statut RiseUp
- pourcentage de progression
- date de debut si disponible
- date de fin si disponible
- identifiant source RiseUp si disponible

Pour une migration vraiment propre de la progression, l'export doit idealement contenir aussi le detail par module/lecon :

- titre de lecon ou chapitre
- statut de la lecon
- progression de la lecon
- temps passe ou derniere position si RiseUp le fournit

Si RiseUp ne fournit qu'un pourcentage global, le LMS peut seulement approximer la progression en marquant les N premiers chapitres dans l'ordre. Ce cas doit rester signale dans le rapport avant validation.

## Commande d'audit

```bash
DATABASE_URL="postgresql://..." node scripts/audit-riseup-learners.mjs --input /chemin/export-riseup.csv
```

Formats acceptes : CSV ou JSON.

Le script ne fait aucune ecriture en base. Il produit :

- un rapport JSON exploitable par script ;
- un rapport Markdown lisible par Samuel.

Par defaut, les rapports sont ecrits dans `generated/riseup-migration-audit/`.

## Cibles LMS actuelles

Au 02/07/2026, le LMS contient :

- `FORMATION Excel VBA (Visual Basic for Applications)` : 40 chapitres
- `Formation SEA - search engine advertising` : 43 chapitres
- `Formation SEO - Search Engine Optimization` : 47 chapitres

Partenaire cible initial : `CNFDI` (`cnfdi`).

## Regles de migration

- Ne jamais migrer les apprenants termines.
- Migrer uniquement les apprenants en cours ou non termines.
- Ne jamais envoyer de mails automatiques pendant un audit.
- Ne jamais ecraser un compte LMS existant sans le signaler dans le rapport.
- Ne jamais inventer une progression fine si l'export ne la fournit pas.
- Garder la marque partenaire dans les contenus et emails ; l'expediteur neutre Brevo/domaine est reporte a la fin du projet.

## Points de blocage a traiter avant import reel

- Export RiseUp admin non encore present localement.
- Il faut confirmer si RiseUp fournit la progression par lecon ou seulement un pourcentage global.
- Aucune licence CNFDI n'est configuree dans le LMS a ce stade.
- La route `partner-admin/parametres` reste a traiter plus tard.
