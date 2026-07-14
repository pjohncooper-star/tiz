-- Activity-local UTC offset for day bucketing (travel / destination TZ)

ALTER TABLE "SyncedActivity" ADD COLUMN IF NOT EXISTS "utcOffsetSeconds" INTEGER;
