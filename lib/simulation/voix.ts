/**
 * LE GUIDE VOCAL — ce qui se dit, et où le trouver.
 *
 * Module PUR : aucun import React, aucun accès au disque, aucune dépendance
 * Next. C'est ce qui permet à la route de service, au hook du châssis et au
 * contrôle `check-voix.ts` de partager exactement les mêmes règles — et à ce
 * dernier de tourner en `npx tsx` sans navigateur ni base, comme les 24 autres
 * contrôles du simulateur.
 *
 * POURQUOI UN MANIFESTE PLUTÔT QU'UNE URL DEVINÉE
 *
 * On pourrait déduire l'adresse d'une piste de l'identifiant d'étape
 * (`voix-excel-m07-l01-06.mp3`) et laisser le navigateur essayer. Trois raisons
 * de ne pas le faire :
 *
 *  1. une étape porte PLUSIEURS segments — les 8 fichiers du pilote couvrent
 *     2 étapes : consigne coupée en deux, trois bulles de démonstration, aide,
 *     retour de réussite. Une URL par étape ne saurait pas les ordonner ;
 *  2. sans manifeste, le player ne peut pas savoir si une piste existe AVANT de
 *     la demander : le bouton du cockpit s'afficherait sur les 271 chapitres,
 *     et 404 chapitres sur 271 répondraient en erreur ;
 *  3. les identifiants d'étape NE SONT PAS uniques entre applications —
 *     `M01-L01-03` existe chez Excel, Word ET PowerPoint. Une convention devrait
 *     donc porter l'application, ce qu'un manifeste rangé par chapitre donne
 *     gratuitement.
 *
 * OÙ VIVENT LES FICHIERS
 *
 *     <UPLOAD_DIR|public>/voix/<chapterId>/manifeste.json
 *     <UPLOAD_DIR|public>/voix/<chapterId>/<piste>.mp3
 *
 * Rangés par `chapterId` et non par nom de scénario : c'est la seule clé que le
 * player possède, elle est stable, et elle ne souffre pas du piège du renommage
 * — un chapitre renommé est un chapitre NEUF côté base, donc une voix neuve, ce
 * qui est le comportement voulu puisque son contenu a changé.
 *
 * ⚠️ Ils ne sont JAMAIS servis par `public/` : le service statique de Next ne
 * fonctionne pas en standalone sur Railway (piège 0c du skill). Ils passent par
 * une route, comme les couvertures et les PDF.
 */

/** Ce qu'un segment vient dire, et donc quand il se joue. */
export type RoleVoix =
  /** L'énoncé de l'étape. Se joue à l'arrivée, et lui seul. */
  | "consigne"
  /**
   * L'indice.
   *
   * Il ne se joue QU'AU MOMENT OÙ IL SE DÉVOILE — l'apprenant l'a demandé, ou un
   * palier l'a ouvert après deux erreurs. Jamais à l'arrivée : l'enchaîner à la
   * consigne donnerait la solution à quelqu'un qui n'a pas encore essayé.
   * Mesuré au banc, c'est exactement ce qui s'est produit à la première version.
   *
   * Conséquence assumée : en LEÇON l'indice est affiché dès l'arrivée
   * (`hintShown` vaut vrai en mode `LESSON`), donc il n'y a pas de dévoilement et
   * il n'est pas lu. L'apprenant l'a sous les yeux.
   */
  | "aide"
  /**
   * Le retour de réussite.
   *
   * RÉSERVÉ, NON JOUÉ. Deux raisons mesurées, pas une préférence :
   *  · le player avance TOUT SEUL 550 ms après une action juste
   *    (`window.setTimeout(goNext, 550)`), et changer d'étape coupe la voix — un
   *    retour de trois secondes serait tronqué au sixième de sa durée ;
   *  · `step.feedback` n'est lu par AUCUN player à ce jour (défaut connu : 906
   *    phrases écrites côté Excel, affichées nulle part). Le dire à voix haute
   *    sans l'afficher créerait une information que rien ne confirme à l'écran.
   */
  | "feedback"
  /**
   * Une bulle de démonstration. JOUÉE depuis le 13/08/2026 — choix de Samuel :
   * « il veut que les bulles parlent ».
   *
   * Elle ne se joue JAMAIS à l'arrivée sur l'étape (`ROLES_ARRIVEE` ne la
   * contient pas) : c'est le calque qui la déclenche, quand le geste qu'elle
   * commente entre en phase `bulle`. L'appariement se fait par `geste` — le rang
   * de la bulle d'AUTEUR — et jamais par l'index du geste joué : le moteur
   * insère des ouvertures d'onglet que l'auteur n'a pas écrites.
   *
   * ⚠️ Elle N'EST PAS dans `ROLES_JOUES` : cet ensemble décide de l'affichage du
   * bouton du cockpit, qui rejoue la CONSIGNE. Un chapitre qui ne porterait que
   * des bulles n'a rien à rejouer d'un bouton — c'est la démonstration qui les
   * rejoue, avec « Revoir la démonstration ».
   */
  | "bulle"

