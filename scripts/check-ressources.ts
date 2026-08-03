/**
 * Contrôle des documents pédagogiques côté apprenant.
 *
 *   npx tsx scripts/check-ressources.ts
 *
 * Ce que l'on protège :
 *  1. Un lien de document doit TOUJOURS sortir sur `/api/files/<nom>` — c'est
 *     la seule route qui vérifie session, inscription et expiration. Un
 *     `/uploads/...` laissé tel quel court-circuiterait ce contrôle.
 *  2. Le contrôle « Ressource pédagogique téléchargeable » ne doit apparaître
 *     que si la formation porte au moins un document RÉEL : une ligne sans
 *     fichier ne doit pas ouvrir un panneau vide.
 *  3. La section « Toute la formation » ne doit pas répéter un fichier déjà
 *     listé pour le chapitre courant.
 *  4. Une taille inconnue (`fileSize` à 0, valeur par défaut en base) ne doit
 *     jamais s'afficher « 0 Mo » : mieux vaut ne rien dire qu'un chiffre faux.
 */

import {
  toApiFileUrl,
  typeDeFichier,
  tailleLisible,
  estDocumentExploitable,
  filtrerDocuments,
  dedupeDocuments,
  documentsDeLaFormation,
  libelleConsulter,
  libelleTelecharger,
  nomTelechargement,
} from "@/lib/learner-files"

let echecs = 0
let total = 0

function verifier(intitule: string, obtenu: unknown, attendu: unknown) {
  total++
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu)
  if (!ok) {
    echecs++
    console.log(`  ✗ ${intitule} → ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`)
  }
}

/* ── 1. Normalisation des URL ──────────────────────────────────────────── */

verifier("uploads simple", toApiFileUrl("/uploads/support.pdf"), "/api/files/support.pdf")
verifier("uploads/pdfs", toApiFileUrl("/uploads/pdfs/584622_Module_1.pdf"), "/api/files/584622_Module_1.pdf")
verifier("déjà normalisée", toApiFileUrl("/api/files/support.pdf"), "/api/files/support.pdf")
verifier("nom nu", toApiFileUrl("support.pdf"), "/api/files/support.pdf")
verifier("URL absolue", toApiFileUrl("https://exemple.fr/x/support.pdf"), "/api/files/support.pdf")
verifier("chaîne vide", toApiFileUrl(""), "")
// Comportement HISTORIQUE conservé tel quel : la mutualisation ne doit rien
// changer aux liens déjà servis en production.
verifier("chaîne de requête conservée", toApiFileUrl("/uploads/a.pdf?v=2"), "/api/files/a.pdf?v=2")

/* ── 2. Documents exploitables ─────────────────────────────────────────── */

verifier("document valide", estDocumentExploitable({ fileUrl: "/uploads/a.pdf" }), true)
verifier("fileUrl vide", estDocumentExploitable({ fileUrl: "" }), false)
verifier("fileUrl blanche", estDocumentExploitable({ fileUrl: "   " }), false)
verifier("fileUrl absente", estDocumentExploitable({}), false)
verifier("document nul", estDocumentExploitable(null), false)

verifier(
  "filtrage des lignes incomplètes",
  filtrerDocuments([
    { id: "1", name: "Bon", fileUrl: "/uploads/a.pdf" },
    { id: "2", name: "Cassé", fileUrl: "" },
  ]).map((d) => d.id),
  ["1"],
)
verifier("filtrage d'une liste absente", filtrerDocuments(undefined), [])

/* ── 3. Dédoublonnage chapitre ↔ formation ─────────────────────────────── */

const duChapitre = [{ id: "c1", name: "Support module 1", fileUrl: "/uploads/m1.pdf" }]

verifier(
  "le même fichier n'est pas listé deux fois",
  dedupeDocuments(
    [
      // Même fichier que le chapitre, sous une autre ligne et un autre nom :
      // c'est le NOM DE FICHIER qui fait l'identité, `/api/files` servant par
      // nom.
      { id: "f1", name: "Support (copie formation)", fileUrl: "/uploads/pdfs/m1.pdf" },
      { id: "f2", name: "Classeur d'entraînement", fileUrl: "/uploads/classeur.xlsx" },
    ],
    duChapitre,
  ).map((d) => d.id),
  ["f2"],
)

verifier(
  "doublons internes écartés, ordre d'entrée conservé",
  dedupeDocuments([
    { id: "a", name: "A", fileUrl: "/uploads/x.pdf" },
    { id: "b", name: "B", fileUrl: "/uploads/y.pdf" },
    { id: "c", name: "C bis", fileUrl: "/api/files/x.pdf" },
  ]).map((d) => d.id),
  ["a", "b"],
)

verifier("dédoublonnage sans référence", dedupeDocuments([{ id: "a", name: "A", fileUrl: "/uploads/x.pdf" }]).length, 1)

// Une ligne incomplète n'a pas d'identité : deux lignes cassées ne doivent pas
// fusionner sur la clé vide, sinon l'apprenant n'en verrait qu'une signalée.
verifier(
  "les lignes incomplètes ne fusionnent pas entre elles",
  dedupeDocuments([
    { id: "k1", name: "Cassé 1", fileUrl: "" },
    { id: "k2", name: "Cassé 2", fileUrl: "" },
    { id: "ok", name: "Bon", fileUrl: "/uploads/x.pdf" },
  ]).map((d) => d.id),
  ["k1", "k2", "ok"],
)

/* ── 3 bis. Le cas de production : le support vit sur UN chapitre ───────── */

