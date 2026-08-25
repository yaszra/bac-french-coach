-- A recording belongs to whoever's voice it is.
--
-- `audio_asset` had no subject column, so "purge this child's recordings" could
-- not be written. What was written instead — in the erasure job and in consent
-- withdrawal alike — matched on `organizationId` and `provenance = 'human'`,
-- which is every child in the school. One family exercising their right to
-- erasure destroyed every other family's recordings, and the code read as
-- though it did the right thing.
--
-- Null means the audio belongs to no child: a reciter's recitation, a reviewed
-- talqīn, a library asset. Those are never purged by a child's request.
ALTER TABLE "audio_asset" ADD COLUMN "learnerUserId" TEXT;
CREATE INDEX "audio_asset_learnerUserId_idx" ON "audio_asset"("learnerUserId");