export type SegmentVoix = {
  role: RoleVoix
  /** Nom du fichier, sans chemin. Voir `estNomDePisteValide`. */
  fichier: string
  /** Durée annoncée, en secondes. Indicative : le navigateur a la vraie. */
  secondes?: number
  /** Rang du geste illustré, pour un segment `bulle` uniquement. */
  geste?: number
  /** Ce qui est dit, mot pour mot — relecture, accessibilité, contrôle. */
  texte?: string
}

export type ManifesteVoix = {
  version: 1
  /** Moteur et voix employés, à titre de trace : « google:aoede ». */
  voix?: string
  /** Segments par identifiant d'étape, dans l'ordre de lecture. */
  etapes: Record<string, SegmentVoix[]>
}

/**
 * Ce qui se joue À L'ARRIVÉE sur l'étape : l'énoncé, et rien d'autre.
 *
 * ⚠️ N'y ajouter ni `aide` ni `feedback` sans relire les commentaires de
 * `RoleVoix` — les deux ont été essayés, mesurés, et retirés pour des raisons
 * qui n'ont rien d'esthétique.
 */
export const ROLES_ARRIVEE: ReadonlySet<RoleVoix> = new Set<RoleVoix>(["consigne"])

/** Ce qui se joue au dévoilement de l'indice. */
export const ROLES_AIDE: ReadonlySet<RoleVoix> = new Set<RoleVoix>(["aide"])

/** Tout ce que le pilote sait jouer, quel qu'en soit le déclencheur. */
export const ROLES_JOUES: ReadonlySet<RoleVoix> = new Set<RoleVoix>(["consigne", "aide"])

const ROLES: ReadonlySet<string> = new Set<RoleVoix>(["consigne", "aide", "feedback", "bulle"])

/**
 * Un nom de piste est un NOM DE FICHIER, jamais un chemin.
 *
 * La route concatène ce nom à un dossier : tout ce qui pourrait en sortir est
 * refusé ici, à la source, plutôt que dans chaque appelant. Même discipline que
 * `/api/files`, qui refuse `..`, `/` et `\` avant de toucher au disque.
 */
export function estNomDePisteValide(nom: unknown): nom is string {
  if (typeof nom !== "string") return false
  if (nom.length === 0 || nom.length > 100) return false
  if (nom.includes("..") || nom.includes("\\")) return false
  // Un seul point, celui de l'extension, et au plus UN niveau de dossier —
  // `audio/`, celui que produit la chaîne de synthèse. Les caractères sont
  // volontairement pauvres : rien qui puisse être interprété par un système de
  // fichiers.
  return /^(?:audio\/)?[a-zA-Z0-9][a-zA-Z0-9_-]*\.mp3$/.test(nom)
}

