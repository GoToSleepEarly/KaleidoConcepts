import { describe, expect, it } from "vitest";

import { compileGrammarBook, defaultGrammarBookId, matchesGrammarPoint } from "@/lib/domain/grammar-catalog";
import { grammarCatalogBooks } from "../../prisma/grammar-catalog-data";

describe("grammar catalog", () => {
  it("makes every source Unit an independently selectable knowledge point", () => {
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
            { unitNumber: 1, officialTitle: "Present perfect and past 1 (I have done and I did)", learningContents: ["scope 1"] },
            { unitNumber: 2, officialTitle: "Present perfect and past 2 (I have done and I did)", learningContents: ["scope 2"] },
            { unitNumber: 3, officialTitle: "Past perfect", learningContents: ["scope 3"] },
            { unitNumber: 5, officialTitle: "Articles 1", learningContents: ["scope 4"] },
            { unitNumber: 7, officialTitle: "Articles 2", learningContents: ["scope 5"] },
          ],
        },
        {
          id: "section-b",
          officialTitle: "Section B",
          sortOrder: 2,
          units: [{ unitNumber: 8, officialTitle: "Articles 3", learningContents: ["scope 6"] }],
        },
      ],
    });

    expect(book.sections[0].points.map((point) => [point.title, point.unitStart, point.unitEnd])).toEqual([
      ["Present perfect and past 1 (I have done and I did)", 1, 1],
      ["Present perfect and past 2 (I have done and I did)", 2, 2],
      ["Past perfect", 3, 3],
      ["Articles 1", 5, 5],
      ["Articles 2", 7, 7],
    ]);
    expect(book.sections[1].points[0].title).toBe("Articles 3");
    expect(book.sections[0].points[0].units.map((unit) => unit.learningContents)).toEqual([["scope 1"]]);
    expect(book.sections[0].points[1].units.map((unit) => unit.learningContents)).toEqual([["scope 2"]]);
  });

  it("matches one Unit title, number and grammar rule text", () => {
    const points = compileGrammarBook({
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
          { unitNumber: 13, officialTitle: "Present perfect and past 1", learningContents: ["scope 1"] },
          { unitNumber: 14, officialTitle: "Present perfect and past 2", learningContents: ["scope 2"] },
        ],
      }],
    }).sections[0].points;

    expect(matchesGrammarPoint(points[0], "present perfect and past")).toBe(true);
    expect(matchesGrammarPoint(points[1], "14")).toBe(true);
    expect(matchesGrammarPoint(points[1], "scope 2")).toBe(true);
    expect(matchesGrammarPoint(points[0], "past 2")).toBe(false);
    expect(matchesGrammarPoint(points[0], "passive")).toBe(false);
  });

  it("uses course level only as the default landing book", () => {
    expect(defaultGrammarBookId("Starter")).toBe("essential-grammar-in-use-4");
    expect(defaultGrammarBookId("A2")).toBe("essential-grammar-in-use-4");
    expect(defaultGrammarBookId("B1")).toBe("english-grammar-in-use-5");
    expect(defaultGrammarBookId("B2")).toBe("english-grammar-in-use-5");
    expect(defaultGrammarBookId("C1")).toBe("advanced-grammar-in-use-4");
  });

  it("contains one selectable point for every official Unit", () => {
    expect(grammarCatalogBooks.map((book) => book.sections.flatMap((section) => section.points.flatMap((point) => point.units)).length)).toEqual([115, 145, 105]);
    expect(grammarCatalogBooks.map((book) => book.sections.flatMap((section) => section.points).length)).toEqual([115, 145, 105]);
    const englishPoints = grammarCatalogBooks[1].sections.flatMap((section) => section.points);
    expect(englishPoints.find((point) => point.unitStart === 13)).toMatchObject({
      id: "english-grammar-in-use-5-u13",
      title: "Present perfect and past 1 (I have done and I did)",
      unitEnd: 13,
    });
    expect(englishPoints.find((point) => point.unitStart === 14)?.id).toBe("english-grammar-in-use-5-u14");
  });
});
