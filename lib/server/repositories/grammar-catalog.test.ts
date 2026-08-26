import { describe, expect, it, vi } from "vitest";

import { getGrammarCatalog } from "@/lib/server/repositories/grammar-catalog";

describe("grammar catalog repository", () => {
  it("returns books, sections, merged points and exact units in fixed order", async () => {
    const findMany = vi.fn(async () => [{
      id: "english-grammar-in-use-5",
      title: "English Grammar in Use",
      edition: "Fifth Edition",
      officialLevel: "B1–B2",
      sections: [{
        id: "section",
        officialTitle: "Present perfect and past",
        knowledgePoints: [{
          id: "point",
          title: "Present perfect and past",
          units: [
            { unitNumber: 13, officialTitle: "Present perfect and past 1" },
            { unitNumber: 14, officialTitle: "Present perfect and past 2" },
          ],
        }],
      }],
    }]);

    await expect(getGrammarCatalog({ grammarBookEdition: { findMany } })).resolves.toEqual({
      books: [{
        id: "english-grammar-in-use-5",
        title: "English Grammar in Use",
        edition: "Fifth Edition",
        officialLevel: "B1–B2",
        sections: [{
          id: "section",
          officialTitle: "Present perfect and past",
          points: [{
            id: "point",
            title: "Present perfect and past",
            unitStart: 13,
            unitEnd: 14,
            units: [
              { unitNumber: 13, officialTitle: "Present perfect and past 1" },
              { unitNumber: 14, officialTitle: "Present perfect and past 2" },
            ],
          }],
        }],
      }],
    });
    expect(findMany).toHaveBeenCalledWith({
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
  });
});
