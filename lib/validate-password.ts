const MIN_LENGTH = 8
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/

export function validatePassword(password: string): { valid: boolean; error: string } {
  if (!password || password.length < MIN_LENGTH) {
    return { valid: false, error: `Le mot de passe doit contenir au moins ${MIN_LENGTH} caractères` }
  }
  if (!PASSWORD_REGEX.test(password)) {
    return { valid: false, error: "Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre" }
  }
  return { valid: true, error: "" }
}
