-- Passage d'évaluation tenu par le SERVEUR, et verdict serveur par étape.
--
-- Jusqu'ici la note d'une évaluation se calculait depuis deux booléens par
-- étape, déclarés par le navigateur dans le corps du PUT. Une requête fabriquée
-- qui affirmait « tout réussi du premier coup » obtenait 100 % sans avoir joué
-- une seule étape. Ces deux tables déplacent la source de vérité côté serveur :
-- seul `POST /api/simulations/[chapterId]/verify` écrit un verdict, et la note
-- finale ne se calcule plus que depuis eux.
--
-- NON APPLIQUÉE. Préparée localement ; ni `migrate deploy`, ni `db push`, ni
-- semis n'ont été exécutés.

CREATE TABLE "SimulationRun" (
    "id" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "passage" INTEGER NOT NULL DEFAULT 1,
    "scenarioVersion" INTEGER NOT NULL DEFAULT 1,
    -- -1 = rien n'a encore été franchi. À 0, l'étape 1 serait déjà recevable
    -- (1 <= 0 + 1) sans que l'étape 0 l'ait été, et un scénario à une seule
    -- étape serait clôturable sans aucun verdict.
    "maxStepIndex" INTEGER NOT NULL DEFAULT -1,
    "score" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimulationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SimulationStepVerdict" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "premierEssai" BOOLEAN NOT NULL DEFAULT false,
    "tentee" BOOLEAN NOT NULL DEFAULT true,
    -- L'apprenant a renoncé à l'étape. Irréversible : aucun verdict ultérieur ne
    -- peut plus lui accorder le point.
    "passee" BOOLEAN NOT NULL DEFAULT false,
    "reussie" BOOLEAN NOT NULL DEFAULT false,
    "fautes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimulationStepVerdict_pkey" PRIMARY KEY ("id")
);

-- Un seul run par (simulation, apprenant, rang de passage) : c'est cette
-- contrainte qui rend l'ouverture d'un passage idempotente sous deux requêtes
-- simultanées.
CREATE UNIQUE INDEX "SimulationRun_simulationId_userId_passage_key"
    ON "SimulationRun"("simulationId", "userId", "passage");
CREATE INDEX "SimulationRun_userId_idx" ON "SimulationRun"("userId");
CREATE INDEX "SimulationRun_simulationId_userId_idx" ON "SimulationRun"("simulationId", "userId");

-- Un seul verdict par étape et par passage. Deux requêtes concurrentes sur la
-- même étape ne peuvent pas produire deux lignes : la seconde échoue sur la
-- contrainte, et la fusion se fait alors sur la ligne existante.
CREATE UNIQUE INDEX "SimulationStepVerdict_runId_stepId_key"
    ON "SimulationStepVerdict"("runId", "stepId");
CREATE INDEX "SimulationStepVerdict_runId_idx" ON "SimulationStepVerdict"("runId");

ALTER TABLE "SimulationRun" ADD CONSTRAINT "SimulationRun_simulationId_fkey"
    FOREIGN KEY ("simulationId") REFERENCES "Simulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SimulationRun" ADD CONSTRAINT "SimulationRun_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SimulationStepVerdict" ADD CONSTRAINT "SimulationStepVerdict_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "SimulationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
