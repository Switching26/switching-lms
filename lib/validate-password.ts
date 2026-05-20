// Validation très permissive : minimum 4 caractères, pas de regex de complexité.
// L'admin est responsable de choisir un mot de passe assez fort. Pas de contrainte arbitraire.
const MIN_LENGTH = 4

export function validatePassword(password: string): { valid: boolean; error: string } {
  if (!password || password.length < MIN_LENGTH) {
    return { valid: false, error: `Le mot de passe doit contenir au moins ${MIN_LENGTH} caractères` }
  }
  return { valid: true, error: "" }
}
