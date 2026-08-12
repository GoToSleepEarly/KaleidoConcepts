import { describe, expect, test } from "vitest";

import { personCreateSchema } from "./people";

const basePerson = {
  role: "student" as const,
  chineseName: "夏天",
  englishName: "Summer",
  gender: "female" as const,
};

describe("people validation", () => {
  test.each([0, 99])("accepts boundary age %s", (age) => {
    expect(personCreateSchema.safeParse({ ...basePerson, age }).success).toBe(true);
  });

  test.each([-1, 100, 8.5])("rejects invalid age %s", (age) => {
    expect(personCreateSchema.safeParse({ ...basePerson, age }).success).toBe(false);
  });
});
