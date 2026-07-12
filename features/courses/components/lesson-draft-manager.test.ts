import { describe, expect, test } from "vitest";

import { replaceCastAliases } from "./lesson-draft-manager";

describe("replaceCastAliases", () => {
  test("renders stable teacher and student aliases as display names", () => {
    expect(
      replaceCastAliases("MengTeacher thanked YouStudent. YouStudent smiled.", [
        { alias: "MengTeacher", displayName: "Mr. Meng" },
        { alias: "YouStudent", displayName: "You" },
      ]),
    ).toBe("Mr. Meng thanked You. You smiled.");
  });

  test("handles aliases containing regular-expression characters", () => {
    expect(
      replaceCastAliases("Ms.PANTeacher arrived.", [
        { alias: "Ms.PANTeacher", displayName: "Ms. PAN" },
      ]),
    ).toBe("Ms. PAN arrived.");
  });
});