/**
 * Un identifiant de chapitre vient de l'URL : il sert à composer un chemin, donc
 * il se valide comme un nom de fichier. Les `cuid` de Prisma sont alphanumériques.
 */
export function estIdentifiantSur(id: unknown): id is string {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(id)
}

/**
 * Relit un manifeste venu du disque.
 *
 * FAIL-CLOSED PAR SEGMENT, jamais par manifeste : un segment mal formé est
 * ignoré, les autres continuent de vivre. Un fichier entièrement rejeté pour une
 * virgule de trop priverait de voix un chapitre dont 90 % des pistes sont
 * bonnes, et — pire — le ferait en silence.
 */
/**
 * Le rôle d'un segment de la chaîne de synthèse, déduit de son identifiant.
 *
 * Elle nomme ses segments `e6-consigne`, `e5-consigne-a`, `e5-bulle2`,
 * `e6-aide`, `e6-feedback`, plus `intro` et `outro`. Le champ `role` qu'elle
 * porte à côté est une PHRASE destinée à la relecture humaine (« Étape 6 · aide,
 * dite au clic sur "Besoin d'aide" ») : lisible, mais impossible à consommer
 * comme une énumération. L'identifiant, lui, est régulier.
 */
/**
 * LE RANG DE LA BULLE, lu sur l'identifiant : `e5-bulle2` → 1.
 *
 * La chaîne de synthèse numérote ses bulles à partir de 1, dans l'ordre des
 * actions `montrer` de l'étape ; le plan de démonstration les indexe à partir de
 * 0 (`GesteDemo.rangBulle`). On convertit ici, une fois, plutôt que dans chaque
 * appelant.
 *
 * ⚠️ On lit le NUMÉRO ÉCRIT, jamais la position dans le tableau : un segment
 * absent — une bulle dont la synthèse a échoué, ou qu'on n'a pas produite —
 * décalerait toutes les suivantes d'un cran. Le décalage serait muet : tout se
 * jouerait, dans le désordre, sans erreur. C'est le même piège que celui qui
 * impose `rangBulle` côté plan.
 *
 * `null` quand le numéro est absent ou illisible : la bulle est alors déclarée
 * mais sans rang, donc jamais appariée — ce qui la rend inerte plutôt que fausse.
 */
function rangDepuisIdentifiant(id: string): number | null {
  const m = /bulle[-_]?(\d+)/i.exec(id)
  if (!m) return null
  const n = Number(m[1])
  return Number.isInteger(n) && n >= 1 ? n - 1 : null
}

function roleDepuisIdentifiant(id: string): RoleVoix {
  const s = id.toLowerCase()
  if (s.includes("bulle")) return "bulle"
  if (s.includes("aide")) return "aide"
  if (s.includes("feedback")) return "feedback"
  // `intro`, `outro`, `consigne`, `consigne-a`, `consigne-b` : tout ce qui
  // énonce. Un identifiant inconnu retombe ici, ce qui le rend lisible plutôt
  // que muet — le pire des deux serait de le perdre en silence.
  return "consigne"
}

/**
 * LE FORMAT DE LA CHAÎNE DE SYNTHÈSE, lu tel quel.
 *
 * Elle produit `{ chapitre, voix, controle, totaux, segments[] }`, chaque
 * segment portant `etape_lms`, `fichier`, `duree_s`, `texte_dit` et son
 * empreinte. On le consomme SANS conversion préalable : un format d'échange qui
 * demande une moulinette manuelle finit toujours par diverger de la source.
 *
 * ⚠️ `etape_lms` vaut aussi `intro` et `outro` — l'écran d'ouverture et l'écran
 * de fin, qui ne sont pas des étapes. Ils sont conservés tels quels : ce sont des
 * clés qu'aucun identifiant d'étape ne peut heurter, et le jour où l'atelier
 * saura les jouer, elles seront déjà là.
 */
