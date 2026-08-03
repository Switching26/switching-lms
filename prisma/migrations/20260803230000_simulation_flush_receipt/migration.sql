-- Reçu de remontée de progression : rend le PUT non final rejouable.
-- Sans lui, une réponse perdue puis un renvoi de la même enveloppe comptaient
-- deux fois errorCount / hintCount / timeSpentSeconds.
CREATE TABLE "SimulationFlush" (
    "id" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationFlush_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SimulationFlush_simulationId_userId_cle_key"
    ON "SimulationFlush"("simulationId", "userId", "cle");
CREATE INDEX "SimulationFlush_userId_idx" ON "SimulationFlush"("userId");

ALTER TABLE "SimulationFlush" ADD CONSTRAINT "SimulationFlush_simulationId_fkey"
    FOREIGN KEY ("simulationId") REFERENCES "Simulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SimulationFlush" ADD CONSTRAINT "SimulationFlush_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
