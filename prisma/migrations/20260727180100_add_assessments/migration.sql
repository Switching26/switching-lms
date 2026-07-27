-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('POSITIONNEMENT', 'EVALUATION');

-- CreateEnum
CREATE TYPE "AssessmentQuestionType" AS ENUM ('QCM_SINGLE', 'QCM_MULTI', 'TEXTE', 'ECHELLE');


-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "AssessmentType" NOT NULL DEFAULT 'POSITIONNEMENT',
    "partnerId" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "showScore" BOOLEAN NOT NULL DEFAULT true,
    "showCorrectAnswers" BOOLEAN NOT NULL DEFAULT true,
    "passingScore" INTEGER,
    "timeLimitMinutes" INTEGER,
    "validityDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestion" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "helpText" TEXT,
    "type" "AssessmentQuestionType" NOT NULL DEFAULT 'QCM_SINGLE',
    "order" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "scaleMin" INTEGER,
    "scaleMax" INTEGER,
    "scaleMinLabel" TEXT,
    "scaleMaxLabel" TEXT,

    CONSTRAINT "AssessmentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentChoice" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssessmentChoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentInvitation" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "candidateEmail" TEXT NOT NULL,
    "candidateFirstName" TEXT,
    "candidateLastName" TEXT,
    "userId" TEXT,
    "createdById" TEXT,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "needsManualReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAnswer" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedChoiceIds" TEXT[],
    "responseText" TEXT,
    "scaleValue" INTEGER,
    "isCorrect" BOOLEAN,
    "pointsEarned" DOUBLE PRECISION,

    CONSTRAINT "AssessmentAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assessment_partnerId_idx" ON "Assessment"("partnerId");

-- CreateIndex
CREATE INDEX "AssessmentQuestion_assessmentId_idx" ON "AssessmentQuestion"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentChoice_questionId_idx" ON "AssessmentChoice"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentInvitation_token_key" ON "AssessmentInvitation"("token");

-- CreateIndex
CREATE INDEX "AssessmentInvitation_assessmentId_idx" ON "AssessmentInvitation"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentInvitation_userId_idx" ON "AssessmentInvitation"("userId");

-- CreateIndex
CREATE INDEX "AssessmentInvitation_candidateEmail_idx" ON "AssessmentInvitation"("candidateEmail");

-- CreateIndex
CREATE INDEX "AssessmentAnswer_invitationId_idx" ON "AssessmentAnswer"("invitationId");

-- CreateIndex
CREATE INDEX "AssessmentAnswer_questionId_idx" ON "AssessmentAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAnswer_invitationId_questionId_key" ON "AssessmentAnswer"("invitationId", "questionId");

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentChoice" ADD CONSTRAINT "AssessmentChoice_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentInvitation" ADD CONSTRAINT "AssessmentInvitation_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentInvitation" ADD CONSTRAINT "AssessmentInvitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAnswer" ADD CONSTRAINT "AssessmentAnswer_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "AssessmentInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAnswer" ADD CONSTRAINT "AssessmentAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

