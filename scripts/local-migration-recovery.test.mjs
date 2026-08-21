import { describe, expect, test } from "vitest";

import { assessLegacyBaseline } from "./local-migration-recovery.mjs";

const requiredColumns = [
  "User.aiGateway",
  "Course.visualQuality",
  "CourseStorySetting.operationStatus",
  "CourseImage.failureCode",
  "CoursePresentation.slideOverrides",
];

describe("local migration recovery", () => {
  test("does nothing when the squashed baseline has not failed", () => {
    expect(assessLegacyBaseline({ migrations: [], columns: [] })).toEqual({ action: "none" });
  });

  test("recognizes an old local database that already contains the squashed baseline schema", () => {
    expect(assessLegacyBaseline({
      migrations: [
        { migrationName: "20260819030000_replace_ai_gateways_with_crazyrouter", finished: true, rolledBack: false, logs: null },
        { migrationName: "20260820000000_baseline", finished: false, rolledBack: false, logs: 'ERROR: type "AiGateway" already exists' },
      ],
      columns: requiredColumns,
    })).toEqual({ action: "resolve", migrationName: "20260820000000_baseline" });
  });

  test("refuses to hide a failed baseline when the legacy schema signature is incomplete", () => {
    expect(() => assessLegacyBaseline({
      migrations: [
        { migrationName: "20260819030000_replace_ai_gateways_with_crazyrouter", finished: true, rolledBack: false, logs: null },
        { migrationName: "20260820000000_baseline", finished: false, rolledBack: false, logs: 'ERROR: type "AiGateway" already exists' },
      ],
      columns: requiredColumns.filter((column) => column !== "CoursePresentation.slideOverrides"),
    })).toThrow("结构校验未通过");
  });

  test("refuses to resolve an unrelated baseline failure", () => {
    expect(() => assessLegacyBaseline({
      migrations: [
        { migrationName: "20260819030000_replace_ai_gateways_with_crazyrouter", finished: true, rolledBack: false, logs: null },
        { migrationName: "20260820000000_baseline", finished: false, rolledBack: false, logs: "disk full" },
      ],
      columns: requiredColumns,
    })).toThrow("不是已知的本地基线重复执行问题");
  });
});
