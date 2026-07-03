// Validation très permissive : minimum 4 caractères, pas de regex de complexité.
// L'admin est responsable de choisir un mot de passe assez fort. Pas de contrainte arbitraire.
export const MIN_PASSWORD_LENGTH = 4
export const PASSWORD_REQUIREMENT_LABEL = "4 caractères minimum"

export function validatePassword(password: string): { valid: boolean; error: string } {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, error: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères` }
  }
  return { valid: true, error: "" }
}
