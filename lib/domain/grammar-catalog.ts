import type { EnglishLevel, GrammarBookCatalog, GrammarCatalogPoint, GrammarSourceUnit } from "@/lib/contracts/api";

export type RawGrammarSection = {
  id: string;
  officialTitle: string;
  sortOrder: number;
  units: GrammarSourceUnit[];
};

export type RawGrammarBook = Omit<GrammarBookCatalog, "sections"> & {
  sortOrder: number;
  sections: RawGrammarSection[];
};

function pointId(bookId: string, unitNumber: number) {
  return `${bookId}-u${unitNumber}`;
}

export function compileGrammarBook(book: RawGrammarBook): GrammarBookCatalog {
  return {
    id: book.id,
    title: book.title,
    edition: book.edition,
    officialLevel: book.officialLevel,
    sections: book.sections.map((section) => {
      const points: GrammarCatalogPoint[] = section.units.map((unit) => ({
        id: pointId(book.id, unit.unitNumber),
        title: unit.officialTitle,
        unitStart: unit.unitNumber,
        unitEnd: unit.unitNumber,
        units: [unit],
      }));
      return {
        id: section.id,
        officialTitle: section.officialTitle,
        points,
      };
    }),
  };
}

export function defaultGrammarBookId(level: EnglishLevel | null | undefined) {
  if (level === "C1" || level === "C2") return "advanced-grammar-in-use-4";
  if (level === "B1" || level === "B2") return "english-grammar-in-use-5";
  return "essential-grammar-in-use-4";
}

export function matchesGrammarPoint(point: GrammarCatalogPoint, query: string) {
  const normalized = query.trim().toLocaleLowerCase("en");
  if (!normalized) return true;
  const searchable = [
    point.title,
    `${point.unitStart}`,
    `${point.unitEnd}`,
    `unit ${point.unitStart}`,
    `units ${point.unitStart}-${point.unitEnd}`,
    ...point.units.flatMap((unit) => [`${unit.unitNumber}`, `unit ${unit.unitNumber}`, unit.officialTitle]),
    ...point.units.flatMap((unit) => unit.learningContents),
  ].join(" ").toLocaleLowerCase("en");
  return searchable.includes(normalized);
}

export function unitRangeLabel(point: Pick<GrammarCatalogPoint, "unitStart" | "unitEnd">) {
  return point.unitStart === point.unitEnd ? `Unit ${point.unitStart}` : `Units ${point.unitStart}–${point.unitEnd}`;
}

export function grammarLearningSummary(units: Array<Pick<GrammarSourceUnit, "learningContents">> | undefined, limit?: number) {
  const contents = [...new Set((units ?? []).flatMap((unit) => unit.learningContents ?? []))];
  return limit === undefined ? contents : contents.slice(0, limit);
}
