-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PresetOptionKind') THEN
        CREATE TYPE "PresetOptionKind" AS ENUM ('theme', 'grammar');
    END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PresetOption" (
    "id" TEXT NOT NULL,
    "kind" "PresetOptionKind" NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresetOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PresetOption_kind_label_key" ON "PresetOption"("kind", "label");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PresetOption_kind_archivedAt_idx" ON "PresetOption"("kind", "archivedAt");
