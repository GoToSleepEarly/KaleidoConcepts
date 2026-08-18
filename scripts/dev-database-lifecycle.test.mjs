import { EventEmitter } from "node:events";

import { describe, expect, test, vi } from "vitest";

import { findAvailableDatabasePort, waitForDatabaseChildReady } from "./dev-database-lifecycle.mjs";

describe("dev database lifecycle", () => {
  test("skips an occupied or stale preferred port", async () => {
    const check = vi.fn(async (port) => port === 51217);

    await expect(findAvailableDatabasePort(51215, { check, maxAttempts: 5 })).resolves.toBe(51217);
    expect(check.mock.calls.map(([port]) => port)).toEqual([51215, 51216, 51217]);
  });

  test("waits for an explicit database ready message", async () => {
    const child = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;

    const ready = waitForDatabaseChildReady(child, { timeoutMs: 1_000 });
    child.emit("message", { type: "ready", port: 51216 });

    await expect(ready).resolves.toEqual({ port: 51216 });
  });

  test("rejects immediately when the database process exits before ready", async () => {
    const child = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;

    const ready = waitForDatabaseChildReady(child, { timeoutMs: 1_000 });
    child.emit("exit", 1, null);

    await expect(ready).rejects.toThrow("数据库进程在就绪前退出");
  });
});
