import { describe, expect, it } from "vitest";

import { compileGrammarBook, defaultGrammarBookId, matchesGrammarPoint } from "@/lib/domain/grammar-catalog";
import { grammarCatalogBooks } from "../../prisma/grammar-catalog-data";

describe("grammar catalog", () => {
  it("merges only consecutive numbered titles in the same section", () => {
    const book = compileGrammarBook({
      id: "book",
      title: "Book",
      edition: "First Edition",
      officialLevel: "B1–B2",
      sortOrder: 1,
      sections: [
        {
          id: "section-a",
          officialTitle: "Section A",
          sortOrder: 1,
          units: [
            { unitNumber: 1, officialTitle: "Present perfect and past 1 (I have done and I did)" },
            { unitNumber: 2, officialTitle: "Present perfect and past 2 (I have done and I did)" },
            { unitNumber: 3, officialTitle: "Past perfect" },
            { unitNumber: 5, officialTitle: "Articles 1" },
            { unitNumber: 7, officialTitle: "Articles 2" },
          ],
        },
        {
          id: "section-b",
          officialTitle: "Section B",
          sortOrder: 2,
          units: [{ unitNumber: 8, officialTitle: "Articles 3" }],
        },
      ],
    });

    expect(book.sections[0].points.map((point) => [point.title, point.unitStart, point.unitEnd])).toEqual([
      ["Present perfect and past", 1, 2],
      ["Past perfect", 3, 3],
      ["Articles 1", 5, 5],
      ["Articles 2", 7, 7],
    ]);
    expect(book.sections[1].points[0].title).toBe("Articles 3");
  });

  it("matches merged titles, unit numbers and exact source titles", () => {
    const point = compileGrammarBook({
      id: "book",
      title: "Book",
      edition: "First Edition",
      officialLevel: "B1–B2",
      sortOrder: 1,
      sections: [{
        id: "section",
        officialTitle: "Present perfect and past",
        sortOrder: 1,
        units: [
          { unitNumber: 13, officialTitle: "Present perfect and past 1" },
          { unitNumber: 14, officialTitle: "Present perfect and past 2" },
        ],
      }],
    }).sections[0].points[0];

    expect(matchesGrammarPoint(point, "present perfect and past")).toBe(true);
    expect(matchesGrammarPoint(point, "14")).toBe(true);
    expect(matchesGrammarPoint(point, "past 2")).toBe(true);
    expect(matchesGrammarPoint(point, "passive")).toBe(false);
  });

  it("uses course level only as the default landing book", () => {
    expect(defaultGrammarBookId("Starter")).toBe("essential-grammar-in-use-4");
    expect(defaultGrammarBookId("A2")).toBe("essential-grammar-in-use-4");
    expect(defaultGrammarBookId("B1")).toBe("english-grammar-in-use-5");
    expect(defaultGrammarBookId("B2")).toBe("english-grammar-in-use-5");
    expect(defaultGrammarBookId("C1")).toBe("advanced-grammar-in-use-4");
  });

  it("contains all official units and expected merged examples", () => {
    expect(grammarCatalogBooks.map((book) => book.sections.flatMap((section) => section.points.flatMap((point) => point.units)).length)).toEqual([115, 145, 105]);
    const englishPoints = grammarCatalogBooks[1].sections.flatMap((section) => section.points);
    expect(englishPoints.find((point) => point.unitStart === 13)).toMatchObject({
      id: "english-grammar-in-use-5-u13-14",
      title: "Present perfect and past",
      unitEnd: 14,
    });
  });
});
