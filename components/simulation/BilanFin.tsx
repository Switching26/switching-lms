"use client"

/**
 * Écran de fin d'une ÉVALUATION notée : la note du passage, puis le parcours de
 * révision.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TROIS ÉCRANS, UN SEUL COMPOSANT
 *
 *  • **bilan disponible** — note, compétences acquises en pastilles, au plus
 *    trois priorités avec leurs renvois, les notions « presque tenues » repliées,
 *    la phrase anti-corrigé, puis les actions ;
 *  • **100 %** — rond vert, toutes les compétences en pastilles, AUCUN bloc de
 *    révision : féliciter puis conseiller une révision serait absurde ;
 *  • **repli** — un seul écran pour les trois fermetures (module pas encore
 *    annoté, annotation incomplète, journal invérifiable). La note reste,
 *    aucun conseil n'est donné, et on le dit.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST JAMAIS AFFICHÉ
 *
 * Aucune valeur attendue, aucune formule, aucune cellule. Le bilan ne porte que
 * des intitulés de capacité écrits par l'auteur du contenu et des RANGS de
 * question. C'est ce qui permet de repasser l'évaluation sans que la note perde
 * son sens, et la carte le dit à l'apprenant en toutes lettres.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * MISE EN PAGE
 *
 * L'atelier est un portail `position: fixed` en `overflow: hidden` : la zone de
 * fin porte donc SON PROPRE `overflow-y`. Sans cela, une carte à trois priorités
 * est coupée en bas sur 390 × 844 — c'est le seul vrai risque de mise en page de
 * cet écran. Cibles tactiles ≥ 44 px, boutons empilés sous 560 px.
 */

import type { BilanPublie, LignePubliee } from "@/lib/simulation/bilan"

/* ═════════════════════════════ PETITES PIÈCES ═════════════════════════════ */

function IconeCheck({ taille = 12, epaisseur = 3 }: { taille?: number; epaisseur?: number }) {
  return (
    <svg aria-hidden width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={epaisseur} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto" }}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function IconeLecon() {
  return (
    <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto" }}>
      <path d="M4 19.5V6a2 2 0 012-2h13v16H6a2 2 0 00-2 1.5z" />
      <path d="M8 8h7M8 12h7" />
    </svg>
  )
}

function IconeInfo() {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto", marginTop: 1 }}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  )
}

function IconeEtoile() {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto" }}>
      <path d="M12 2l3 6.5 7 .9-5 4.8 1.2 7-6.2-3.3L5.8 21 7 14.2 2 9.4l7-.9z" />
    </svg>
  )
}

/** Couleur de la note : les mêmes seuils que « Mes résultats ». */
function tonDeLaNote(pct: number): string {
  return pct >= 80 ? "#107C41" : pct >= 50 ? "#B45309" : "#BE123C"
}

const ETIQUETTES = {
  "a-revoir": { texte: "à revoir", fond: "#FFE4E6", encre: "#BE123C" },
  fragile: { texte: "fragile", fond: "#FBF1DF", encre: "#B45309" },
  acquis: { texte: "acquis", fond: "#E7F3EB", encre: "#107C41" },
} as const

function BlocTitre({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="uppercase"
      style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".09em", color: "#9A9186", margin: "22px 0 10px" }}
    >
      {children}
    </p>
  )
}

/**
 * Une ligne de question manquée, formulée avec soin.
 *
 * Une question PASSÉE n'est jamais dite « ratée » : l'apprenant a choisi de la
 * sauter, elle compte comme non réussie, et le mot doit le dire sans jugement.
 */
function phraseDesQuestions(ligne: LignePubliee): string | null {
  const morceaux: string[] = []
  const liste = (rangs: number[]) =>
    rangs.length === 1 ? `question ${rangs[0]}` : `questions ${rangs.slice(0, -1).join(", ")} et ${rangs[rangs.length - 1]}`
  if (ligne.etapesRatees.length) morceaux.push(`${liste(ligne.etapesRatees)} manquée${ligne.etapesRatees.length > 1 ? "s" : ""}`)
  if (ligne.etapesNonTraitees.length) {
    morceaux.push(
      `${liste(ligne.etapesNonTraitees)} passée${ligne.etapesNonTraitees.length > 1 ? "s" : ""}, comptée${
        ligne.etapesNonTraitees.length > 1 ? "s" : ""
      } comme non réussie${ligne.etapesNonTraitees.length > 1 ? "s" : ""}`,
    )
  }
  return morceaux.length ? morceaux.join(" · ") : null
}

