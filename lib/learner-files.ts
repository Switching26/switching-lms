/**
 * Documents pédagogiques côté apprenant : normalisation d'URL, libellés et
 * dédoublonnage.
 *
 * Module PUR et sans dépendance (ni Prisma, ni React) : il sert aussi bien à un
 * composant client qu'au script de contrôle `scripts/check-ressources.ts`.
 */

/**
 * Une pièce jointe telle que la page apprenant la reçoit du serveur.
 *
 * Même forme pour un `Attachment` (chapitre) et un `FormationAttachment`
 * (formation) : seul l'endroit d'où elle vient les distingue.
 */
export type LearnerDocument = {
  id: string
  name: string
  fileUrl: string
  /** Taille en octets ; 0 quand elle n'a pas été renseignée à l'upload. */
  fileSize?: number
}

/**
 * Ramène une URL de pièce jointe sur la route protégée `/api/files/<nom>`.
 *
 * Les `fileUrl` en base pointent encore, pour les documents historiques, sur
 * `/uploads/...`, qui n'applique aucun contrôle : c'est le middleware qui
 * redirige. Un lien doit donc TOUJOURS être posé sous la forme `/api/files/…`,
 * seule route qui vérifie session, inscription et expiration.
 *
 * Le comportement reprend à l'identique l'expression qui était recopiée dans le
 * player (y compris le fait de garder une éventuelle chaîne de requête dans le
 * dernier segment) : c'est une mutualisation, pas un changement de règle.
 */
export function toApiFileUrl(fileUrl: string): string {
  if (!fileUrl) return fileUrl
  if (fileUrl.startsWith("/api/files/")) return fileUrl
  const nom = fileUrl.split("/").pop()
  return nom ? `/api/files/${nom}` : fileUrl
}

/**
 * Un document est exploitable quand il porte une URL de fichier non vide.
 *
 * Sert de garde-fou à l'affichage du contrôle « Ressource pédagogique
 * téléchargeable » : une ligne incomplète en base ne doit pas faire apparaître
 * un accès qui n'ouvrirait rien.
 */
export function estDocumentExploitable(doc: {
  fileUrl?: string | null
} | null | undefined): boolean {
  return !!doc && typeof doc.fileUrl === "string" && doc.fileUrl.trim() !== ""
}

/** Ne garde que les documents réellement ouvrables. */
export function filtrerDocuments<T extends { fileUrl?: string | null }>(
  documents: readonly T[] | null | undefined,
): T[] {
  return (documents ?? []).filter(estDocumentExploitable)
}

/**
 * Extension en majuscules (« PDF », « XLSX »), ou null si indéterminable.
 *
 * On lit le nom de FICHIER, jamais le nom d'affichage : un document peut
 * s'appeler « Support 2.0 » sans que « 0 » soit une extension.
 */
export function typeDeFichier(fileUrl: string): string | null {
  const dernier = (fileUrl || "").split("/").pop() || ""
  const nom = dernier.split("?")[0].split("#")[0]
  const point = nom.lastIndexOf(".")
  if (point <= 0 || point === nom.length - 1) return null
  const ext = nom.slice(point + 1)
  if (!/^[A-Za-z0-9]{1,5}$/.test(ext)) return null
  // Une extension porte toujours au moins une lettre (« pdf », « 7z », « mp3 »).
  // Sans cette condition, un fichier nommé « Support 2.0 » affichait une
  // vignette « 0 ».
  if (!/[A-Za-z]/.test(ext)) return null
  return ext.toUpperCase()
}

/**
 * Taille lisible, ou null quand elle n'est pas connue.
 *
 * `fileSize` vaut 0 par défaut en base : afficher « 0 Mo » ferait croire à un
 * fichier vide. Dans ce cas on n'affiche rien plutôt qu'un chiffre faux.
 */
