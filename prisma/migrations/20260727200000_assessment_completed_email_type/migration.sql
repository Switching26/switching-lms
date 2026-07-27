-- Isolé : PostgreSQL interdit d'utiliser une valeur d'enum dans la
-- transaction qui la crée.
ALTER TYPE "EmailType" ADD VALUE IF NOT EXISTS 'ASSESSMENT_COMPLETED';
