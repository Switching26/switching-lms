"use client"

/**
 * Habillage des macros : la boîte « Enregistrer une macro », le témoin
 * d'enregistrement de la barre d'état, la boîte « Macro » et l'éditeur de code.
 *
 * Purement présentationnel, comme SimulationChrome : ce composant ne connaît ni
 * le scénario, ni la validation, ni Univer. Il remonte des intentions
 * (« démarre », « exécute Pied_de_tableau », « voici le nouveau code ») et le
 * simulateur décide. Le seul état local est celui des boîtes de dialogue et de
 * leurs champs — de l'état d'affichage, pas de l'état du classeur.
 *
 * L'éditeur affiche une coloration syntaxique faite à la main plutôt qu'une
 * dépendance : quatre catégories de jetons suffisent pour que du VBA se lise, et
 * une bibliothèque de coloration pèserait plus lourd que tout le module.
 *
 * Convention d'identifiants : `mac-*` (voir types.ts). Chaque contrôle porte un
 * `data-control` pour être pilotable en test, y compris les champs de saisie.
 */

import { useEffect, useState } from "react"
import type { MacroState } from "@/lib/simulation/types"
import {
  EMPLACEMENTS,
  normaliserRaccourci,
  raccourciEnConflit,
  validerNomMacro,
  type EmplacementMacro,
  type OptionsMacro,
} from "@/lib/simulation/macro"

type Props = {
  macros: MacroState[]
  /** Macro dont le code est affiché. */
  courante: string | null
  enregistrement: "started" | "stopped"
  /** Code VBA de la macro courante, tel que le modèle l'a produit. */
  code: string
  onDemarrer: (nom: string, options: OptionsMacro) => void
  onArreter: () => void
  onChangerCode: (code: string) => void
  onExecuter: (nom: string) => void
  onRaccourci: (nom: string, raccourci: string) => void
  /**
   * Facultatif : sans lui, le bouton Supprimer de la boîte « Macro » reste
   * visible mais inactif. Un bouton qui ne fait rien serait pire.
   */
  onSupprimer?: (nom: string) => void
  /**
   * Commande équivalente déclenchée DEPUIS LE RUBAN (onglet Développeur). Le
   * ruban d'Excel et ce panneau proposent les mêmes gestes ; sans ce relais,
   * « Références relatives » aurait deux vérités — la case cochée au ruban et
   * décochée ici — et l'apprenant enregistrerait en absolu en croyant le
   * contraire. `nonce` doit changer à chaque clic pour qu'un même bouton pressé
   * deux fois agisse deux fois.
   */
  commande?: { nonce: number; controle: string }
}

/* ═══════════ COLORATION ═══════════ */

type Genre = "code" | "cle" | "chaine" | "commentaire" | "nombre"
type Jeton = { texte: string; genre: Genre }

/** Mots que l'éditeur met en évidence : ceux qui structurent une macro. */
const MOTS_CLES = new Set([
  "sub",
  "end",
  "true",
  "false",
  "with",
  "range",
  "selection",
  "activecell",
  "offset",
  "rgb",
  "select",
])

/** Découpe une ligne de VBA. L'ordre compte : le commentaire gagne sur tout. */
function decouper(ligne: string): Jeton[] {
  const jetons: Jeton[] = []
  let i = 0
  let courant = ""
  const vider = () => {
    if (courant) {
      jetons.push({ texte: courant, genre: "code" })
      courant = ""
    }
  }

  while (i < ligne.length) {
    const c = ligne[i]

    if (c === "'") {
      vider()
      jetons.push({ texte: ligne.slice(i), genre: "commentaire" })
      return jetons
    }

    if (c === '"') {
      vider()
      let texte = '"'
      i++
      while (i < ligne.length) {
        texte += ligne[i]
        if (ligne[i] === '"') {
          // Guillemet doublé : on reste dans la chaîne, comme VBA.
          if (ligne[i + 1] === '"') {
            texte += '"'
            i += 2
            continue
          }
          i++
          break
        }
        i++
      }
      jetons.push({ texte, genre: "chaine" })
      continue
    }

    if (/[A-Za-z_]/.test(c)) {
      vider()
      let mot = ""
      while (i < ligne.length && /[A-Za-z0-9_]/.test(ligne[i])) {
        mot += ligne[i]
        i++
      }
      jetons.push({ texte: mot, genre: MOTS_CLES.has(mot.toLowerCase()) ? "cle" : "code" })
      continue
    }

    if (/[0-9]/.test(c)) {
      vider()
      let nombre = ""
      while (i < ligne.length && /[0-9.]/.test(ligne[i])) {
        nombre += ligne[i]
        i++
      }
      jetons.push({ texte: nombre, genre: "nombre" })
      continue
    }

    courant += c
    i++
  }
  vider()
  return jetons
}

