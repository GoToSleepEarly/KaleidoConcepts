import { describe, expect, test } from "vitest";

import presetData from "../prisma/preset-data.json" with { type: "json" };

describe("部署预置数据", () => {
  test("只包含账号和预设，不携带课程、人物或账号密码", () => {
    expect(Object.keys(presetData).sort()).toEqual(["presetOptions", "users"]);
    expect(presetData.users).toHaveLength(1);
    expect(presetData.users.every((user) => !("password" in user))).toBe(true);
    expect(presetData.presetOptions).toHaveLength(114);
    expect(presetData.presetOptions.every((option) => option.archivedAt === null)).toBe(true);
  });
});
