"use client"

import * as React from "react"

/**
 * Les deux boîtes de dialogue du ruban, et le menu du bouton Format.
 *
 * POURQUOI CE FICHIER EXISTE
 * Le 31/07/2026, Samuel a filmé la petite flèche ▾ du groupe Cellules : la
 * démonstration affirmait qu'elle « ouvre la boîte de dialogue complète », il a
 * cliqué, rien ne s'est ouvert. Deux étapes plus tôt, la leçon fait cliquer le
 * bouton **fx** en annonçant « Une fenêtre d'assistant s'ouvre, avec la liste
 * des fonctions » — et rien ne s'ouvrait non plus. Ces deux boutons étaient
 * rendus, cliquables, et sans le moindre traitement.
 *
 * Plutôt que de retirer les boutons et de réécrire les leçons — les deux boîtes
 * font partie d'Excel et sont ce que la leçon enseigne —, on les construit. Au
 * minimum honnête : elles s'ouvrent, elles montrent ce qu'elles annoncent, et
 * ce qu'on y valide s'applique réellement à la feuille.
 *
 * Elles ne remplacent pas les 56 boîtes du modèle de référence : ce sont les
 * deux que le contenu existant promet.
 */

const ENCRE = "#171a18"
const BORD = "#E4E0D8"
const VERT = "#107C41"

/** Cadre commun : même mise en scène que les boîtes du poste de travail. */
function Cadre({
  titre,
  large,
  children,
  pied,
}: {
  titre: string
  large?: boolean
  children: React.ReactNode
  pied: React.ReactNode
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titre}
      className="absolute z-30 overflow-hidden rounded-xl bg-white"
      style={{
        left: "50%",
        top: "50%",
        width: large ? "min(460px, 92%)" : "min(360px, 90%)",
        transform: "translate(-50%,-50%)",
        boxShadow: "0 30px 70px -18px rgba(0,0,0,.55)",
        animation: "sim-boite-entree .2s cubic-bezier(.2,.9,.2,1) both",
      }}
    >
      <p className="border-b px-3 py-2 text-[11.5px] font-bold" style={{ background: "#F5F3EF", borderColor: BORD, color: ENCRE }}>
        {titre}
      </p>
      <div className="p-3">{children}</div>
      <div className="flex justify-end gap-2 border-t px-3 py-2" style={{ background: "#FAF9F7", borderColor: BORD }}>
        {pied}
      </div>
      <style>{`@keyframes sim-boite-entree{from{opacity:0;transform:translate(-50%,-46%) scale(.97)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}`}</style>
    </div>
  )
}

function BoutonPied({
  children,
  principal,
  control,
  onClick,
}: {
  children: React.ReactNode
  principal?: boolean
  control: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      data-control={control}
      onClick={onClick}
      className="rounded-lg px-3 py-1.5 text-[11.5px] font-semibold"
      style={
        principal
          ? { background: VERT, color: "#fff" }
          : { background: "#fff", color: ENCRE, border: `1px solid ${BORD}` }
      }
    >
      {children}
    </button>
  )
}

/* ── Insérer une fonction (bouton fx) ──────────────────────────────────────── */

/**
 * Les fonctions listées sont celles que la formation enseigne, dans l'ordre où
 * elle les rencontre. La liste n'a pas à être exhaustive : la leçon
 * `M01-L02-04` demande de reconnaître la fenêtre et sa liste, pas de composer
 * une fonction depuis l'assistant.
 */
const FONCTIONS: { nom: string; aide: string }[] = [
  { nom: "SOMME", aide: "Additionne les nombres d'une plage." },
  { nom: "MOYENNE", aide: "Renvoie la moyenne des nombres d'une plage." },
  { nom: "MIN", aide: "Renvoie le plus petit nombre d'une plage." },
  { nom: "MAX", aide: "Renvoie le plus grand nombre d'une plage." },
  { nom: "NB", aide: "Compte les cellules qui contiennent un nombre." },
  { nom: "NBVAL", aide: "Compte les cellules non vides, texte compris." },
  { nom: "SI", aide: "Renvoie une valeur si la condition est vraie, une autre sinon." },
  { nom: "RECHERCHEV", aide: "Cherche une valeur dans la première colonne d'un tableau." },
]

