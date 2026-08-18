import { EventEmitter } from "node:events";

import { describe, expect, test, vi } from "vitest";

import { createGracefulChildStopper } from "./child-process-lifecycle.mjs";

class FakeChildProcess extends EventEmitter {
  connected = true;
  exitCode = null;
  signalCode = null;
  send = vi.fn();
  kill = vi.fn();
}

describe("createGracefulChildStopper", () => {
  test("waits for the child exit acknowledgement instead of killing it immediately", async () => {
    const child = new FakeChildProcess();
    const stop = createGracefulChildStopper(child, { timeoutMs: 1_000 });

    let resolved = false;
    const stopping = stop().then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(child.send).toHaveBeenCalledWith({ type: "shutdown" });
    expect(child.kill).not.toHaveBeenCalled();
    expect(resolved).toBe(false);

    child.exitCode = 0;
    child.emit("exit", 0, null);
    await stopping;

    expect(resolved).toBe(true);
  });

  test("coalesces repeated shutdown requests", async () => {
    const child = new FakeChildProcess();
    const stop = createGracefulChildStopper(child, { timeoutMs: 1_000 });

    const first = stop();
    const second = stop();

    expect(child.send).toHaveBeenCalledTimes(1);

    child.exitCode = 0;
    child.emit("exit", 0, null);
    await Promise.all([first, second]);
  });

  test("uses the fallback only when IPC is unavailable", async () => {
    const child = new FakeChildProcess();
    child.connected = false;
    const stop = createGracefulChildStopper(child, { timeoutMs: 1_000 });

    const stopping = stop();
    expect(child.send).not.toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");

    child.signalCode = "SIGTERM";
    child.emit("exit", null, "SIGTERM");
    await stopping;
  });
});
