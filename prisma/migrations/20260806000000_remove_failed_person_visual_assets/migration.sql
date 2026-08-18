-- Failed attempts are transient errors, not reusable character assets.
DELETE FROM "PersonVisualAsset"
WHERE "status" = 'failed';