export function BoiteFonction({ onFermer, onInserer }: { onFermer: () => void; onInserer: (nom: string) => void }) {
  const [choisie, setChoisie] = React.useState(FONCTIONS[0].nom)
  const aide = FONCTIONS.find((f) => f.nom === choisie)?.aide ?? ""
  return (
    <Cadre
      titre="Insérer une fonction"
      pied={
        <>
          <BoutonPied control="fx-annuler" onClick={onFermer}>
            Annuler
          </BoutonPied>
          <BoutonPied control="fx-valider" principal onClick={() => onInserer(choisie)}>
            OK
          </BoutonPied>
        </>
      }
    >
      <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: "#8A8578" }}>
        Sélectionnez une fonction
      </p>
      <div
        className="mb-2 max-h-[168px] overflow-y-auto rounded-lg border"
        style={{ borderColor: BORD }}
        role="listbox"
        aria-label="Liste des fonctions"
      >
        {FONCTIONS.map((f) => (
          <button
            key={f.nom}
            type="button"
            role="option"
            aria-selected={f.nom === choisie}
            data-control={`fx-fonction-${f.nom.toLowerCase()}`}
            onClick={() => setChoisie(f.nom)}
            className="block w-full px-2.5 py-1.5 text-left text-[12px]"
            style={
              f.nom === choisie
                ? { background: "#E7F4EC", color: ENCRE, fontWeight: 600 }
                : { color: ENCRE }
            }
          >
            {f.nom}
          </button>
        ))}
      </div>
      <p className="text-[11px] leading-snug" style={{ color: "#6F6A5E" }}>
        <span className="font-semibold" style={{ color: ENCRE }}>
          {choisie}(…)
        </span>{" "}
        — {aide}
      </p>
    </Cadre>
  )
}

/* ── Format de cellule (flèche ▾ du groupe Cellules) ──────────────────────── */

export type ReglagesFormat = {
  nombre: "standard" | "nombre" | "monetaire" | "pourcentage" | "date"
  alignement: "gauche" | "centre" | "droite"
  gras: boolean
  italique: boolean
  souligne: boolean
  bordure: boolean
}

const ONGLETS_FORMAT: { id: string; libelle: string }[] = [
  { id: "nombre", libelle: "Nombre" },
  { id: "alignement", libelle: "Alignement" },
  { id: "police", libelle: "Police" },
  { id: "bordure", libelle: "Bordure" },
]

const CATEGORIES: { id: ReglagesFormat["nombre"]; libelle: string; exemple: string }[] = [
  { id: "standard", libelle: "Standard", exemple: "1234,5" },
  { id: "nombre", libelle: "Nombre", exemple: "1 234,50" },
  { id: "monetaire", libelle: "Monétaire", exemple: "1 234,50 €" },
  { id: "pourcentage", libelle: "Pourcentage", exemple: "12,50 %" },
  { id: "date", libelle: "Date", exemple: "31/07/2026" },
]

