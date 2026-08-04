"use client"

/**
 * Le ruban de Word — le nôtre, pas celui d'Univer.
 *
 * POURQUOI RECONSTRUIRE UN RUBAN alors que le moteur en a un : parce qu'un
 * simulateur doit maîtriser ce que l'apprenant voit. Le ruban natif d'Univer
 * porte des boutons qu'aucun scénario n'attend, change avec les versions du
 * paquet, et traduit l'onglet *Home* par « **Démarrer** » — un apprenant à qui
 * l'on demande d'aller dans l'onglet Accueil ne le trouverait pas.
 *
 * ⚠️ STYLES INLINE, avec les `@keyframes` embarqués. Le JIT de Tailwind ne
 * génère que les classes présentes à la compilation : une classe inédite est
 * INERTE, en production comme au banc. C'est la règle du player, et elle a déjà
 * coûté un lot de retouches visuelles invisibles côté Excel.
 *
 * ⚠️ CHAQUE BOUTON DOIT AGIR. Un identifiant finit toujours par émettre une
 * observation `control`, donc un bouton qui ne ferait rien validerait quand même
 * l'étape et laisserait l'apprenant devant un écran inchangé. `check-controles`
 * refuse un bouton rendu ici sans commande dans `WordSurface`, et un bouton cité
 * par un scénario sans rendu ici.
 */

import { useState } from "react"
import { LIBELLES_CONTROLES_WORD } from "@/lib/simulation/word/adaptateur"

export type OngletWord = "fichier" | "accueil" | "insertion" | "mise-en-page" | "revision" | "affichage"

type Bouton = {
  id: string
  /** Ce qui s'affiche : une lettre stylée pour G/I/S, un mot sinon. */
  glyphe?: string
  /** Le libellé sous l'icône. Absent : le glyphe suffit (G, I, S). */
  texte?: string
  style?: "gras" | "italique" | "souligne" | "barre"
  large?: boolean
  /**
   * Valeurs proposées, pour les contrôles qui en EXIGENT une.
   *
   * 🔴 Sans elles, le bouton était rendu et inerte : la commande sous-jacente
   * a besoin d'un argument, `executer` rendait donc `false`, et l'apprenant
   * cliquait sur « Taille » sans que rien ne change. Le contrôle des boutons ne
   * le voyait même pas, puisque l'identifiant FIGURAIT bien dans la table des
   * commandes. Un bouton qui réclame une valeur doit offrir le moyen de la
   * donner.
   */
  valeurs?: { valeur: string; libelle: string }[]
}

const POLICES = ["Arial", "Georgia", "Times New Roman", "Verdana"].map((f) => ({
  valeur: f,
  libelle: f,
}))
const TAILLES = [9, 11, 12, 14, 18, 24, 28, 36].map((n) => ({ valeur: String(n), libelle: String(n) }))
const COULEURS = [
  { valeur: "#1a1a1a", libelle: "Noir" },
  { valeur: "#c0392b", libelle: "Rouge" },
  { valeur: "#1b5e3a", libelle: "Vert" },
  { valeur: "#1f4e79", libelle: "Bleu" },
]
/**
 * ⚠️ « Aucune » EST UNE COULEUR DE SURLIGNAGE — décision D15.
 *
 * Sans cette entrée, un surlignage posé ne pouvait plus être retiré : la liste
 * n'offrait que trois couleurs. Or retirer une annotation fait partie du geste
 * de relecture au même titre que la poser, et son absence rendait injouables
 * trois leçons du module « Modification de texte ».
 *
 * La valeur `aucune` — et non la chaîne vide, déjà employée par le sélecteur
 * comme sentinelle « rien choisi » — est traduite en `null` par la surface.
 */
const SURLIGNAGES = [
  { valeur: "aucune", libelle: "Aucune" },
  { valeur: "#f1c40f", libelle: "Jaune" },
  { valeur: "#a9dfbf", libelle: "Vert" },
  { valeur: "#aed6f1", libelle: "Bleu" },
]

type Groupe = { titre: string; boutons: Bouton[] }

