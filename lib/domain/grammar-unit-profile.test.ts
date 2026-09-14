import { describe, expect, it } from "vitest";

import { grammarUnitLearningContents } from "./grammar-unit-profile";
import { grammarCatalogBooks } from "../../prisma/grammar-catalog-data";

describe("grammar Unit learning profiles", () => {
  it("defines the practical scope of Reported speech 2 instead of repeating its title", () => {
    expect(grammarUnitLearningContents("english-grammar-in-use-5", 48, "Reported speech 2")).toEqual([
      "转述内容现在仍然成立时可以保留原时态，也可以回退为过去时",
      "转述内容已经改变、结束或与事实不符时使用过去时态",
      "使用 say + 从句 / say something to somebody；使用 tell + somebody + 从句",
      "使用 tell / ask + somebody + (not) to-infinitive 转述命令或请求",
    ]);
  });

  it("keeps each numbered Unit independently useful", () => {
    const first = grammarUnitLearningContents("english-grammar-in-use-5", 13, "Present perfect and past 1 (I have done and I did)");
    const second = grammarUnitLearningContents("english-grammar-in-use-5", 14, "Present perfect and past 2 (I have done and I did)");

    expect(first).not.toEqual(second);
    expect(first.every((content) => !content.includes("Unit 14"))).toBe(true);
    expect(second.every((content) => !content.includes("Unit 13"))).toBe(true);
  });

  it("keeps the for/since Unit concise and independent of question types", () => {
    const contents = grammarUnitLearningContents("english-grammar-in-use-5", 12, "for and since when ... ? and how long ... ?");

    expect(contents).toHaveLength(4);
    expect(contents.join(" ")).toContain("for + 时间段");
    expect(contents.join(" ")).not.toMatch(/选项填空|给词变形/);
  });

  it("gives every seeded Unit three or four concrete grammar rules", () => {
    const units = grammarCatalogBooks.flatMap((book) => book.sections.flatMap((section) => section.points.flatMap((point) => point.units)));

    expect(units).toHaveLength(365);
    for (const unit of units) {
      expect(unit.learningContents?.length, `Unit ${unit.unitNumber} ${unit.officialTitle}`).toBeGreaterThanOrEqual(3);
      expect(unit.learningContents?.length, `Unit ${unit.unitNumber} ${unit.officialTitle}`).toBeLessThanOrEqual(4);
      expect(unit.learningContents?.join(" "), `Unit ${unit.unitNumber} ${unit.officialTitle}`).not.toMatch(/正确使用|自然语境|目标结构|明确含义/);
    }
  });

  it("does not give two Units in the same book an identical grammar scope", () => {
    for (const book of grammarCatalogBooks) {
      const seen = new Map<string, number>();
      for (const unit of book.sections.flatMap((section) => section.points.flatMap((point) => point.units))) {
        const signature = JSON.stringify(unit.learningContents);
        expect(seen.get(signature), `${book.title} Unit ${unit.unitNumber} duplicates Unit ${seen.get(signature)}`).toBeUndefined();
        seen.set(signature, unit.unitNumber);
      }
    }
  });
});
