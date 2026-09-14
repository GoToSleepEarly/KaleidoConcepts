import { describe, expect, it, vi } from "vitest";

import { getGrammarCatalog } from "@/lib/server/repositories/grammar-catalog";

describe("grammar catalog repository", () => {
  it("returns one independently selectable point per Unit in fixed order", async () => {
    const findMany = vi.fn(async () => [{
      id: "english-grammar-in-use-5",
      title: "English Grammar in Use",
      edition: "Fifth Edition",
      officialLevel: "B1–B2",
      sections: [{
        id: "section",
        officialTitle: "Present perfect and past",
        knowledgePoints: [
          { id: "point-13", title: "Present perfect and past 1", units: [{ unitNumber: 13, officialTitle: "Present perfect and past 1" }] },
          { id: "point-14", title: "Present perfect and past 2", units: [{ unitNumber: 14, officialTitle: "Present perfect and past 2" }] },
        ],
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
            id: "point-13",
            title: "Present perfect and past 1",
            unitStart: 13,
            unitEnd: 13,
            units: [{ unitNumber: 13, officialTitle: "Present perfect and past 1", learningContents: ["用现在完成时表达与现在有关且时间未明确的过去事情", "用一般过去时表达发生在明确、已结束过去时间的事情", "根据事情与现在是否相关、过去时间是否明确，选择现在完成时或一般过去时", "在继续讲述过去细节时保持时态一致"] }],
          }, {
            id: "point-14",
            title: "Present perfect and past 2",
            unitStart: 14,
            unitEnd: 14,
            units: [{ unitNumber: 14, officialTitle: "Present perfect and past 2", learningContents: ["在提供过去细节或继续讲述过去事件时使用一般过去时", "根据谈话关注的是当前结果还是过去事件选择现在完成时或一般过去时", "根据事情与现在是否相关、过去时间是否明确，选择现在完成时或一般过去时", "在继续讲述过去细节时保持时态一致"] }],
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