/**
 * Les trois onglets rendus.
 *
 * Word en a huit ; n'afficher que ceux qui portent quelque chose éviterait à un
 * apprenant de chercher dans un onglet vide. Les autres sont rendus INERTES et
 * sans attribut d'onglet, exactement comme côté Excel : un pilote automatique
 * qui les verrait perdrait trente secondes de délai d'attente par onglet.
 */
const ONGLETS: { id: OngletWord; libelle: string }[] = [
  { id: "fichier", libelle: "Fichier" },
  { id: "accueil", libelle: "Accueil" },
  { id: "insertion", libelle: "Insertion" },
  { id: "mise-en-page", libelle: "Mise en page" },
  { id: "revision", libelle: "Révision" },
  { id: "affichage", libelle: "Affichage" },
]

const ONGLETS_INERTES = ["Références", "Publipostage"]

const GROUPES: Record<OngletWord, Groupe[]> = {
  accueil: [
    {
      titre: "Presse-papiers",
      boutons: [
        { id: "w-coller", texte: "Coller", large: true },
        { id: "w-copier", texte: "Copier" },
        { id: "w-couper", texte: "Couper" },
      ],
    },
    {
      titre: "Police",
      boutons: [
        { id: "w-gras", glyphe: "G", style: "gras" },
        { id: "w-italique", glyphe: "I", style: "italique" },
        { id: "w-souligne", glyphe: "S", style: "souligne" },
        { id: "w-barre", glyphe: "S", style: "barre" },
        { id: "w-police", texte: "Police", valeurs: POLICES, large: true },
        { id: "w-taille", texte: "Taille", valeurs: TAILLES },
        { id: "w-couleur", texte: "Couleur", valeurs: COULEURS },
        { id: "w-surlignage", texte: "Surlignage", valeurs: SURLIGNAGES, large: true },
      ],
    },
    {
      titre: "Paragraphe",
      boutons: [
        { id: "w-liste-puces", texte: "Puces" },
        { id: "w-liste-numerotee", texte: "Numéros" },
        { id: "w-align-gauche", texte: "Gauche" },
        { id: "w-align-centre", texte: "Centrer" },
        { id: "w-align-droite", texte: "Droite" },
        { id: "w-align-justifie", texte: "Justifier" },
      ],
    },
    {
      titre: "Styles",
      boutons: [
        { id: "w-style-normal", texte: "Normal" },
        { id: "w-style-titre", texte: "Titre" },
        { id: "w-style-soustitre", texte: "Sous-titre", large: true },
        { id: "w-style-titre1", texte: "Titre 1" },
        { id: "w-style-titre2", texte: "Titre 2" },
        { id: "w-style-titre3", texte: "Titre 3" },
      ],
    },
    {
      titre: "Annulation",
      boutons: [
        { id: "w-annuler", texte: "Annuler" },
        { id: "w-retablir", texte: "Rétablir" },
      ],
    },
  ],
  insertion: [
    {
      titre: "Tableaux",
      /*
       * ⚠️ PAS DE BOUTON LIGNE/COLONNE POUR L'INSTANT — et c'est délibéré.
       *
       * Les commandes existent (`table-insert-row-above/bellow`,
       * `table-insert-column-left/right`, `doc.table.delete-rows`) et elles ont
       * été câblées puis RETIRÉES : elles exigent un point d'insertion situé
       * DANS UNE CELLULE, que je n'ai pas su poser de façon reproductible. Sans
       * cette garantie, elles rendraient `false` en silence — un bouton qui ne
       * fait rien valide l'étape et laisse l'apprenant devant un écran inchangé,
       * exactement le défaut que `check-controles` existe pour interdire.
       */
      boutons: [{ id: "w-inserer-tableau", texte: "Tableau", large: true }],
    },
    {
      titre: "Liens",
      boutons: [
        { id: "w-inserer-lien", texte: "Lien", large: true },
        { id: "w-retirer-lien", texte: "Retirer le lien" },
      ],
    },
    {
      titre: "Illustrations",
      boutons: [
        { id: "w-inserer-image", texte: "Image", large: true },
        { id: "w-habillage-aligne", texte: "Aligné" },
        { id: "w-habillage-carre", texte: "Rapproché" },
        { id: "w-habillage-hautbas", texte: "Haut et bas" },
        { id: "w-habillage-devant", texte: "Devant" },
        { id: "w-supprimer-image", texte: "Supprimer l'image" },
      ],
    },
    {
      titre: "Lignes et colonnes",
      boutons: [
        { id: "w-ligne-dessus", texte: "Ligne au-dessus" },
        { id: "w-ligne-dessous", texte: "Ligne en dessous" },
        { id: "w-colonne-gauche", texte: "Colonne à gauche" },
        { id: "w-colonne-droite", texte: "Colonne à droite" },
        { id: "w-supprimer-ligne", texte: "Supprimer la ligne" },
        { id: "w-supprimer-colonne", texte: "Supprimer la colonne" },
      ],
    },
    {
      titre: "En-tête et pied de page",
      boutons: [{ id: "w-entete-pied", texte: "En-tête", large: true }],
    },
  ],
  "mise-en-page": [
    {
      titre: "Mise en page",
      boutons: [{ id: "w-mise-en-page", texte: "Marges", large: true }],
    },
  ],
  /*
   * Les trois onglets ci-dessous ouvrent des surfaces MAISON — le moteur n'a
   * aucune commande d'en-tête, d'impression ni de taquet. Chacune enseigne le
   * geste et son effet visuel, comme le panneau de mise en page.
   */
  fichier: [
    {
      titre: "Fichier",
      boutons: [{ id: "w-imprimer", texte: "Imprimer", large: true }],
    },
  ],
  revision: [
    {
      titre: "Vérification",
      boutons: [{ id: "w-verification", texte: "Vérifier", large: true }],
    },
  ],
  affichage: [
    {
      titre: "Afficher",
      boutons: [{ id: "w-regle", texte: "Règle", large: true }],
    },
  ],
}