const COULEURS: Record<Genre, string> = {
  code: "text-neutral-800",
  cle: "text-blue-700",
  chaine: "text-rose-700",
  commentaire: "text-emerald-700",
  nombre: "text-violet-700",
}

/* ═══════════ COMPOSANT ═══════════ */

export default function MacroPanel({
  macros,
  courante,
  enregistrement,
  code,
  onDemarrer,
  onArreter,
  onChangerCode,
  onExecuter,
  onRaccourci,
  onSupprimer,
  commande,
}: Props) {
  const [dialogue, setDialogue] = useState<"enregistrer" | "options" | null>(null)
  const [editeurOuvert, setEditeurOuvert] = useState(false)
  const [choix, setChoix] = useState<string | null>(null)
  const [relatif, setRelatif] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // Champs de la boîte de dialogue.
  const [nom, setNom] = useState("")
  const [raccourci, setRaccourci] = useState("")
  const [emplacement, setEmplacement] = useState<EmplacementMacro>("classeur")
  const [description, setDescription] = useState("")

  const enCours = enregistrement === "started"
  const macroChoisie = macros.find((m) => m.name === (choix ?? courante)) ?? macros[0] ?? null

  const ouvrirEnregistrer = () => {
    // Excel propose Macro1, Macro2… : un nom valide d'emblée, que l'apprenant
    // remplace. Sans proposition, la boîte s'ouvre sur une erreur en puissance.
    setNom(`Macro${macros.length + 1}`)
    setRaccourci("")
    setEmplacement("classeur")
    setDescription("")
    setErreur(null)
    setDialogue("enregistrer")
  }

  // Relais du ruban. On ne réagit qu'au `nonce` : réagir à `controle` laisserait
  // un même bouton pressé deux fois de suite sans effet la seconde fois.
  useEffect(() => {
    if (!commande) return
    if (commande.controle === "dev-enregistrer-macro" && !enCours) ouvrirEnregistrer()
    if (commande.controle === "dev-references-relatives" && !enCours) setRelatif((r) => !r)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commande?.nonce])

  const validerEnregistrer = () => {
    const messageNom = validerNomMacro(nom)
    if (messageNom) {
      setErreur(messageNom)
      return
    }
    if (macros.some((m) => m.name.toLocaleLowerCase("fr-FR") === nom.trim().toLocaleLowerCase("fr-FR"))) {
      setErreur(`Une macro nommée « ${nom.trim()} » existe déjà dans ce classeur. Choisissez un autre nom.`)
      return
    }
    if (raccourci.trim()) {
      const conflit = raccourciEnConflit(raccourci, macros)
      if (conflit) {
        setErreur(conflit)
        return
      }
    }
    setErreur(null)
    setDialogue(null)
    onDemarrer(nom.trim(), {
      ...(raccourci.trim() ? { shortcut: raccourci.trim() } : {}),
      ...(relatif ? { relative: true } : {}),
      emplacement,
      ...(description.trim() ? { description: description.trim() } : {}),
    })
  }

  const ouvrirOptions = () => {
    if (!macroChoisie) return
    setRaccourci(macroChoisie.shortcut ?? "")
    setErreur(null)
    setDialogue("options")
  }

  const validerOptions = () => {
    if (!macroChoisie) return
    const conflit = raccourciEnConflit(raccourci, macros, macroChoisie.name)
    if (conflit) {
      setErreur(conflit)
      return
    }
    setErreur(null)
    setDialogue(null)
    onRaccourci(macroChoisie.name, normaliserRaccourci(raccourci) ?? raccourci)
  }

  const lignes = code.length > 0 ? code.split("\n") : [""]

  return (
    <div className="w-full max-w-full space-y-2 text-[12px] text-neutral-800">
      {/* Groupe « Code » de l'onglet Développeur. Les boutons du ruban peuvent
          exister en parallèle ; ceux-ci rendent le module jouable tel quel. */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2 py-1.5">
        <span className="mr-1 text-[9.5px] uppercase tracking-wide text-neutral-500">Macros</span>
        {enCours ? (
          <BoutonPanel id="mac-arreter" onClick={onArreter} accent>
            <CarreArret /> Arrêter l'enregistrement
          </BoutonPanel>
        ) : (
          <BoutonPanel id="mac-enregistrer" onClick={ouvrirEnregistrer}>
            <PointRouge /> Enregistrer une macro…
          </BoutonPanel>
        )}
        <label
          data-control="mac-relatif"
          className={[
            "flex items-center gap-1.5 rounded px-2 py-1",
            relatif ? "bg-emerald-100 ring-1 ring-emerald-300" : "hover:bg-emerald-50",
            enCours ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          ].join(" ")}
        >
          <input
            type="checkbox"
            className="h-3 w-3 accent-emerald-700"
            checked={relatif}
            disabled={enCours}
            onChange={(e) => setRelatif(e.target.checked)}
          />
          Références relatives
        </label>
      </div>

      {/* Témoin de la barre d'état : dans Excel, le petit carré est le seul
          rappel visible que tout ce qu'on fait part dans la macro. */}
      {enCours && (
        <div
          data-control="mac-temoin"
          aria-live="polite"
          className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5"
        >
          <span className="flex items-center gap-2 text-red-800">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
            </span>
            Enregistrement en cours — chaque geste est transcrit
          </span>
          <button
            type="button"
            data-control="mac-arreter-barre"
            aria-label="Arrêter l'enregistrement"
            title="Arrêter l'enregistrement"
            onClick={onArreter}
            className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border border-red-300 bg-white hover:bg-red-100"
          >
            <span className="h-2 w-2 bg-red-700" />
          </button>
        </div>
      )}

      {/* Boîte « Macro » */}
      <div data-control="mac-boite" className="rounded-lg border border-neutral-300 bg-white">
        <div className="border-b border-neutral-200 px-2.5 py-1 text-[9.5px] uppercase tracking-wide text-neutral-500">
          Macro
        </div>
        {macros.length === 0 ? (
          <p className="px-2.5 py-3 text-neutral-500">
            Aucune macro dans ce classeur — commencez par <b className="font-medium">Enregistrer une macro…</b>
          </p>
        ) : (
          <ul className="max-h-28 overflow-y-auto py-1">
            {macros.map((m) => {
              const actif = macroChoisie?.name === m.name
              return (
                <li key={m.name}>
                  <button
                    type="button"
                    data-control={`mac-choix-${m.name}`}
                    onClick={() => setChoix(m.name)}
                    className={[
                      "flex w-full items-center justify-between gap-2 px-2.5 py-1 text-left",
                      actif ? "bg-emerald-100 text-emerald-900" : "hover:bg-neutral-50",
                    ].join(" ")}
                  >
                    <span className="truncate font-mono">{m.name}</span>
                    <span className="flex-shrink-0 text-[10.5px] text-neutral-500">
                      {m.shortcut ?? "—"}
                      {m.relative ? " · relatif" : ""}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <div className="flex flex-wrap gap-1.5 border-t border-neutral-200 px-2 py-1.5">
          <BoutonPanel
            id="mac-executer"
            onClick={() => macroChoisie && onExecuter(macroChoisie.name)}
            disabled={!macroChoisie || enCours}
            accent
          >
            Exécuter
          </BoutonPanel>
          <BoutonPanel
            id="mac-modifier"
            onClick={() => setEditeurOuvert(true)}
            disabled={!macroChoisie || enCours}
          >
            Modifier
          </BoutonPanel>
          <BoutonPanel id="mac-options" onClick={ouvrirOptions} disabled={!macroChoisie || enCours}>
            Options…
          </BoutonPanel>
          <BoutonPanel
            id="mac-supprimer"
            onClick={() => macroChoisie && onSupprimer?.(macroChoisie.name)}
            disabled={!macroChoisie || enCours || !onSupprimer}
            titre={onSupprimer ? undefined : "La suppression n'est pas active dans cette étape."}
          >
            Supprimer
          </BoutonPanel>
        </div>
      </div>

      {/* Éditeur de code */}
      {editeurOuvert && macroChoisie && (
        <div className="overflow-hidden rounded-lg border border-neutral-300 bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-2.5 py-1">
            <span className="truncate text-[10.5px] text-neutral-600">
              Module1 — <span className="font-mono">{macroChoisie.name}</span>
            </span>
            <button
              type="button"
              data-control="mac-editeur-fermer"
              aria-label="Fermer l'éditeur"
              title="Fermer"
              onClick={() => setEditeurOuvert(false)}
              className="rounded px-1.5 text-[12px] text-neutral-500 hover:bg-neutral-200"
            >
              ✕
            </button>
          </div>

          {/* Un seul conteneur défile : la page ne bouge jamais latéralement,
              même à 390 px de large. Le <pre> donne sa taille au bloc et le
              <textarea> se superpose exactement dessus — mêmes police, mêmes
              marges, même interligne, sinon le curseur dériverait du texte. */}
          <div
            data-control="mac-editeur"
            className="max-h-64 overflow-auto bg-white font-mono text-[12px] leading-[18px]"
          >
            <div className="flex min-w-max">
              <div
                aria-hidden
                className="sticky left-0 z-10 flex-shrink-0 select-none border-r border-neutral-200 bg-neutral-50 px-2 py-2 text-right text-neutral-400"
              >
                {lignes.map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              <div className="relative flex-1">
                <pre aria-hidden className="whitespace-pre px-3 py-2">
                  {lignes.map((ligne, i) => (
                    <span key={i}>
                      {decouper(ligne).map((j, k) => (
                        <span key={k} className={COULEURS[j.genre]}>
                          {j.texte}
                        </span>
                      ))}
                      {i < lignes.length - 1 ? "\n" : ""}
                    </span>
                  ))}
                </pre>
                <textarea
                  data-control="mac-code"
                  aria-label="Code de la macro"
                  value={code}
                  onChange={(e) => onChangerCode(e.target.value)}
                  spellCheck={false}
                  wrap="off"
                  className="absolute inset-0 h-full w-full resize-none overflow-hidden whitespace-pre bg-transparent px-3 py-2 font-mono text-[12px] leading-[18px] text-transparent caret-neutral-900 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-t border-neutral-200 bg-neutral-50 px-2 py-1.5">
            <BoutonPanel id="mac-executer-code" onClick={() => onExecuter(macroChoisie.name)} accent>
              Exécuter
            </BoutonPanel>
            <span className="text-[10.5px] text-neutral-500">
              Modifiez le code, puis exécutez : le résultat apparaît dans la feuille.
            </span>
          </div>
        </div>
      )}

      {/* Boîte « Enregistrer une macro » */}
      {dialogue === "enregistrer" && (
        <Boite titre="Enregistrer une macro" onFermer={() => setDialogue(null)}>
          <Champ label="Nom de la macro :">
            <input
              data-control="mac-dialogue-nom"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className="w-full rounded border border-neutral-300 px-2 py-1 font-mono outline-none focus:border-emerald-500"
            />
          </Champ>
          <Champ label="Touche de raccourci :">
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-600">Ctrl+</span>
              <input
                data-control="mac-dialogue-raccourci"
                value={raccourci}
                maxLength={12}
                placeholder="T"
                onChange={(e) => setRaccourci(e.target.value)}
                className="w-20 rounded border border-neutral-300 px-2 py-1 text-center font-mono outline-none focus:border-emerald-500"
              />
              <span className="text-[10.5px] text-neutral-500">
                une majuscule ajoute Maj : {normaliserRaccourci(raccourci) ?? "—"}
              </span>
            </div>
          </Champ>
          <Champ label="Enregistrer la macro dans :">
            <select
              data-control="mac-dialogue-emplacement"
              value={emplacement}
              onChange={(e) => setEmplacement(e.target.value as EmplacementMacro)}
              className="w-full rounded border border-neutral-300 bg-white px-2 py-1 outline-none focus:border-emerald-500"
            >
              {EMPLACEMENTS.map((e) => (
                <option key={e.valeur} value={e.valeur}>
                  {e.libelle}
                </option>
              ))}
            </select>
          </Champ>
          <Champ label="Description :">
            <textarea
              data-control="mac-dialogue-description"
              value={description}
              rows={2}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full resize-none rounded border border-neutral-300 px-2 py-1 outline-none focus:border-emerald-500"
            />
          </Champ>
          {erreur && <Erreur message={erreur} />}
          <Actions>
            <BoutonPanel id="mac-dialogue-ok" onClick={validerEnregistrer} accent>
              OK
            </BoutonPanel>
            <BoutonPanel id="mac-dialogue-annuler" onClick={() => setDialogue(null)}>
              Annuler
            </BoutonPanel>
          </Actions>
        </Boite>
      )}

      {/* Boîte « Options de macro » */}
      {dialogue === "options" && macroChoisie && (
        <Boite titre="Options de macro" onFermer={() => setDialogue(null)}>
          <p className="text-neutral-600">
            Nom de la macro : <span className="font-mono text-neutral-900">{macroChoisie.name}</span>
          </p>
          <Champ label="Touche de raccourci :">
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-600">Ctrl+</span>
              <input
                data-control="mac-options-raccourci"
                value={raccourci}
                maxLength={12}
                onChange={(e) => setRaccourci(e.target.value)}
                className="w-20 rounded border border-neutral-300 px-2 py-1 text-center font-mono outline-none focus:border-emerald-500"
              />
              <span className="text-[10.5px] text-neutral-500">{normaliserRaccourci(raccourci) ?? "—"}</span>
            </div>
          </Champ>
          {erreur && <Erreur message={erreur} />}
          <Actions>
            <BoutonPanel id="mac-options-ok" onClick={validerOptions} accent>
              OK
            </BoutonPanel>
            <BoutonPanel id="mac-options-annuler" onClick={() => setDialogue(null)}>
              Annuler
            </BoutonPanel>
          </Actions>
        </Boite>
      )}
    </div>
  )
}

/* ═══════════ PETITS ÉLÉMENTS ═══════════ */

function BoutonPanel({
  id,
  children,
  onClick,
  disabled,
  accent,
  titre,
}: {
  id: string
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  accent?: boolean
  titre?: string
}) {
  return (
    <button
      type="button"
      data-control={id}
      disabled={disabled}
      title={titre}
      onClick={onClick}
      className={[
        "flex items-center gap-1.5 rounded px-2 py-1 transition-colors",
        disabled
          ? "cursor-not-allowed text-neutral-400"
          : accent
            ? "bg-emerald-700 text-white hover:bg-emerald-800"
            : "border border-neutral-300 text-neutral-700 hover:bg-emerald-50",
      ].join(" ")}
    >
      {children}
    </button>
  )
}

/**
 * Les boîtes sont posées DANS le flux du panneau plutôt qu'en fenêtre flottante.
 * À 390 px, une modale qui recouvre la feuille empêche de voir ce que la macro
 * fait — or c'est tout l'enjeu de la leçon.
 */
function Boite({
  titre,
  children,
  onFermer,
}: {
  titre: string
  children: React.ReactNode
  onFermer: () => void
}) {
  return (
    <div
      role="dialog"
      aria-label={titre}
      className="space-y-2 rounded-lg border border-neutral-400 bg-neutral-50 p-2.5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 pb-1">
        <span className="font-medium text-neutral-800">{titre}</span>
        <button
          type="button"
          aria-label="Fermer"
          onClick={onFermer}
          className="rounded px-1.5 text-[12px] text-neutral-500 hover:bg-neutral-200"
        >
          ✕
        </button>
      </div>
      {children}
    </div>
  )
}

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-[10.5px] text-neutral-600">{label}</span>
      {children}
    </label>
  )
}

function Erreur({ message }: { message: string }) {
  return (
    <p
      data-control="mac-dialogue-erreur"
      role="alert"
      className="rounded border border-red-300 bg-red-50 px-2 py-1.5 text-red-800"
    >
      {message}
    </p>
  )
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-1.5 pt-0.5">{children}</div>
}

const PointRouge = () => <span aria-hidden className="h-2 w-2 flex-shrink-0 rounded-full bg-red-600" />
const CarreArret = () => <span aria-hidden className="h-2 w-2 flex-shrink-0 bg-white" />
