-- Per-recipient delivery checkpoints; existing sessions remain unchanged.
ALTER TABLE "TrainerSession"
  ADD COLUMN "learnerReminderSentAt" TIMESTAMP(3),
  ADD COLUMN "trainerReminderSentAt" TIMESTAMP(3);
