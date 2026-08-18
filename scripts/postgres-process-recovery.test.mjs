import { describe, expect, test } from "vitest";

import { matchingPostgresProcessIds } from "./postgres-process-recovery.mjs";

describe("postgres process recovery", () => {
  test("only selects postgres processes bound to the exact project database directory", () => {
    const processes = [
      { Name: "postgres.exe", ProcessId: 101, CommandLine: 'postgres.exe -D "C:\\project\\.local\\postgres-app" -p 51215' },
      { Name: "postgres.exe", ProcessId: 102, CommandLine: 'postgres.exe -D "C:\\other\\postgres-app" -p 5432' },
      { Name: "node.exe", ProcessId: 103, CommandLine: 'node scripts/dev-db.mjs C:\\project\\.local\\postgres-app' },
    ];

    expect(matchingPostgresProcessIds(processes, "C:\\project\\.local\\postgres-app")).toEqual([101]);
  });
});