function lireManifesteSynthese(o: Record<string, unknown>): ManifesteVoix | null {
  const segments = o.segments
  if (!Array.isArray(segments)) return null
  const chapitre = (o.chapitre ?? {}) as Record<string, unknown>
  const voix = (o.voix ?? {}) as Record<string, unknown>

  const etapes: Record<string, SegmentVoix[]> = {}
  for (const s of segments) {
    if (!s || typeof s !== "object") continue
    const seg = s as Record<string, unknown>
    const etapeId = typeof seg.etape_lms === "string" ? seg.etape_lms : null
    if (!etapeId) continue
    if (!estNomDePisteValide(seg.fichier)) continue
    const id = typeof seg.id === "string" ? seg.id : ""
    const role = roleDepuisIdentifiant(id)
    const rang = role === "bulle" ? rangDepuisIdentifiant(id) : null
    const piste: SegmentVoix = {
      role,
      fichier: seg.fichier,
      ...(typeof seg.duree_s === "number" && seg.duree_s > 0 ? { secondes: seg.duree_s } : {}),
      ...(typeof seg.texte_dit === "string" ? { texte: seg.texte_dit } : {}),
      // Le rang n'a de sens que pour une bulle : c'est lui qui l'apparie au
      // geste d'auteur, et rien d'autre ne le fait.
      ...(rang !== null ? { geste: rang } : {}),
    }
    if (!etapes[etapeId]) etapes[etapeId] = []
    etapes[etapeId].push(piste)
  }

  const app = typeof chapitre.app === "string" ? `${chapitre.app} · ` : ""
  return {
    version: 1,
    ...(typeof voix.nom === "string" ? { voix: `${app}${voix.nom}` } : {}),
    etapes,
  }
}

export function lireManifeste(brut: unknown): ManifesteVoix | null {
  if (!brut || typeof brut !== "object") return null
  const o = brut as Record<string, unknown>
  // Le format de la chaîne de synthèse, reconnu à sa forme et non à un drapeau :
  // elle ne porte pas de numéro de version.
  if (Array.isArray(o.segments)) return lireManifesteSynthese(o)
  if (o.version !== 1) return null
  const etapesBrutes = o.etapes
  if (!etapesBrutes || typeof etapesBrutes !== "object") return null

  const etapes: Record<string, SegmentVoix[]> = {}
  for (const [etapeId, valeur] of Object.entries(etapesBrutes as Record<string, unknown>)) {
    if (!etapeId || typeof etapeId !== "string") continue
    if (!Array.isArray(valeur)) continue
    const segments: SegmentVoix[] = []
    for (const s of valeur) {
      if (!s || typeof s !== "object") continue
      const seg = s as Record<string, unknown>
      if (!ROLES.has(seg.role as string)) continue
      if (!estNomDePisteValide(seg.fichier)) continue
      segments.push({
        role: seg.role as RoleVoix,
        fichier: seg.fichier,
        ...(typeof seg.secondes === "number" && Number.isFinite(seg.secondes) && seg.secondes > 0
          ? { secondes: seg.secondes }
          : {}),
        ...(typeof seg.geste === "number" && Number.isInteger(seg.geste) ? { geste: seg.geste } : {}),
        ...(typeof seg.texte === "string" ? { texte: seg.texte } : {}),
      })
    }
    if (segments.length) etapes[etapeId] = segments
  }

  return {
    version: 1,
    ...(typeof o.voix === "string" ? { voix: o.voix } : {}),
    etapes,
  }
}

/**
 * Les segments d'une étape, filtrés par rôle et dans l'ordre du manifeste.
 *
 * L'ordre du tableau FAIT FOI : c'est lui qui enchaîne « le problème » puis « la
 * conclusion » d'une même consigne coupée en deux. Ne jamais le retrier.
 */
