import net from "node:net";

export function isPortAvailable(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function findAvailableDatabasePort(
  preferredPort,
  { check = isPortAvailable, maxAttempts = 20 } = {},
) {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = preferredPort + offset;
    if (candidate > 65_535) break;
    if (await check(candidate)) return candidate;
  }

  throw new Error(`无法在 ${preferredPort} 附近找到可用的本地数据库端口`);
}

export function waitForDatabaseChildReady(child, { timeoutMs = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      globalThis.clearTimeout(timeout);
      child.removeListener("message", onMessage);
      child.removeListener("exit", onExit);
      child.removeListener("error", onError);
    };
    const finish = (callback, value) => {
      cleanup();
      callback(value);
    };
    const onMessage = (message) => {
      if (message?.type === "ready") finish(resolve, { port: message.port });
      if (message?.type === "failed") finish(reject, new Error(message.message || "本地数据库启动失败"));
    };
    const onExit = (code, signal) => {
      finish(reject, new Error(`数据库进程在就绪前退出（${signal || `exit code ${code}`}）`));
    };
    const onError = (error) => finish(reject, error);
    const timeout = setTimeout(() => {
      finish(reject, new Error(`等待本地数据库就绪超时（${timeoutMs}ms）`));
    }, timeoutMs);

    child.on("message", onMessage);
    child.once("exit", onExit);
    child.once("error", onError);
  });
}
