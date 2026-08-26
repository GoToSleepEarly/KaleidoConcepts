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

const numberedTitle = /^(.*\S)\s+(\d+)(\s+\(.*\))?$/;

function numberedTitleParts(title: string) {
  const match = numberedTitle.exec(title);
  return match ? { title: match[1], number: Number(match[2]), sharedSuffix: match[3] ?? "" } : null;
}

function pointId(bookId: string, unitStart: number, unitEnd: number) {
  return `${bookId}-u${unitStart}${unitEnd === unitStart ? "" : `-${unitEnd}`}`;
}

export function compileGrammarBook(book: RawGrammarBook): GrammarBookCatalog {
  return {
    id: book.id,
    title: book.title,
    edition: book.edition,
    officialLevel: book.officialLevel,
    sections: book.sections.map((section) => {
      const points: GrammarCatalogPoint[] = [];
      for (let index = 0; index < section.units.length; index += 1) {
        const first = section.units[index];
        const match = numberedTitleParts(first.officialTitle);
        const units = [first];
        if (match) {
          let nextIndex = index + 1;
          let expectedSuffix = match.number + 1;
          while (nextIndex < section.units.length) {
            const candidate = section.units[nextIndex];
            const candidateMatch = numberedTitleParts(candidate.officialTitle);
            if (!candidateMatch
              || candidate.unitNumber !== units.at(-1)!.unitNumber + 1
              || candidateMatch.title !== match.title
              || candidateMatch.sharedSuffix !== match.sharedSuffix
              || candidateMatch.number !== expectedSuffix) break;
            units.push(candidate);
            expectedSuffix += 1;
            nextIndex += 1;
          }
        }
        index += units.length - 1;
        const unitStart = units[0].unitNumber;
        const unitEnd = units.at(-1)!.unitNumber;
        points.push({
          id: pointId(book.id, unitStart, unitEnd),
          title: units.length > 1 ? match!.title : first.officialTitle,
          unitStart,
          unitEnd,
          units,
        });
      }
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
  ].join(" ").toLocaleLowerCase("en");
  return searchable.includes(normalized);
}

export function unitRangeLabel(point: Pick<GrammarCatalogPoint, "unitStart" | "unitEnd">) {
  return point.unitStart === point.unitEnd ? `Unit ${point.unitStart}` : `Units ${point.unitStart}–${point.unitEnd}`;
}
