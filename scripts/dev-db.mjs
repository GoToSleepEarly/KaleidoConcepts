#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import EmbeddedPostgres from "embedded-postgres";
import { stopPostgresGracefully, terminateStaleProjectPostgres } from "./postgres-process-recovery.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const databaseDir = process.env.DEV_DATABASE_DIR || path.join(rootDir, ".local", "postgres-app");
const port = Number(process.env.DEV_DATABASE_PORT || "51215");
const user = process.env.DEV_DATABASE_USER || "postgres";
const password = process.env.DEV_DATABASE_PASSWORD || "postgres";
const database = process.env.DEV_DATABASE_NAME || "postgres";

function log(message) {
  console.log(`[dev-db] ${message}`);
}

function createPostgres(startupMessages) {
  return new EmbeddedPostgres({
    databaseDir,
    user,
    password,
    port,
    persistent: true,
    onLog: (message) => {
      const text = String(message).trim();
      if (text) {
        startupMessages.push(text);
        log(text);
      }
    },
    onError: (message) => {
      const text = String(message).trim();
      if (text) {
        startupMessages.push(text);
        console.error(`[dev-db] ${text}`);
      }
    },
  });
}

async function main() {
  fs.mkdirSync(path.dirname(databaseDir), { recursive: true });

  const startupMessages = [];
  let pg = createPostgres(startupMessages);
  const isInitialised = fs.existsSync(path.join(databaseDir, "PG_VERSION"));

  if (!isInitialised) {
    log(`initialising PostgreSQL data directory at ${databaseDir}`);
    await pg.initialise();
  }

  log(`starting PostgreSQL on localhost:${port}`);
  try {
    await pg.start();
  } catch (error) {
    pg.process = undefined;
    const hasStaleSharedMemory = startupMessages.some((message) => message.includes("pre-existing shared memory block is still in use"));
    if (!hasStaleSharedMemory || process.platform !== "win32") throw error;

    log("detected a stale PostgreSQL process; attempting project-scoped recovery");
    const terminated = await terminateStaleProjectPostgres(databaseDir);
    if (!terminated.length) {
      throw new Error("检测到 PostgreSQL 共享内存残留，但无法定位本项目的旧进程；请关闭旧的预览终端或重启 Windows 后重试", { cause: error });
    }
    log(`terminated stale PostgreSQL process: ${terminated.join(", ")}`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    startupMessages.length = 0;
    pg = createPostgres(startupMessages);
    await pg.start();
  }

  log(`ready: postgres://${user}:${password}@localhost:${port}/${database}?sslmode=disable`);
  if (process.connected) {
    process.send({ type: "ready", port });
  }

  let shutdownStarted = false;
  const shutdown = async () => {
    if (shutdownStarted) {
      return;
    }

    shutdownStarted = true;
    log("stopping PostgreSQL");
    await stopPostgresGracefully(pg, databaseDir);
  };

  const shutdownAndExit = async (exitCode) => {
    try {
      await shutdown();
      if (process.connected) {
        process.send({ type: "stopped" });
      }
      process.exit(exitCode);
    } catch (error) {
      console.error("[dev-db] failed to stop local PostgreSQL cleanly");
      console.error(error);
      process.exit(1);
    }
  };

  process.on("message", (message) => {
    if (message?.type === "shutdown") {
      void shutdownAndExit(0);
    }
  });

  process.once("SIGINT", () => {
    void shutdownAndExit(0);
  });
  process.once("SIGTERM", () => {
    void shutdownAndExit(0);
  });

  await new Promise(() => {});
}

main().catch((error) => {
  console.error("[dev-db] failed to start local PostgreSQL");
  console.error(error);
  if (process.connected) {
    process.send({ type: "failed", message: error instanceof Error ? error.message : "本地 PostgreSQL 启动失败" });
  }
  process.exit(1);
});
