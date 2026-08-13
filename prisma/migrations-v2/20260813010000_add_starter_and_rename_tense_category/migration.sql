ALTER TYPE "EnglishLevel" ADD VALUE IF NOT EXISTS 'Starter' BEFORE 'A1';

UPDATE "PresetOption"
SET "category" = '时态'
WHERE "kind" = 'grammar' AND "category" = '时态与体';