type Props = {
  /** Onglet imposé par l'étape courante, s'il y en a un. */
  ongletImpose?: OngletWord
  onControle: (id: string, argument?: string) => void
  /** Nom du document, affiché dans la barre de titre. */
  titreDocument?: string
}

export default function WordChrome({ ongletImpose, onControle, titreDocument }: Props) {
  const [onglet, setOnglet] = useState<OngletWord>(ongletImpose ?? "accueil")
  const actif = ongletImpose ?? onglet
  /** Boîte « Insérer un tableau », comme la modale native mais chez nous. */
  const [boiteTableau, setBoiteTableau] = useState(false)
  const [lignes, setLignes] = useState(3)
  const [colonnes, setColonnes] = useState(4)

  return (
    <div style={{ flexShrink: 0, background: "#fff", borderBottom: "1px solid #e6e3dd" }}>
      {/* Barre de titre — décorative, comme celle du poste de travail d'Excel. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 30,
          padding: "0 10px",
          background: "#f6f4f0",
          fontSize: 12,
          color: "#5b554d",
        }}
      >
        <span>{titreDocument ?? "Document1"} — Word</span>
        <span aria-hidden style={{ letterSpacing: 6, opacity: 0.5 }}>─ ▢ ✕</span>
      </div>

      {/* Onglets */}
      {/* Défilante et sans repli : à 390 px, « Mise en page » se cassait sur
          trois lignes et poussait la surface de travail vers le bas. Même
          motif que le ruban Excel mobile. */}
      <div
        style={{
          display: "flex",
          gap: 2,
          padding: "0 8px",
          background: "#f6f4f0",
          overflowX: "auto",
          whiteSpace: "nowrap",
        }}
      >
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            type="button"
            data-ribbon-tab={o.id}
            onClick={() => setOnglet(o.id)}
            style={{
              border: "none",
              background: actif === o.id ? "#fff" : "transparent",
              color: actif === o.id ? "#1b5e3a" : "#5b554d",
              fontWeight: actif === o.id ? 600 : 400,
              fontSize: 13,
              padding: "7px 12px",
              borderRadius: "6px 6px 0 0",
              cursor: "pointer",
              minHeight: 32,
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {o.libelle}
          </button>
        ))}
        {/* Rendus mais INERTES, et volontairement sans `data-ribbon-tab`. */}
        {ONGLETS_INERTES.map((t) => (
          <span
            key={t}
            aria-disabled
            style={{
              fontSize: 13,
              padding: "7px 12px",
              color: "#b3ada3",
              cursor: "default",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {t}
          </span>
        ))}
      </div>

      {/*
        Une SEULE ligne, défilante horizontalement. Motif éprouvé sur le ruban
        Excel mobile : à 390 px, un ruban qui s'empile mange la moitié de
        l'écran et la surface de travail devient inutilisable.
      */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: 14,
          height: 62,
          padding: "4px 10px",
          overflowX: "auto",
          overflowY: "hidden",
          background: "#fff",
        }}
      >
        {(GROUPES[actif] ?? []).map((g) => (
          <div key={g.titre} style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 3, alignItems: "center", flex: 1 }}>
              {g.boutons.map((b) => (
                b.valeurs ? (
                  <SelecteurRuban key={b.id} bouton={b} onValeur={(v) => onControle(b.id, v)} />
                ) : (
                  <BoutonRuban
                    key={b.id}
                    bouton={b}
                    onClick={() => {
                      if (b.id === "w-inserer-tableau") {
                        setBoiteTableau(true)
                        /*
                         * ⚠️ ÉMETTRE QUAND MÊME. Ce bouton ouvre notre boîte de
                         * dialogue au lieu d'exécuter une commande — mais une
                         * étape peut légitimement demander de l'OUVRIR. Sans
                         * cette émission, le clic ne produit aucune
                         * observation : la boîte s'ouvre à l'écran et l'atelier
                         * reste bloqué sur la consigne, sans rien dire.
                         *
                         * L'insertion réelle, elle, part plus tard avec les
                         * dimensions — les deux signaux ne se marchent pas
                         * dessus.
                         */
                        onControle(b.id)
                        return
                      }
                      onControle(b.id)
                    }}
                  />
                )
              ))}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "#9a938a",
                textAlign: "center",
                paddingTop: 2,
                borderTop: "1px solid #f0ede8",
              }}
            >
              {g.titre}
            </div>
          </div>
        ))}
      </div>

      {boiteTableau && (
        <BoiteTableau
          lignes={lignes}
          colonnes={colonnes}
          setLignes={setLignes}
          setColonnes={setColonnes}
          onAnnuler={() => setBoiteTableau(false)}
          onValider={() => {
            setBoiteTableau(false)
            onControle("w-inserer-tableau", `${lignes}x${colonnes}`)
          }}
        />
      )}
    </div>
  )
}

