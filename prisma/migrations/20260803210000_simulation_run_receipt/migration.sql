-- Reçu d'écriture de la tentative : rend le report d'un passage clos idempotent.
-- Sans lui, un réessai de clôture après une réponse perdue comptait deux fois
-- errorCount / hintCount / timeSpentSeconds.
ALTER TABLE "SimulationRun" ADD COLUMN "attemptSyncedAt" TIMESTAMP(3);
