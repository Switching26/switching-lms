import { NextRequest, NextResponse } from "next/server"
import { readFile, stat } from "fs/promises"
import { existsSync } from "fs"
import { join } from "path"
import { auth } from "@/lib/auth"
import { chargerContexteSimulation } from "@/lib/simulation/acces"
import {
  aDesPistes,
  estIdentifiantSur,
  estNomDePisteValide,
  lireManifeste,
  lirePlageOctets,
  urlDePiste,
  type ManifesteVoix,
} from "@/lib/simulation/voix"

/**
 * LE GUIDE VOCAL D'UN CHAPITRE — manifeste et pistes.
 *
 *   GET .../voix                 → le manifeste, avec l'adresse de chaque piste
 *   GET .../voix?piste=xxx.mp3   → les octets de la piste
 *
 * UNE SEULE ROUTE POUR LES DEUX, et c'est délibéré : le manifeste et les pistes
 * partagent exactement le même contrôle d'accès, celui du chapitre. Deux routes
 * auraient voulu dire deux gardes à tenir alignées — l'écart que
 * `lib/simulation/acces.ts` a justement été écrit pour supprimer entre `GET` et
 * `verify`.
 *
 * POURQUOI PAS `/api/files` NI `public/`
 *
 *  · `public/` n'est pas servi de façon fiable en standalone sur Railway (piège
 *    0c : covers, logo et favicon en 404 alors que les fichiers existent). Les
 *    couvertures et les PDF passent déjà par une route pour cette raison ;
 *  · `/api/files` ne connaît pas le `mp3` : il le servirait en
 *    `application/octet-stream`, et sa seule garde pour un type inconnu est
 *    « une session existe ». Un apprenant d'un autre organisme pourrait donc
 *    télécharger la voix d'une formation à laquelle il n'a pas accès. Ici, la
 *    garde est celle du chapitre : publication, inscription, expiration.
 *
 * ⚠️ LES REQUÊTES PARTIELLES SONT OBLIGATOIRES POUR L'AUDIO.
 * Safari — donc l'iPad, une des deux tailles de référence — demande un
 * `Accept-Ranges` et sait ne pas lire du tout un média servi sans. C'est la
 * raison du `206` plus bas, pas une optimisation.
 */

export const dynamic = "force-dynamic"

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/mnt/uploads"

/**
 * Où chercher la voix d'un chapitre.
 *
 * Le volume d'abord — c'est là que vivent les fichiers déposés après coup, sans
 * reconstruire l'image. `public/voix/` ensuite, pour ce qui est embarqué au
 * dépôt ; en standalone `process.cwd()` pointe `.next/standalone`, d'où la
 * seconde base, exactement comme `/api/files`.
 */
function dossiersPossibles(chapterId: string): string[] {
  const bases = [process.cwd(), join(process.cwd(), "..", "..")]
  return [
    join(UPLOAD_DIR, "voix", chapterId),
    ...bases.map((b) => join(b, "public", "voix", chapterId)),
  ]
}

function dossierDuChapitre(chapterId: string): string | null {
  return dossiersPossibles(chapterId).find((d) => existsSync(d)) ?? null
}

async function chargerManifeste(dossier: string): Promise<ManifesteVoix | null> {
  const chemin = join(dossier, "manifeste.json")
  if (!existsSync(chemin)) return null
  try {
    return lireManifeste(JSON.parse(await readFile(chemin, "utf8")))
  } catch {
    // Un manifeste illisible ne casse pas l'atelier : il n'a simplement pas de
    // voix. Le silence serait mauvais en revanche pour qui le produit, d'où la
    // trace serveur — jamais renvoyée au navigateur.
    console.warn(`[voix] manifeste illisible : ${chemin}`)
    return null
  }
}