function Renvois({ ligne, onNaviguer }: { ligne: LignePubliee; onNaviguer?: (chapterId: string) => void }) {
  if (!ligne.revoir.length) return null
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {ligne.revoir.map((r) => (
        <button
          key={r.chapterId}
          type="button"
          data-control="sim-bilan-renvoi"
          onClick={() => onNaviguer?.(r.chapterId)}
          disabled={!onNaviguer}
          className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 text-left text-[12.5px] font-semibold"
          // 44 px : c'est une cible tactile, pas un lien de bas de page.
          style={{ minHeight: 44, borderColor: "#C7D2FE", color: "#4338CA", lineHeight: 1.3 }}
        >
          <IconeLecon />
          <span className="min-w-0">{r.titre}</span>
        </button>
      ))}
    </div>
  )
}

function Priorite({ ligne, rang, onNaviguer }: { ligne: LignePubliee; rang: number; onNaviguer?: (id: string) => void }) {
  const etiquette = ETIQUETTES[ligne.statut]
  const part = ligne.pointsTotal > 0 ? Math.round((ligne.pointsObtenus / ligne.pointsTotal) * 100) : 0
  const questions = phraseDesQuestions(ligne)
  return (
    <div className="mb-2.5 rounded-xl border border-border p-3.5">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className="flex flex-shrink-0 items-center justify-center rounded-lg text-white"
          style={{ width: 22, height: 22, background: "#10201B", fontSize: 11, fontWeight: 700 }}
        >
          {rang}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-bold leading-snug text-ink">{ligne.titre}</p>
          {ligne.enonce && <p className="mt-1.5 text-[12px] leading-relaxed text-warm-500">{ligne.enonce}</p>}
        </div>
        <span
          className="flex-shrink-0 rounded-full uppercase"
          style={{ background: etiquette.fond, color: etiquette.encre, fontSize: 10.5, fontWeight: 800, padding: "3px 8px", letterSpacing: ".04em", whiteSpace: "nowrap" }}
        >
          {etiquette.texte}
        </span>
      </div>
      <div
        role="img"
        aria-label={`${ligne.pointsObtenus} point${ligne.pointsObtenus > 1 ? "s" : ""} sur ${ligne.pointsTotal}`}
        className="my-2.5 overflow-hidden rounded-full"
        style={{ height: 6, background: "#EFEAE1" }}
      >
        <span style={{ display: "block", height: "100%", borderRadius: 99, width: `${part}%`, background: ligne.statut === "fragile" ? "#D97706" : "#BE123C" }} />
      </div>
      <p className="text-[11.5px] tabular-nums text-warm-500">
        {ligne.pointsObtenus} point{ligne.pointsObtenus > 1 ? "s" : ""} sur {ligne.pointsTotal}
        {questions ? ` · ${questions}` : ""}
      </p>
      <Renvois ligne={ligne} onNaviguer={onNaviguer} />
    </div>
  )
}

/* ═══════════════════════════════ LA CARTE ═════════════════════════════════ */

export type ProprietesBilanFin = {
  /** Titre du chapitre, tel que le cockpit l'affiche. */
  filChapitre: string
  /**
   * Note DE CE PASSAGE, 0..1 — celle du SERVEUR, ou `null` tant qu'elle n'est
   * pas revenue. L'atelier ne l'estime plus lui-même : son estimation locale
   * pouvait différer de la note enregistrée, et afficher un chiffre que
   * « Mes résultats » contredirait serait pire que d'attendre.
   */
  notePassage: number | null
  /** Nombre de gestes évalués dans ce scénario. */
  gestesEvalues: number
  /** Meilleure note antérieure, ou null pour un premier passage. */
  scorePrecedent: number | null
  /**
   * Le serveur a-t-il enregistré cette note ?
   *
   * Il refuse de le faire quand le journal du passage ne couvre pas toutes les
   * étapes notées — envoi interrompu, scénario réécrit en cours de route. La
   * carte doit alors le DIRE : annoncer « cette note est enregistrée » serait
   * faux, et l'apprenant s'en apercevrait seul, dans « Mes résultats ».
   */
  noteEnregistree?: boolean
  /**
   * Réessayer l'enregistrement du passage, sans le rejouer.
   *
   * La clôture est idempotente côté serveur : reclore le même passage rend la
   * même note. Sans ce bouton, un envoi tombé laissait l'apprenant devant une
   * note perdue avec, pour seule issue, « Repasser l'évaluation » — refaire
   * quinze questions pour une requête qui n'était pas passée.
   */
  onReessayer?: () => void
  reessaiEnCours?: boolean
  /** Bilan renvoyé par le PUT, ou null tant qu'il n'est pas revenu / s'il est fermé. */
  bilan: BilanPublie | null
  /** Le bilan est encore en route : on n'affiche pas le repli trop vite. */
  enAttente?: boolean
  chapitreSuivant?: { id: string; titre: string } | null
  onNaviguer?: (chapterId: string) => void
  /** Repasser l'évaluation : remonte au parent, qui remonte l'atelier. */
  onRepasser?: () => void
}

