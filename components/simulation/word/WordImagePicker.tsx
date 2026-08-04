"use client"

/**
 * La galerie d'images du simulateur — l'équivalent de « Insérer une image ».
 *
 * POURQUOI UNE GALERIE, ET PAS LE SÉLECTEUR DE FICHIER DE WORD
 *
 * Le vrai Word ouvre le disque de l'apprenant. Un simulateur ne le peut pas, et
 * ne le doit pas : sur mobile, l'accès aux fichiers est un parcours à part
 * entière, et un chapitre ne peut pas dépendre du contenu de la photothèque de
 * celui qui le suit. La galerie propose donc des images fournies, exactement
 * comme une banque d'images intégrée.
 *
 * Le geste enseigné reste le bon : ouvrir l'insertion, choisir une image, la
 * poser dans le document — puis régler son habillage, ce qui est le vrai sujet
 * du métier.
 *
 * ⚠️ Les images sont des SVG en data URI, définis ICI. Aucun fichier, aucun
 * réseau : un chapitre doit se jouer hors ligne et donner le même rendu à tout
 * le monde. Elles sont volontairement schématiques — ce sont des supports de
 * mise en page, pas des photographies.
 *
 * ⚠️ Styles INLINE, jamais de classe Tailwind inédite.
 */

const svg = (contenu: string) =>
  `data:image/svg+xml;base64,${typeof window === "undefined" ? "" : window.btoa(unescape(encodeURIComponent(contenu)))}`

/** Les images disponibles. L'identifiant est celui que le scénario vise. */
export const IMAGES: { id: string; libelle: string; svg: string }[] = [
  {
    id: "logo",
    libelle: "Logo d'entreprise",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="160"><rect width="260" height="160" fill="#1b5e3a"/><circle cx="130" cy="72" r="40" fill="#eef6f1"/><rect x="70" y="122" width="120" height="10" rx="5" fill="#eef6f1"/></svg>`,
  },
  {
    id: "graphique",
    libelle: "Graphique de ventes",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180"><rect width="300" height="180" fill="#f7f5f2"/><rect x="30" y="110" width="34" height="50" fill="#1b5e3a"/><rect x="82" y="80" width="34" height="80" fill="#2f7d52"/><rect x="134" y="52" width="34" height="108" fill="#4a9c6c"/><rect x="186" y="30" width="34" height="130" fill="#6bb98a"/><rect x="20" y="160" width="260" height="3" fill="#c9c4bc"/></svg>`,
  },
  {
    id: "plan",
    libelle: "Plan d'atelier",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="190"><rect width="280" height="190" fill="#fff"/><rect x="16" y="16" width="248" height="158" fill="none" stroke="#2c2a26" stroke-width="3"/><rect x="40" y="42" width="86" height="56" fill="none" stroke="#7a746b" stroke-width="2"/><rect x="152" y="42" width="86" height="56" fill="none" stroke="#7a746b" stroke-width="2"/><rect x="40" y="120" width="198" height="34" fill="none" stroke="#7a746b" stroke-width="2"/></svg>`,
  },
  {
    id: "organigramme",
    libelle: "Organigramme",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180"><rect width="300" height="180" fill="#fff"/><rect x="110" y="14" width="80" height="34" rx="4" fill="#1b5e3a"/><rect x="26" y="98" width="76" height="34" rx="4" fill="#4a9c6c"/><rect x="112" y="98" width="76" height="34" rx="4" fill="#4a9c6c"/><rect x="198" y="98" width="76" height="34" rx="4" fill="#4a9c6c"/><path d="M150 48 V74 M64 74 H236 M64 74 V98 M150 74 V98 M236 74 V98" stroke="#7a746b" stroke-width="2" fill="none"/></svg>`,
  },
  {
    id: "processus",
    libelle: "Processus en étapes",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120"><rect width="320" height="120" fill="#fff"/><path d="M12 34 h74 l20 26 -20 26 H12 l20-26 z" fill="#1b5e3a"/><path d="M106 34 h74 l20 26 -20 26 H106 l20-26 z" fill="#2f7d52"/><path d="M200 34 h74 l20 26 -20 26 H200 l20-26 z" fill="#4a9c6c"/></svg>`,
  },
  {
    id: "zone-texte",
    libelle: "Zone de texte encadrée",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="140"><rect width="280" height="140" fill="#fff"/><rect x="10" y="10" width="260" height="120" rx="6" fill="#f7f5f2" stroke="#1b5e3a" stroke-width="3"/><rect x="34" y="42" width="180" height="8" rx="4" fill="#c9c4bc"/><rect x="34" y="64" width="212" height="8" rx="4" fill="#c9c4bc"/><rect x="34" y="86" width="140" height="8" rx="4" fill="#c9c4bc"/></svg>`,
  },
]

export default function WordImagePicker({
  onChoisir,
  onFermer,
}: {
  /** Rend l'identifiant et le data URI de l'image choisie. */
  onChoisir: (id: string, source: string) => void
  onFermer: () => void
}) {
  return (
    <div
      role="dialog"
      aria-label="Insérer une image"
      style={{
        position: "absolute",
        left: "50%",
        top: 24,
        transform: "translateX(-50%)",
        zIndex: 40,
        background: "#fff",
        border: "1px solid #d8d4cd",
        borderRadius: 10,
        boxShadow: "0 12px 32px rgba(0,0,0,.16)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        maxWidth: "94%",
        maxHeight: "88%",
        overflowY: "auto",
      }}
    >
      <strong style={{ fontSize: 14 }}>Insérer une image</strong>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {IMAGES.map((im) => (
          <button
            key={im.id}
            type="button"
            data-image={im.id}
            onClick={() => onChoisir(im.id, svg(im.svg))}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              padding: 8,
              minHeight: 44,
              border: "1px solid #d8d4cd",
              borderRadius: 8,
              background: "#fff",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            <span
              // L'aperçu est décoratif : l'image réelle est posée dans le
              // document, pas ici.
              dangerouslySetInnerHTML={{ __html: im.svg }}
              style={{ display: "block", width: 96, height: 62, overflow: "hidden" }}
            />
            {im.libelle}
          </button>
        ))}
      </div>

      <button
        type="button"
        data-control="w-image-fermer"
        onClick={onFermer}
        style={{
          minHeight: 44,
          borderRadius: 8,
          border: "none",
          background: "#1b5e3a",
          color: "#fff",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Fermer
      </button>
    </div>
  )
}