/**
 * Un contrôle qui porte une valeur — taille, police, couleur.
 *
 * Rendu en liste déroulante plutôt qu'en bouton : c'est le seul rendu qui
 * permette à l'apprenant de FOURNIR la valeur que la commande exige. Le premier
 * élément est un intitulé non sélectionnable, pour que la liste dise ce qu'elle
 * règle sans un libellé séparé qui mangerait la largeur.
 */
function SelecteurRuban({
  bouton,
  onValeur,
}: {
  bouton: Bouton
  onValeur: (v: string) => void
}) {
  return (
    <select
      data-control={bouton.id}
      aria-label={LIBELLES_CONTROLES_WORD[bouton.id] ?? bouton.id}
      defaultValue=""
      onChange={(e) => {
        const v = e.target.value
        if (!v) return
        onValeur(v)
        e.target.value = ""
      }}
      style={{
        minHeight: 44,
        minWidth: bouton.large ? 92 : 66,
        // 16 px minimum : en dessous, iOS zoome sur le champ à la mise au point.
        fontSize: 16,
        border: "1px solid #e2ded7",
        borderRadius: 6,
        background: "#fff",
        color: "#2c2a26",
        padding: "2px 4px",
      }}
    >
      <option value="">{bouton.texte}</option>
      {(bouton.valeurs ?? []).map((v) => (
        <option key={v.valeur} value={v.valeur}>
          {v.libelle}
        </option>
      ))}
    </select>
  )
}