export async function GET(req: NextRequest, { params }: { params: { chapterId: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const { chapterId } = params
  if (!estIdentifiantSur(chapterId)) {
    return NextResponse.json({ error: "Chapitre invalide" }, { status: 400 })
  }

  // Mêmes gardes que la lecture du scénario, contournement de relecture compris :
  // un super-admin doit pouvoir écouter son atelier avant publication.
  const ctx = await chargerContexteSimulation(chapterId, session.user.id, session.user.role === "SUPER_ADMIN")
  if ("error" in ctx) return ctx.error

  const dossier = dossierDuChapitre(chapterId)
  const piste = req.nextUrl.searchParams.get("piste")

  /* ── Les octets d'une piste ─────────────────────────────────────────────── */
  if (piste !== null) {
    if (!estNomDePisteValide(piste)) {
      return new NextResponse("Piste invalide", { status: 400 })
    }
    if (!dossier) return new NextResponse("Piste introuvable", { status: 404 })

    /* LA PISTE DOIT ÊTRE DÉCLARÉE AU MANIFESTE.
     *
     * Le nom est déjà contraint, donc rien ne peut sortir du dossier ; cette
     * seconde garde répond à une autre question : ce dossier ne sert pas de
     * réserve où déposer un fichier quelconque à servir authentifié. Ce qui se
     * télécharge est ce que le manifeste annonce, et rien d'autre. */
    const manifeste = await chargerManifeste(dossier)
    const declaree = manifeste
      ? Object.values(manifeste.etapes).some((segments) => segments.some((s) => s.fichier === piste))
      : false
    if (!declaree) return new NextResponse("Piste introuvable", { status: 404 })

    const chemin = join(dossier, piste)
    if (!existsSync(chemin)) return new NextResponse("Piste introuvable", { status: 404 })

    const { size } = await stat(chemin)
    const fichier = await readFile(chemin)
    const entetes: Record<string, string> = {
      "Content-Type": "audio/mpeg",
      "Accept-Ranges": "bytes",
      // Privé : la voix suit l'accès à la formation, elle ne se met pas en cache
      // partagé. Un an côté navigateur, le contenu d'une piste ne changeant que
      // si son nom change.
      "Cache-Control": "private, max-age=31536000",
    }

    const plage = lirePlageOctets(req.headers.get("range"), size)
    if (!plage) {
      return new NextResponse(fichier, {
        headers: { ...entetes, "Content-Length": String(size) },
      })
    }
    const morceau = fichier.subarray(plage.debut, plage.fin + 1)
    return new NextResponse(morceau, {
      status: 206,
      headers: {
        ...entetes,
        "Content-Range": `bytes ${plage.debut}-${plage.fin}/${size}`,
        "Content-Length": String(morceau.length),
      },
    })
  }

  /* ── Le manifeste ───────────────────────────────────────────────────────── */

  /* UN CHAPITRE SANS VOIX RÉPOND 200, PAS 404.
   *
   * L'atelier demande son manifeste à chaque ouverture, sur les 271 chapitres.
   * Répondre 404 pour ceux qui n'ont pas encore de voix — c'est-à-dire tous sauf
   * le pilote — remplirait les journaux d'erreurs qui n'en sont pas, et rendrait
   * illisible la seule qui compterait vraiment. */
  const manifeste = dossier ? await chargerManifeste(dossier) : null
  if (!manifeste || !aDesPistes(manifeste)) {
    return NextResponse.json({ version: 1, etapes: {} }, { headers: { "Cache-Control": "no-store" } })
  }

  // Chaque segment part avec son adresse déjà construite : le navigateur n'a pas
  // à connaître la forme d'une URL de piste.
  const etapes = Object.fromEntries(
    Object.entries(manifeste.etapes).map(([etapeId, segments]) => [
      etapeId,
      segments.map((s) => ({ ...s, url: urlDePiste(chapterId, s.fichier) })),
    ]),
  )

  return NextResponse.json(
    { version: 1, voix: manifeste.voix, etapes },
    { headers: { "Cache-Control": "no-store" } },
  )
}
