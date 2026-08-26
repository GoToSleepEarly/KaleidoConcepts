import type { TeachingPlanKnowledgePoint } from "@/lib/contracts/api";

type GrammarPointRecord = {
  id: string;
  title: string;
  source?: "legacy" | "grammar_in_use";
  section?: { officialTitle: string } | null;
  bookEdition?: { title: string; edition: string; officialLevel: string } | null;
  units?: Array<{ unitNumber: number; officialTitle: string }>;
};

type LegacyPresetRecord = { id: string; label: string; labelZh?: string | null; category: string | null };

export type GrammarContextDb = {
  knowledgePoint?: { findMany: (query: Record<string, unknown>) => Promise<GrammarPointRecord[]> };
  presetOption?: { findMany: (query: Record<string, unknown>) => Promise<LegacyPresetRecord[]> };
};

export async function resolveGrammarKnowledgePoints(db: GrammarContextDb, ids: string[]): Promise<TeachingPlanKnowledgePoint[]> {
  if (!ids.length) return [];
  const mapped = new Map<string, TeachingPlanKnowledgePoint>();
  const legacyIds = new Set(ids);

  if (db.knowledgePoint) {
    const records = await db.knowledgePoint.findMany({
      where: { id: { in: ids } },
      include: { section: true, bookEdition: true, units: true },
    });
    for (const record of records) {
      const units = [...(record.units ?? [])].sort((left, right) => left.unitNumber - right.unitNumber);
      mapped.set(record.id, {
        id: record.id,
        label: record.title,
        category: record.section?.officialTitle,
        bookTitle: record.bookEdition?.title,
        edition: record.bookEdition?.edition,
        officialLevel: record.bookEdition?.officialLevel,
        unitStart: units[0]?.unitNumber,
        unitEnd: units.at(-1)?.unitNumber,
        units,
      });
      if (record.source !== "legacy") legacyIds.delete(record.id);
    }
  }

  const idsToResolveFromPresets = [...legacyIds];
  const legacy = db.presetOption && idsToResolveFromPresets.length
    ? await db.presetOption.findMany({ where: { id: { in: idsToResolveFromPresets }, kind: "grammar" } })
    : [];
  for (const item of legacy) {
    mapped.set(item.id, {
      id: item.id,
      label: item.label,
      labelZh: item.labelZh ?? undefined,
      category: item.category ?? undefined,
    });
  }
  return ids.map((id) => mapped.get(id)).filter((point): point is TeachingPlanKnowledgePoint => Boolean(point));
}
