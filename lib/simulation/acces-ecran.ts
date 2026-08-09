/**
 * L'atelier demande-t-il un écran plus grand que celui-ci ?
 *
 * Un chapitre de simulation reproduit une vraie fenêtre bureautique — ruban,
 * onglets, volets, boîtes de dialogue. Sous la taille d'une tablette, ces
 * commandes ne sont plus atteignables au doigt : l'atelier n'est pas « moins
 * confortable », il est injouable. Plutôt que de le monter pour rien, la page
 * apprenant affiche un écran d'explication à sa place.
 *
 * ⚠️ CE FICHIER NE DÉCIDE QUE POUR LES ATELIERS. Vidéo, support PDF et
 * questionnaire n'ont jamais eu besoin d'un grand écran et ne passent pas par
 * ici.
 *
 * Fonction PURE, sans React ni `window` : c'est ce qui la rend vérifiable par
 * `scripts/simulation/check-acces-ecran.ts` sans navigateur.
 */

/**
 * Largeur mini, en pixels de mise en page.
 *
 * 768 est la largeur d'un iPad en portrait, la plus petite tablette sur
 * laquelle les ateliers sont validés. Le seuil est INCLUSIF : 768 passe.
 *
 * Ce n'est pas le même seuil que `SEUIL_MOBILE = 720` de `CourrierSurface` :
 * celui-là fait basculer Outlook vers un affichage à un seul volet À
 * L'INTÉRIEUR d'un atelier qui s'ouvre, il ne décide pas s'il s'ouvre. Les deux
 * cohabitent sans se contredire — entre 720 et 767 l'atelier ne s'ouvre plus du
 * tout, donc l'affichage réduit d'Outlook ne sert plus que si la zone de
 * travail elle-même est étroite sur un grand écran.
 */
export const LARGEUR_MINI_ATELIER = 768

/**
 * Hauteur mini, en pixels de mise en page.
 *
 * Sans elle, un grand téléphone COUCHÉ passerait la règle : 844 px de large
 * suffisent, alors qu'il ne reste que ~326 px de haut une fois la navigation
 * retirée — le ruban et la surface de travail n'y tiennent pas.
 *
 * 600 laisse une marge confortable au pire cas légitime, l'iPad en paysage :
 * 768 − 64 de navigation = 704 px utiles, et même avec la bannière
 * d'usurpation on reste au-dessus.
 */
export const HAUTEUR_MINI_ATELIER = 600

/** Zone de travail MESURÉE, jamais déduite de `window.innerWidth`. */
export type ZoneAtelier = {
  largeur: number
  hauteur: number
}

export type VerdictEcran = {
  /** L'atelier peut-il s'ouvrir ? */
  suffisant: boolean
  /** Ce qui manque, pour choisir le mot juste à l'écran. */
  raison: "largeur" | "hauteur" | null
}

const SUFFISANT: VerdictEcran = { suffisant: true, raison: null }

/**
 * Verdict pour une zone de travail donnée.
 *
 * ⚠️ EN CAS DE DOUTE, ON LAISSE PASSER. Une mesure nulle, négative ou non
 * finie — élément pas encore posé, `display:none`, navigateur sans
 * `ResizeObserver` — rend `suffisant`. Bloquer à tort empêcherait un apprenant
 * sur ordinateur de travailler, ce qui est bien plus grave que l'inverse : sur
 * un vrai téléphone, la mesure, elle, arrive toujours.
 *
 * La largeur est testée d'abord : c'est le cas courant (téléphone tenu droit),
 * et c'est le mot que l'écran affichera.
 */
export function verdictEcranAtelier(zone: ZoneAtelier): VerdictEcran {
  const { largeur, hauteur } = zone

  if (!Number.isFinite(largeur) || !Number.isFinite(hauteur)) return SUFFISANT
  if (largeur <= 0 || hauteur <= 0) return SUFFISANT

  if (largeur < LARGEUR_MINI_ATELIER) return { suffisant: false, raison: "largeur" }
  if (hauteur < HAUTEUR_MINI_ATELIER) return { suffisant: false, raison: "hauteur" }

  return SUFFISANT
}