function BoutonRuban({ bouton, onClick }: { bouton: Bouton; onClick: () => void }) {
  const libelle = LIBELLES_CONTROLES_WORD[bouton.id] ?? bouton.id
  return (
    <button
      type="button"
      data-control={bouton.id}
      onClick={onClick}
      // `aria-label` porte le libellé complet ; le `title` natif est écarté,
      // comme dans le reste du LMS.
      aria-label={libelle}
      style={{
        // ≥ 44 px de côté : la cible tactile minimale tenue partout dans le LMS.
        minWidth: bouton.large ? 62 : 44,
        minHeight: 44,
        border: "1px solid transparent",
        borderRadius: 6,
        background: "transparent",
        color: "#2c2a26",
        fontSize: bouton.glyphe ? 17 : 11,
        lineHeight: 1.15,
        padding: "2px 4px",
        cursor: "pointer",
        fontWeight: bouton.style === "gras" ? 700 : 400,
        fontStyle: bouton.style === "italique" ? "italic" : "normal",
        textDecoration:
          bouton.style === "souligne"
            ? "underline"
            : bouton.style === "barre"
            ? "line-through"
            : "none",
        // Le repli sur plusieurs lignes évite qu'un libellé long soit TRONQUÉ :
        // « Effacer règl… » sur 197 chapitres d'Excel n'enseignait rien.
        whiteSpace: "normal",
        wordBreak: "keep-all",
      }}
    >
      {bouton.glyphe ?? bouton.texte}
    </button>
  )
}

/**
 * « Insérer un tableau ».
 *
 * Univer en a une, native et déjà en français — mais elle n'apparaît que si l'on
 * garde sa chrome. La nôtre reste sous notre contrôle et émet l'argument
 * `LxC` que la surface transforme en commande.
 */
function BoiteTableau({
  lignes,
  colonnes,
  setLignes,
  setColonnes,
  onAnnuler,
  onValider,
}: {
  lignes: number
  colonnes: number
  setLignes: (n: number) => void
  setColonnes: (n: number) => void
  onAnnuler: () => void
  onValider: () => void
}) {
  const champ = (
    etiquette: string,
    valeur: number,
    poser: (n: number) => void,
    id: string,
  ) => (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
      <span style={{ minWidth: 130 }}>{etiquette}</span>
      <input
        type="number"
        min={1}
        max={20}
        value={valeur}
        data-control={id}
        onChange={(e) => poser(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
        // 16 px minimum : en dessous, iOS zoome sur le champ à la mise au point.
        style={{ width: 76, fontSize: 16, padding: "6px 8px", border: "1px solid #d8d4cd", borderRadius: 6 }}
      />
    </label>
  )
  return (
    <div
      role="dialog"
      aria-label="Insérer un tableau"
      style={{
        position: "absolute",
        left: "50%",
        top: 96,
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
        minWidth: 300,
      }}
    >
      <strong style={{ fontSize: 14 }}>Insérer un tableau</strong>
      {champ("Nombre de lignes", lignes, setLignes, "w-tableau-lignes")}
      {champ("Nombre de colonnes", colonnes, setColonnes, "w-tableau-colonnes")}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          data-control="w-tableau-annuler"
          onClick={onAnnuler}
          style={{ minHeight: 44, padding: "0 14px", borderRadius: 8, border: "1px solid #d8d4cd", background: "#fff", cursor: "pointer" }}
        >
          Annuler
        </button>
        <button
          type="button"
          data-control="w-tableau-ok"
          onClick={onValider}
          style={{ minHeight: 44, padding: "0 18px", borderRadius: 8, border: "none", background: "#1b5e3a", color: "#fff", cursor: "pointer", fontWeight: 600 }}
        >
          OK
        </button>
      </div>
    </div>
  )
}

/** Les identifiants réellement rendus — consommés par `check-controles`. */
export const CONTROLES_RENDUS: string[] = [
  ...Object.values(GROUPES)
    .flat()
    .flatMap((g) => g.boutons.map((b) => b.id)),
  "w-tableau-lignes",
  "w-tableau-colonnes",
  "w-tableau-annuler",
  "w-tableau-ok",
]
