import type { GrammarCatalogResponse } from "@/lib/contracts/api";

type DbUnit = { unitNumber: number; officialTitle: string };
type DbPoint = { id: string; title: string; units: DbUnit[] };
type DbSection = { id: string; officialTitle: string; knowledgePoints: DbPoint[] };
type DbBook = { id: string; title: string; edition: string; officialLevel: string; sections: DbSection[] };

export type GrammarCatalogDb = {
  grammarBookEdition: {
    findMany: (query: unknown) => Promise<DbBook[]>;
  };
};

export async function getGrammarCatalog(db: GrammarCatalogDb): Promise<GrammarCatalogResponse> {
  const books = await db.grammarBookEdition.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
        include: {
          knowledgePoints: {
            where: { source: "grammar_in_use" },
            orderBy: { sortOrder: "asc" },
            include: { units: { orderBy: { unitNumber: "asc" } } },
          },
        },
      },
    },
  });

  return {
    books: books.map((book) => ({
      id: book.id,
      title: book.title,
      edition: book.edition,
      officialLevel: book.officialLevel,
      sections: book.sections.map((section) => ({
        id: section.id,
        officialTitle: section.officialTitle,
        points: section.knowledgePoints.map((point) => ({
          id: point.id,
          title: point.title,
          unitStart: point.units[0].unitNumber,
          unitEnd: point.units.at(-1)!.unitNumber,
          units: point.units,
        })),
      })),
    })),
  };
}