export function tailleLisible(octets: number | null | undefined): string | null {
  if (typeof octets !== "number" || !Number.isFinite(octets) || octets <= 0) return null
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`
  return `${(octets / 1024 / 1024).toFixed(1)} Mo`
}

/**
 * Libellés des deux actions d'un document.
 *
 * Les boutons sont purement iconographiques : leur seul texte vit dans
 * `aria-label` et `title`. Ces libellés doivent donc TOUJOURS nommer le
 * document — « Télécharger » seul ne dit rien à un lecteur d'écran qui
 * parcourt six lignes de suite.
 */
export function libelleConsulter(nom: string): string {
  return `Consulter ${(nom || "").trim()}`.trim()
}
export function libelleTelecharger(nom: string): string {
  return `Télécharger ${(nom || "").trim()}`.trim()
}

/**
 * Nom de fichier proposé au téléchargement.
 *
 * On préfère le nom d'affichage (« PDF Module 1 - Introduction ») au nom
 * technique stocké (« 584622_2581930_PDF_Module_1_-_Introduction.pdf »), mais
 * SANS jamais perdre l'extension : un fichier sans extension n'est pas ouvert
 * par le système. Si le nom d'affichage manque, on retombe sur le nom réel.
 */
export function nomTelechargement(doc: {
  name?: string | null
  fileUrl?: string | null
}): string | null {
  const url = (doc?.fileUrl || "").trim()
  if (!url) return null
  const reel = url.split("/").pop()?.split("?")[0].split("#")[0] || ""
  const affiche = (doc?.name || "").trim()
  if (!affiche) return reel || null
  const ext = typeDeFichier(url)
  if (!ext) return affiche
  return affiche.toLowerCase().endsWith(`.${ext.toLowerCase()}`)
    ? affiche
    : `${affiche}.${ext.toLowerCase()}`
}

/**
 * Documents dédoublonnés, en écartant ceux déjà listés ailleurs.
 *
 * Deux lignes distinctes peuvent désigner le même fichier (une pièce jointe de
 * chapitre et une pièce jointe de formation qui pointent le même PDF). Comme
 * `/api/files` sert par NOM DE FICHIER, c'est l'URL normalisée qui fait
 * l'identité — ni l'`id` de la ligne, ni le nom d'affichage.
 *
 * L'ordre d'entrée est conservé : la première occurrence gagne.
 *
 * Une ligne SANS fichier exploitable n'a pas d'identité : elle est conservée
 * telle quelle, sinon deux lignes incomplètes fusionneraient sur la clé vide et
 * l'apprenant n'en verrait qu'une seule signalée.
 */
export function dedupeDocuments<T extends { fileUrl: string }>(
  documents: readonly T[] | null | undefined,
  dejaListes: readonly { fileUrl: string }[] = [],
): T[] {
  const vus = new Set<string>()
  for (const d of dejaListes) {
    if (estDocumentExploitable(d)) vus.add(toApiFileUrl(d.fileUrl))
  }
  const sortie: T[] = []
  for (const doc of documents ?? []) {
    if (!estDocumentExploitable(doc)) {
      sortie.push(doc)
      continue
    }
    const cle = toApiFileUrl(doc.fileUrl)
    if (vus.has(cle)) continue
    vus.add(cle)
    sortie.push(doc)
  }
  return sortie
}

/**
 * TOUS les documents d'une formation : pièces jointes de la formation ET de
 * chacun de ses chapitres.
 *
 * C'est la seule source correcte pour la section « Toute la formation » et pour
 * décider d'afficher le contrôle. Se limiter à `FormationAttachment` était un
 * bug : en production, un support peut n'exister que comme pièce jointe d'UN
 * chapitre (cas du PDF « Document pédagogique téléchargeable - VBA »), et le
 * panneau se serait alors ouvert vide depuis tous les autres chapitres.
 *
 * Aucun dédoublonnage ici : il dépend du chapitre affiché, donc il appartient
 * au panneau.
 */
export function documentsDeLaFormation<T extends { fileUrl: string }>(
  documentsFormation: readonly T[] | null | undefined,
  chapitres: readonly { attachments?: readonly T[] | null }[] | null | undefined,
): T[] {
  const sortie: T[] = [...(documentsFormation ?? [])]
  for (const chapitre of chapitres ?? []) {
    for (const doc of chapitre.attachments ?? []) sortie.push(doc)
  }
  return sortie
}
