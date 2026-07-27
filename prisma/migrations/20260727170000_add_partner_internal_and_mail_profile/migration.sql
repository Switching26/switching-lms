-- Organisme interne (Switching) : accède à tout le catalogue sans licence.
ALTER TABLE "Partner" ADD COLUMN "isInternal" BOOLEAN NOT NULL DEFAULT false;

-- Compte d'envoi des emails de l'organisme (null = plateforme e-learning).
ALTER TABLE "Partner" ADD COLUMN "mailProfile" TEXT;
