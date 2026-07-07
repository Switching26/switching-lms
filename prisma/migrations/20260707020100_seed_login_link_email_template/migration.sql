INSERT INTO "EmailTemplate" (
  "id",
  "name",
  "subject",
  "htmlContent",
  "type",
  "isDefault",
  "isActive",
  "partnerId",
  "createdAt",
  "updatedAt"
)
SELECT
  'default_login_link',
  'Lien de connexion',
  'Votre lien de connexion à {{plateforme_nom}}',
  $$<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Lien de connexion</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
          <tr>
            <td style="background-color:{{couleur_principale}};padding:30px 32px;text-align:center;">
              {{logo_url}}
              <h1 style="{{logo_url_style}}color:#ffffff;margin:0;font-size:24px;font-weight:700;font-family:Arial,sans-serif;">{{plateforme_nom}}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 18px;font-size:22px;color:#111827;">Lien de connexion</h2>
              <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.6;">
                Bonjour {{prenom}},
              </p>
              <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.6;">
                Vous pouvez vous reconnecter à votre espace en cliquant sur le bouton ci-dessous.
              </p>
              <table cellspacing="0" cellpadding="0" style="margin:26px auto;">
                <tr>
                  <td align="center" bgcolor="{{couleur_principale}}" style="border-radius:8px;">
                    <a href="{{lien_connexion}}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Arial,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Me connecter
                    </a>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;margin:0 0 18px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Votre identifiant</p>
                    <p style="margin:0;color:#111827;font-size:15px;font-weight:700;">{{email}}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">
                Utilisez l'adresse email et le mot de passe que vous connaissez déjà pour accéder à votre espace.
              </p>
              <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">
                Si vous avez oublié votre mot de passe, cliquez sur « Mot de passe oublié » depuis la page de connexion, ou utilisez directement ce lien :
                <a href="{{lien_mot_de_passe_oublie}}" target="_blank" style="color:{{couleur_principale}};font-weight:600;text-decoration:none;">réinitialiser mon mot de passe</a>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:#f9f9fb;text-align:center;border-top:1px solid #eeeeee;">
              <span style="color:#9ca3af;font-size:12px;">{{partenaire_nom}} · {{plateforme_url}}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>$$,
  'LOGIN_LINK',
  true,
  true,
  null,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "EmailTemplate" WHERE "id" = 'default_login_link'
);
