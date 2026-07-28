-- Moteur de simulation bureautique (Excel, puis Word/PowerPoint).
-- Migration STRICTEMENT ADDITIVE : deux types énumérés et deux tables neuves.
-- Aucune table ni colonne existante n'est touchée, donc aucun risque de blocage
-- au démarrage du conteneur Railway (les migrations tournent avant le serveur).

CREATE TYPE "SimulationApp" AS ENUM ('EXCEL', 'WORD', 'POWERPOINT');
CREATE TYPE "SimulationMode" AS ENUM ('LESSON', 'EXERCISE', 'EVALUATION');

CREATE TABLE "Simulation" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "app" "SimulationApp" NOT NULL DEFAULT 'EXCEL',
    "mode" "SimulationMode" NOT NULL DEFAULT 'LESSON',
    "scenario" JSONB NOT NULL,
    "stepCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Simulation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SimulationAttempt" (
    "id" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "maxStepSeen" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "hintCount" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION,
    "bestScore" DOUBLE PRECISION,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "stepLog" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimulationAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Simulation_chapterId_key" ON "Simulation"("chapterId");
CREATE INDEX "Simulation_chapterId_idx" ON "Simulation"("chapterId");

CREATE UNIQUE INDEX "SimulationAttempt_simulationId_userId_key" ON "SimulationAttempt"("simulationId", "userId");
CREATE INDEX "SimulationAttempt_userId_idx" ON "SimulationAttempt"("userId");
CREATE INDEX "SimulationAttempt_simulationId_idx" ON "SimulationAttempt"("simulationId");

ALTER TABLE "Simulation" ADD CONSTRAINT "Simulation_chapterId_fkey"
    FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SimulationAttempt" ADD CONSTRAINT "SimulationAttempt_simulationId_fkey"
    FOREIGN KEY ("simulationId") REFERENCES "Simulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SimulationAttempt" ADD CONSTRAINT "SimulationAttempt_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
