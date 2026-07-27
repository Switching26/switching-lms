-- Une valeur d'enum ne peut pas être utilisée dans la transaction qui la crée
-- (PostgreSQL) : l'ajout est donc isolé dans sa propre migration, comme l'a
-- été LOGIN_LINK.
ALTER TYPE "EmailType" ADD VALUE IF NOT EXISTS 'ASSESSMENT_INVITATION';
