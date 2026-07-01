-- ZoneBreakdown -> ThresholdProfile: allow cascade when athlete data is removed
ALTER TABLE "ZoneBreakdown" DROP CONSTRAINT IF EXISTS "ZoneBreakdown_thresholdProfileId_fkey";
ALTER TABLE "ZoneBreakdown"
  ADD CONSTRAINT "ZoneBreakdown_thresholdProfileId_fkey"
  FOREIGN KEY ("thresholdProfileId") REFERENCES "ThresholdProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
