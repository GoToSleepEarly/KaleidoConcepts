import { describe, expect, test } from "vitest";

import { recommendedEnglishLevelForStudentAges } from "./course-audience-policy";

describe("recommendedEnglishLevelForStudentAges", () => {
  test.each([
    { ages: [], expected: null },
    { ages: [6], expected: "Starter" },
    { ages: [8], expected: "A1" },
    { ages: [9], expected: "A2" },
    { ages: [12], expected: "B1" },
    { ages: [14], expected: "B2" },
    { ages: [7, 10], expected: "A1" },
    { ages: [9, 12], expected: "A2" },
    { ages: [13, 15], expected: "B2" },
  ])("recommends $expected for ages $ages", ({ ages, expected }) => {
    expect(recommendedEnglishLevelForStudentAges(ages)).toBe(expected);
  });
});