// Reproduit l'état réel constaté en prod : aucune pièce jointe au niveau
// formation, un seul PDF porté par un chapitre, et l'apprenant se trouve sur un
// AUTRE chapitre. Avant correction, le bouton s'affichait et le panneau
// s'ouvrait vide.
const chapitresProd = [
  { id: "ch-courant", attachments: [] as Array<{ id: string; name: string; fileUrl: string }> },
  {
    id: "ch-support",
    attachments: [
      {
        id: "att-vba",
        name: "Document pédagogique téléchargeable - VBA",
        fileUrl: "/uploads/pdfs/vba-support.pdf",
        fileSize: 9_926_247,
      },
    ],
  },
]
const tousLesDocuments = documentsDeLaFormation([], chapitresProd)

verifier("agrégation formation + chapitres", tousLesDocuments.map((d) => d.id), ["att-vba"])
verifier("le contrôle s'affiche", filtrerDocuments(tousLesDocuments).length > 0, true)
verifier(
  "le PDF d'un AUTRE chapitre est listé dans « Toute la formation »",
  dedupeDocuments(tousLesDocuments, chapitresProd[0].attachments).map((d) => d.id),
  ["att-vba"],
)
// Et depuis le chapitre qui le porte, il n'apparaît qu'une fois — dans « Ce
// chapitre », pas en double dans « Toute la formation ».
verifier(
  "pas de doublon depuis le chapitre porteur",
  dedupeDocuments(tousLesDocuments, chapitresProd[1].attachments).length,
  0,
)

verifier(
  "l'ordre place les documents de formation avant ceux des chapitres",
  documentsDeLaFormation(
    [{ id: "f1", name: "Formation", fileUrl: "/uploads/f.pdf" }],
    [{ attachments: [{ id: "c1", name: "Chapitre", fileUrl: "/uploads/c.pdf" }] }],
  ).map((d) => d.id),
  ["f1", "c1"],
)
verifier("agrégation sans chapitre", documentsDeLaFormation(undefined, undefined), [])

/* ── 4. Type et taille affichés ────────────────────────────────────────── */

verifier("extension PDF", typeDeFichier("/uploads/support.pdf"), "PDF")
verifier("extension XLSX", typeDeFichier("/api/files/classeur.xlsx"), "XLSX")
verifier("extension avec requête", typeDeFichier("/uploads/a.pdf?v=2"), "PDF")
verifier("aucune extension", typeDeFichier("/uploads/support"), null)
// Un nom de FICHIER contenant un point sans extension réelle ne doit pas
// produire une vignette « 0 » ou « 2 ».
verifier("point sans extension valable", typeDeFichier("/uploads/Support 2.0"), null)
verifier("extension trop longue", typeDeFichier("/uploads/a.sauvegarde"), null)
verifier("URL vide", typeDeFichier(""), null)

verifier("taille inconnue", tailleLisible(0), null)
verifier("taille absente", tailleLisible(undefined), null)
verifier("taille négative", tailleLisible(-4), null)
verifier("octets", tailleLisible(512), "512 o")
verifier("kilooctets", tailleLisible(340 * 1024), "340 Ko")
verifier("mégaoctets", tailleLisible(2_517_000), "2.4 Mo")

/* ── 5. Libellés des deux actions ──────────────────────────────────────────
 *
 * Les boutons sont purement iconographiques : leur libellé est la SEULE chose
 * qu'un lecteur d'écran annonce. « Télécharger » tout court, répété sur six
 * lignes, ne permet pas de choisir — le nom du document est obligatoire.
 */

verifier("libellé consulter", libelleConsulter("PDF Module 1"), "Consulter PDF Module 1")
verifier("libellé télécharger", libelleTelecharger("PDF Module 1"), "Télécharger PDF Module 1")
// Les noms en base portent des espaces de fin (« PDF Module 3 - SEO ONSITE  ») :
// ils ne doivent pas produire un libellé à double espace.
verifier("nom avec espaces de fin", libelleConsulter("PDF Module 3 - SEO ONSITE "), "Consulter PDF Module 3 - SEO ONSITE")
verifier("nom vide", libelleTelecharger(""), "Télécharger")

/* ── 6. Nom proposé au téléchargement ─────────────────────────────────────
 *
 * On préfère le nom lisible au nom technique, mais un fichier sans extension
 * n'est ouvert par aucun système : l'extension prime sur l'esthétique.
 */

verifier(
  "nom lisible + extension ajoutée",
  nomTelechargement({ name: "PDF Module 1 - Introduction", fileUrl: "/uploads/pdfs/584622_x.pdf" }),
  "PDF Module 1 - Introduction.pdf",
)
verifier(
  "extension déjà présente, pas doublée",
  nomTelechargement({ name: "Support.pdf", fileUrl: "/uploads/a.pdf" }),
  "Support.pdf",
)
verifier(
  "extension déjà présente en majuscules",
  nomTelechargement({ name: "Support.PDF", fileUrl: "/uploads/a.pdf" }),
  "Support.PDF",
)
verifier(
  "sans nom d'affichage, on retombe sur le nom réel",
  nomTelechargement({ name: "", fileUrl: "/uploads/pdfs/584622_x.pdf" }),
  "584622_x.pdf",
)
verifier(
  "fichier sans extension connue",
  nomTelechargement({ name: "Support 2.0", fileUrl: "/uploads/Support 2.0" }),
  "Support 2.0",
)
verifier("chaîne de requête retirée du nom réel", nomTelechargement({ name: "", fileUrl: "/uploads/a.pdf?v=2" }), "a.pdf")
verifier("document sans fichier", nomTelechargement({ name: "Cassé", fileUrl: "" }), null)

console.log(`\nDocuments apprenant — ${total} vérifications, ${echecs} échec(s)`)
if (echecs) process.exitCode = 1
else console.log("✓ liens protégés, dédoublonnage, et aucun chiffre inventé.")