export function BoiteFormatCellule({
  cellule,
  onFermer,
  onAppliquer,
}: {
  cellule: string
  onFermer: () => void
  onAppliquer: (r: ReglagesFormat) => void
}) {
  const [onglet, setOnglet] = React.useState("nombre")
  const [r, setR] = React.useState<ReglagesFormat>({
    nombre: "standard",
    alignement: "gauche",
    gras: false,
    italique: false,
    souligne: false,
    bordure: false,
  })
  const maj = (p: Partial<ReglagesFormat>) => setR((v) => ({ ...v, ...p }))

  const Choix = ({ actif, control, children, onClick }: { actif: boolean; control: string; children: React.ReactNode; onClick: () => void }) => (
    <button
      type="button"
      data-control={control}
      aria-pressed={actif}
      onClick={onClick}
      className="rounded-md px-2.5 py-1 text-[11.5px]"
      style={actif ? { background: "#E7F4EC", color: ENCRE, fontWeight: 700, border: `1px solid ${VERT}` } : { color: ENCRE, border: `1px solid ${BORD}` }}
    >
      {children}
    </button>
  )

  return (
    <Cadre
      titre="Format de cellule"
      large
      pied={
        <>
          <BoutonPied control="fmt-annuler" onClick={onFermer}>
            Annuler
          </BoutonPied>
          <BoutonPied control="fmt-valider" principal onClick={() => onAppliquer(r)}>
            OK
          </BoutonPied>
        </>
      }
    >
      <p className="mb-2 text-[10.5px]" style={{ color: "#8A8578" }}>
        Cellule sélectionnée : <span className="font-semibold">{cellule || "—"}</span>
      </p>
      <div className="mb-2.5 flex gap-1 border-b" style={{ borderColor: BORD }}>
        {ONGLETS_FORMAT.map((o) => (
          <button
            key={o.id}
            type="button"
            data-control={`fmt-onglet-${o.id}`}
            aria-pressed={onglet === o.id}
            onClick={() => setOnglet(o.id)}
            className="rounded-t-md px-2.5 py-1 text-[11.5px]"
            style={
              onglet === o.id
                ? { background: "#fff", border: `1px solid ${BORD}`, borderBottomColor: "#fff", marginBottom: -1, fontWeight: 700, color: ENCRE }
                : { color: "#6F6A5E" }
            }
          >
            {o.libelle}
          </button>
        ))}
      </div>

      <div className="min-h-[112px]">
        {onglet === "nombre" && (
          <div className="flex flex-col gap-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                data-control={`fmt-nombre-${c.id}`}
                aria-pressed={r.nombre === c.id}
                onClick={() => maj({ nombre: c.id })}
                className="flex items-center justify-between rounded-md px-2.5 py-1 text-[11.5px]"
                style={r.nombre === c.id ? { background: "#E7F4EC", fontWeight: 600, color: ENCRE } : { color: ENCRE }}
              >
                <span>{c.libelle}</span>
                <span style={{ color: "#8A8578" }}>{c.exemple}</span>
              </button>
            ))}
          </div>
        )}
        {onglet === "alignement" && (
          <div className="flex gap-1.5">
            <Choix actif={r.alignement === "gauche"} control="fmt-align-gauche" onClick={() => maj({ alignement: "gauche" })}>
              Gauche
            </Choix>
            <Choix actif={r.alignement === "centre"} control="fmt-align-centre" onClick={() => maj({ alignement: "centre" })}>
              Centré
            </Choix>
            <Choix actif={r.alignement === "droite"} control="fmt-align-droite" onClick={() => maj({ alignement: "droite" })}>
              Droite
            </Choix>
          </div>
        )}
        {onglet === "police" && (
          <div className="flex gap-1.5">
            <Choix actif={r.gras} control="fmt-police-gras" onClick={() => maj({ gras: !r.gras })}>
              <span className="font-bold">G</span> Gras
            </Choix>
            <Choix actif={r.italique} control="fmt-police-italique" onClick={() => maj({ italique: !r.italique })}>
              <span className="italic">I</span> Italique
            </Choix>
            <Choix actif={r.souligne} control="fmt-police-souligne" onClick={() => maj({ souligne: !r.souligne })}>
              <span className="underline">S</span> Souligné
            </Choix>
          </div>
        )}
        {onglet === "bordure" && (
          <div className="flex gap-1.5">
            <Choix actif={r.bordure} control="fmt-bordure-contour" onClick={() => maj({ bordure: !r.bordure })}>
              Contour
            </Choix>
            <Choix actif={!r.bordure} control="fmt-bordure-aucune" onClick={() => maj({ bordure: false })}>
              Aucune
            </Choix>
          </div>
        )}
      </div>
    </Cadre>
  )
}