export default function BilanFin({
  filChapitre,
  notePassage,
  gestesEvalues,
  scorePrecedent,
  bilan,
  noteEnregistree = true,
  onReessayer,
  reessaiEnCours,
  enAttente,
  chapitreSuivant,
  onNaviguer,
  onRepasser,
}: ProprietesBilanFin) {
  const pct = notePassage == null ? null : Math.round(notePassage * 100)
  const parfait = notePassage != null && notePassage >= 1
  // Le bilan n'ouvre le parcours de révision que s'il est exploitable : journal
  // vérifié ET couverture complète. Sinon on retombe sur la note seule.
  const utilisable = !!bilan?.exploitable
  const acquises = utilisable ? bilan!.competences.filter((c) => c.statut === "acquis") : []
  const priorites = utilisable ? bilan!.priorites : []
  // Les notions « presque tenues » ne sont pas des priorités : elles ne doivent
  // pas occuper la place des vraies, d'où le repli.
  const fragiles = utilisable
    ? bilan!.competences.filter((c) => c.statut === "fragile" && !priorites.some((p) => p.id === c.id))
    : []
  const premiere = priorites[0]

  const phraseMeilleure = notePassage == null
    ? "Votre note est en cours d'enregistrement."
    : !noteEnregistree
    /* Le texte disait « Repassez l'évaluation » — or le bouton juste en dessous
     * ne repasse rien : il RÉESSAIE l'enregistrement du MÊME passage, dont la
     * note est déjà calculée et conservée côté serveur. Envoyer l'apprenant
     * refaire quinze questions pour un enregistrement qui n'a pas abouti serait
     * une punition pour une panne de réseau. */
    ? "Ce passage n'a pas encore pu être enregistré : sa note n'apparaît pas dans « Mes résultats ». Réessayez l'enregistrement ci-dessous : vous n'avez pas besoin de refaire l'évaluation."
    : scorePrecedent == null
      ? "Cette note est enregistrée dans « Mes résultats ». Si vous repassez l'évaluation, seule votre meilleure note sera conservée."
      : notePassage > scorePrecedent
        ? `Nouvelle meilleure note : ${pct} %. Elle remplace votre précédente meilleure note dans « Mes résultats ».`
        : `Votre meilleure note reste ${Math.round(scorePrecedent * 100)} %. Seule la meilleure note est conservée dans « Mes résultats ».`

  return (
    <div
      // ⚠️ CETTE ZONE DÉFILE. L'atelier est un portail `fixed` en `overflow:
      // hidden` : sans `overflow-y` ici, une carte à trois priorités est coupée
      // sur 390 × 844, et l'apprenant ne voit ni la phrase anti-corrigé ni les
      // actions.
      data-zone="sim-fin"
      className="flex min-h-0 flex-1 justify-start overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-5 sm:py-8"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div
        className="mx-auto w-full rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6"
        style={{ maxWidth: 520, height: "fit-content", animation: "sim-jalon-carte .42s cubic-bezier(.2,.9,.2,1) both" }}
      >
        <div
          aria-hidden
          className="mx-auto mb-3 flex items-center justify-center rounded-full"
          style={{
            width: 46,
            height: 46,
            background: parfait ? "#E7F3EB" : "#FBF1DF",
            color: parfait ? "#107C41" : "#8A5A12",
            animation: "sim-jalon-rond .5s .1s cubic-bezier(.2,.9,.2,1) both",
          }}
        >
          <IconeCheck taille={23} epaisseur={2.2} />
        </div>
        <p className="text-center font-display text-[19px] font-bold text-ink">Évaluation terminée</p>
        <p className="mb-4 mt-1 text-center text-[13px] text-warm-600">{filChapitre}</p>

        {/* Note DE CE PASSAGE. Le mot « passage » est explicite : l'écran de fin
            décrit ce que l'apprenant vient de jouer, « Mes résultats » décrit sa
            meilleure tentative, et les deux peuvent différer. */}
        <div className="flex items-center gap-4 rounded-xl border border-border p-4" style={{ background: "#FAF8F5" }}>
          <span
            className="flex-shrink-0 font-display font-semibold tabular-nums"
            // `whiteSpace` n'est pas cosmétique : sans lui « 56 % » se coupe
            // entre le nombre et le signe dès 390 px.
            style={{
              fontSize: "clamp(29px,7.5vw,34px)",
              lineHeight: 1,
              color: pct == null ? "#9A9186" : tonDeLaNote(pct),
              whiteSpace: "nowrap",
            }}
          >
            {pct == null ? "…" : `${pct} %`}
          </span>
          <span className="min-w-0 text-[12.5px] leading-relaxed text-warm-500">
            {bilan && bilan.pointsTotal > 0 ? (
              <>
                <b className="text-ink">
                  {bilan.pointsObtenus} point{bilan.pointsObtenus > 1 ? "s" : ""} sur {bilan.pointsTotal}
                </b>{" "}
                {parfait ? "obtenus au premier essai." : "obtenus au premier essai"}
              </>
            ) : (
              <b className="text-ink">Note de ce passage</b>
            )}{" "}
            {parfait ? "Rien à revoir dans ce module." : `sur ${gestesEvalues} geste${gestesEvalues > 1 ? "s" : ""} évalué${gestesEvalues > 1 ? "s" : ""}.`}
          </span>
        </div>

        <div
          className="mt-2.5 flex items-center gap-2 rounded-lg px-3 py-2 text-[12px]"
          style={{ background: "#EEF2FF", color: "#3730A3" }}
        >
          <IconeEtoile />
          <span>{phraseMeilleure}</span>
        </div>

        {/* ── Compétences acquises ── */}
        {acquises.length > 0 && (
          <>
            <BlocTitre>
              {parfait
                ? `Les ${acquises.length} compétences du module sont validées`
                : "Ce qui est acquis"}
            </BlocTitre>
            <div className="flex flex-wrap gap-1.5">
              {acquises.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1.5 rounded-full"
                  style={{ background: "#E7F3EB", color: "#107C41", fontSize: 12, fontWeight: 600, padding: "5px 11px 5px 8px" }}
                >
                  <IconeCheck />
                  {c.titre}
                </span>
              ))}
            </div>
          </>
        )}

        {/* ── Priorités de révision ── */}
        {priorites.length > 0 && (
          <>
            <BlocTitre>À revoir, dans cet ordre</BlocTitre>
            {priorites.map((p, i) => (
              <Priorite key={p.id} ligne={p} rang={i + 1} onNaviguer={onNaviguer} />
            ))}
          </>
        )}

        {/* ── Notions presque tenues, repliées ── */}
        {fragiles.length > 0 && (
          <details className="mt-1 rounded-xl border border-border">
            <summary
              className="cursor-pointer list-none px-3.5 text-[12.5px] font-semibold text-warm-700"
              style={{ minHeight: 44, display: "flex", alignItems: "center" }}
            >
              {fragiles.length === 1 ? "Une notion presque tenue" : `${fragiles.length} notions presque tenues`}
            </summary>
            <div className="border-t border-border px-3.5 py-3">
              {fragiles.map((c) => (
                <div key={c.id} className="mb-3 last:mb-0">
                  <div className="flex items-start gap-2">
                    <span
                      className="flex-shrink-0 rounded-full uppercase"
                      style={{ background: ETIQUETTES.fragile.fond, color: ETIQUETTES.fragile.encre, fontSize: 10.5, fontWeight: 800, padding: "3px 8px", letterSpacing: ".04em" }}
                    >
                      fragile
                    </span>
                    <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-ink">{c.titre}</span>
                    <span className="flex-shrink-0 text-[12px] tabular-nums text-warm-500">
                      {c.pointsObtenus} / {c.pointsTotal}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-warm-500">
                    {phraseDesQuestions(c) ?? "Une partie des points de cette notion n'est pas tenue."} · Ce n'est pas une
                    priorité : reprenez-la seulement si le sujet vous reste flou.
                  </p>
                  <Renvois ligne={c} onNaviguer={onNaviguer} />
                </div>
              ))}
            </div>
          </details>
        )}

        {/* ── La phrase anti-corrigé, ou l'explication du repli ── */}
        {utilisable && !parfait ? (
          <div className="mt-4 flex gap-2.5 rounded-lg px-3 py-2.5 text-[11.5px] leading-relaxed" style={{ background: "#F4F1EA", color: "#5C574E" }}>
            <IconeInfo />
            <span>
              Aucune correction n'est affichée ici : les réponses sont dans les leçons. C'est ce qui permet de repasser
              l'évaluation et que la note veuille encore dire quelque chose.
            </span>
          </div>
        ) : !utilisable && !enAttente ? (
          <div className="mt-4 flex gap-2.5 rounded-lg px-3 py-2.5 text-[11.5px] leading-relaxed" style={{ background: "#F4F1EA", color: "#5C574E" }}>
            <IconeInfo />
            <span>
              Le bilan par compétence n'est pas disponible pour ce passage. Aucune leçon n'est conseillée plutôt qu'une
              autre : ce serait deviner.
            </span>
          </div>
        ) : null}

        {/* Enregistrement manqué : on propose de réessayer LE MÊME passage,
            pas de tout refaire. */}
        {!noteEnregistree && onReessayer && (
          <button
            type="button"
            data-control="sim-reessayer-cloture"
            onClick={onReessayer}
            disabled={reessaiEnCours}
            aria-busy={reessaiEnCours}
            className="mt-4 inline-flex w-full items-center justify-center rounded-xl border px-4 text-[13px] font-semibold"
            style={{
              minHeight: 44,
              borderColor: "#F3D2CE",
              background: "#FDEDEC",
              color: "#7A2620",
              opacity: reessaiEnCours ? 0.6 : 1,
            }}
          >
            {reessaiEnCours ? "Nouvel essai…" : "Réessayer l'enregistrement"}
          </button>
        )}

        {/* ── Actions ── */}
        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
          {premiere && premiere.revoir[0] && onNaviguer ? (
            <button
              type="button"
              data-control="sim-bilan-reviser"
              onClick={() => onNaviguer(premiere.revoir[0].chapterId)}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold text-white sm:flex-1"
              style={{ minHeight: 44, background: "#10201B", lineHeight: 1.3, flexBasis: 220 }}
            >
              Revoir « {premiere.revoir[0].titre} »<span aria-hidden>›</span>
            </button>
          ) : chapitreSuivant && onNaviguer ? (
            <button
              type="button"
              data-control="sim-chapitre-suivant"
              onClick={() => onNaviguer(chapitreSuivant.id)}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold text-white sm:flex-1"
              style={{ minHeight: 44, background: "#10201B", lineHeight: 1.3, flexBasis: 220 }}
            >
              <span className="truncate">{chapitreSuivant.titre}</span>
              <span aria-hidden>›</span>
            </button>
          ) : null}

          {onRepasser && (
            <button
              type="button"
              data-control="sim-repasser"
              onClick={onRepasser}
              className="inline-flex items-center justify-center rounded-xl border border-border bg-white px-4 text-[13.5px] font-semibold text-warm-700"
              style={{ minHeight: 44, whiteSpace: "nowrap" }}
            >
              Repasser l'évaluation
            </button>
          )}

          {/* Discret, mais présent : personne n'est enfermé dans une révision. */}
          {premiere && chapitreSuivant && onNaviguer && (
            <button
              type="button"
              data-control="sim-continuer-sans-reviser"
              onClick={() => onNaviguer(chapitreSuivant.id)}
              className="inline-flex items-center justify-center rounded-xl px-3 text-[12.5px] text-warm-500 sm:w-full"
              style={{ minHeight: 44 }}
            >
              Continuer sans réviser
            </button>
          )}
        </div>

        {enAttente && (
          <p className="mt-3 text-center text-[11.5px] text-warm-400">Préparation de votre bilan…</p>
        )}
      </div>
    </div>
  )
}
