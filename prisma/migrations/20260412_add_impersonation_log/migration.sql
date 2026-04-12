-- CreateTable
CREATE TABLE "ImpersonationLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetEmail" TEXT NOT NULL,
    "targetRole" "Role" NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImpersonationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImpersonationLog_adminId_idx" ON "ImpersonationLog"("adminId");

-- CreateIndex
CREATE INDEX "ImpersonationLog_targetId_idx" ON "ImpersonationLog"("targetId");

-- CreateIndex
CREATE INDEX "ImpersonationLog_createdAt_idx" ON "ImpersonationLog"("createdAt");
