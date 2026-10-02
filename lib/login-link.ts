/** Permanent, branded login addresses shared by the email and copy actions. */
export function buildLoginLinks(baseUrl: string, partnerSlug?: string | null) {
  const base = baseUrl.replace(/\/$/, "")
  const query = partnerSlug ? `?partner=${encodeURIComponent(partnerSlug)}` : ""
  return {
    loginUrl: `${base}/login${query}`,
    forgotPasswordUrl: `${base}/login/mot-de-passe-oublie${query}`,
  }
}

export function loginLinkMessage(user: { firstName: string; lastName: string; email: string }, organisation: string, loginUrl: string) {
  return `Bonjour ${user.firstName.trim()} ${user.lastName.trim().toLocaleUpperCase("fr-FR")},

Vous trouverez ci-dessous votre lien de connexion à votre espace de formation ${organisation} :
${loginUrl}

Votre identifiant : ${user.email}

Utilisez le mot de passe que vous avez créé. Si vous ne l’avez pas ou si vous l’avez oublié, cliquez sur « Mot de passe oublié » sur la page de connexion, puis renseignez votre adresse e-mail (${user.email}). Vous recevrez un lien à cette adresse pour définir un nouveau mot de passe. Pensez à vérifier vos courriers indésirables.

Si vous rencontrez une difficulté, vous pouvez nous répondre : nous vous aiderons à accéder à votre espace.

Bien à vous,`
}