export function segmentsPour(
  manifeste: ManifesteVoix | null,
  etapeId: string | null | undefined,
  roles: ReadonlySet<RoleVoix> = ROLES_JOUES,
): SegmentVoix[] {
  if (!manifeste || !etapeId) return []
  const segments = manifeste.etapes[etapeId]
  if (!segments) return []
  return segments.filter((s) => roles.has(s.role))
}

/**
 * LA BULLE QUI COMMENTE LE GESTE D'AUTEUR DE RANG `rang`.
 *
 * `null` quand il n'y en a pas — chapitre sans voix, bulle non produite, ou
 * segment déclaré sans numéro lisible. L'appelant doit alors garder le rythme
 * d'avant : une bulle sans voix ne s'allonge pas.
 *
 * ⚠️ APPARIEMENT PAR RANG D'AUTEUR, JAMAIS PAR POSITION. Chercher « la n-ième
 * bulle du tableau » se casserait dès qu'une piste manque, et le ferait en
 * silence — tout se jouerait, décalé d'un cran. Le rang vient du numéro écrit
 * dans l'identifiant du segment, et il doit correspondre à `GesteDemo.rangBulle`.
 */
export function bullePour(
  manifeste: ManifesteVoix | null,
  etapeId: string | null | undefined,
  rang: number,
): SegmentVoix | null {
  if (!manifeste || !etapeId || !Number.isInteger(rang) || rang < 0) return null
  const segments = manifeste.etapes[etapeId]
  if (!segments) return null
  return segments.find((s) => s.role === "bulle" && s.geste === rang) ?? null
}

/** Le chapitre a-t-il la moindre piste jouable ? Décide de l'affichage du bouton. */
export function aDesPistes(manifeste: ManifesteVoix | null): boolean {
  if (!manifeste) return false
  return Object.values(manifeste.etapes).some((segments) =>
    segments.some((s) => ROLES_JOUES.has(s.role)),
  )
}

/** Adresse d'une piste, servie par la route du chapitre. */
export function urlDePiste(chapterId: string, fichier: string): string {
  return `/api/simulations/${encodeURIComponent(chapterId)}/voix?piste=${encodeURIComponent(fichier)}`
}

/**
 * `bytes=100-499` → `{ debut: 100, fin: 499 }`. `null` si la requête est entière
 * ou si l'en-tête est inexploitable.
 *
 * ⚠️ CE N'EST PAS UNE OPTIMISATION. Safari — donc l'iPad, une des deux tailles
 * de référence du simulateur — réclame `Accept-Ranges` et sait refuser de lire
 * un média servi sans requête partielle. Sans cette fonction, la voix ne se
 * jouerait pas du tout sur une moitié du parc.
 *
 * Elle vit ici, et non dans la route : un module de route Next n'accepte que ses
 * exports réservés (`GET`, `dynamic`…), donc rien de ce qui y est écrit n'est
 * atteignable par un contrôle. Le placer dans le module pur le rend piégeable.
 */
export function lirePlageOctets(
  entete: string | null | undefined,
  taille: number,
): { debut: number; fin: number } | null {
  if (!entete || taille <= 0) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(entete.trim())
  if (!m) return null
  const [, brutDebut, brutFin] = m
  if (!brutDebut && !brutFin) return null
  // `bytes=-500` : les 500 derniers octets, jamais plus que le fichier entier.
  if (!brutDebut) {
    const demande = Number(brutFin)
    if (!Number.isFinite(demande) || demande <= 0) return null
    const longueur = Math.min(demande, taille)
    return { debut: taille - longueur, fin: taille - 1 }
  }
  const debut = Number(brutDebut)
  const fin = brutFin ? Math.min(Number(brutFin), taille - 1) : taille - 1
  if (!Number.isFinite(debut) || !Number.isFinite(fin)) return null
  if (debut > fin || debut >= taille || debut < 0) return null
  return { debut, fin }
}
