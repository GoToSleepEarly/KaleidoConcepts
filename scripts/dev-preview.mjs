#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { cleanNextCache } from "./next-cache.mjs";
import { createGracefulChildStopper } from "./child-process-lifecycle.mjs";
import { findAvailableDatabasePort, waitForDatabaseChildReady } from "./dev-database-lifecycle.mjs";
import { recoverLocalMigrationHistory } from "./local-migration-recovery.mjs";

const { Client } = pg;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const preferredDatabasePort = Number(process.env.DEV_DATABASE_PORT || "51215");
const databaseName = process.env.DEV_DATABASE_NAME || "postgres";
const databaseUser = process.env.DEV_DATABASE_USER || "postgres";
const databasePassword = process.env.DEV_DATABASE_PASSWORD || "postgres";
const storageDir = process.env.STORAGE_DIR || path.join(rootDir, ".local", "storage-app");

function databaseUrlForPort(port) {
  return `postgres://${encodeURIComponent(databaseUser)}:${encodeURIComponent(databasePassword)}@127.0.0.1:${port}/${encodeURIComponent(databaseName)}?sslmode=disable`;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options,
      env: {
        ...process.env,
        STORAGE_DIR: storageDir,
        ...options.env,
      },
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with ${signal || `exit code ${code}`}`));
    });
  });
}

async function canQueryDatabase(databaseUrl, timeoutMs = 1_500) {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: timeoutMs });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function waitForDatabaseQuery(databaseUrl, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (await canQueryDatabase(databaseUrl)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("本地 PostgreSQL 已启动，但健康检查未通过");
}

function spawnDatabase(port, databaseUrl) {
  return spawn(process.execPath, ["scripts/dev-db.mjs"], {
    stdio: ["inherit", "inherit", "inherit", "ipc"],
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DEV_DATABASE_PORT: String(port),
      DEV_DATABASE_USER: databaseUser,
      DEV_DATABASE_PASSWORD: databasePassword,
      DEV_DATABASE_NAME: databaseName,
      STORAGE_DIR: storageDir,
    },
  });
}

async function startLocalDatabase() {
  const preferredUrl = databaseUrlForPort(preferredDatabasePort);
  if (await canQueryDatabase(preferredUrl)) {
    console.log(`[dev-preview] reusing healthy PostgreSQL on 127.0.0.1:${preferredDatabasePort}`);
    return { child: null, port: preferredDatabasePort, stop: async () => {}, url: preferredUrl };
  }

  let nextPort = preferredDatabasePort;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const port = await findAvailableDatabasePort(nextPort);
    const databaseUrl = databaseUrlForPort(port);
    if (port !== preferredDatabasePort) {
      console.warn(`[dev-preview] port ${preferredDatabasePort} is occupied or unhealthy; trying PostgreSQL on ${port}`);
    }

    const child = spawnDatabase(port, databaseUrl);
    const stop = createGracefulChildStopper(child);
    try {
      await waitForDatabaseChildReady(child);
      await waitForDatabaseQuery(databaseUrl);
      return { child, port, stop, url: databaseUrl };
    } catch (error) {
      lastError = error;
      console.warn(`[dev-preview] PostgreSQL startup attempt ${attempt} failed: ${error.message}`);
      await stop().catch(() => undefined);
      if (error.message.includes("共享内存残留") || error.message.includes("关闭旧的预览终端")) {
        throw error;
      }
      nextPort = port + 1;
    }
  }

  throw new Error("本地 PostgreSQL 连续三次启动失败", { cause: lastError });
}

async function main() {
  const database = await startLocalDatabase();
  const stopDb = database.stop;
  let shutdownStarted = false;
  const shutdownAndExit = async (exitCode) => {
    if (shutdownStarted) {
      return;
    }

    shutdownStarted = true;
    try {
      await stopDb();
    } catch (error) {
      console.error(`[dev-preview] ${error.message}`);
    }
    process.exit(exitCode);
  };

  process.once("SIGINT", () => {
    void shutdownAndExit(130);
  });
  process.once("SIGTERM", () => {
    void shutdownAndExit(143);
  });

  database.child?.once("exit", (code) => {
    if (!shutdownStarted) process.exit(code || 1);
  });

  const runtimeOptions = { env: { DATABASE_URL: database.url } };
  await run("pnpm", ["prisma:generate"], runtimeOptions);
  const recovery = await recoverLocalMigrationHistory(database.url, async (migrationName) => {
    console.warn(`[dev-preview] verified legacy local schema; resolving squashed baseline ${migrationName}`);
    await run("pnpm", ["exec", "prisma", "migrate", "resolve", "--applied", migrationName], runtimeOptions);
  });
  if (recovery.action === "resolve") console.log("[dev-preview] local migration history reconciled; existing data was preserved");
  await run("pnpm", ["prisma:deploy"], runtimeOptions);
  await run("pnpm", ["prisma:seed"], runtimeOptions);
  console.log("[dev-preview] cleaning stale Next.js build cache");
  await cleanNextCache(rootDir);
  try {
    await run("pnpm", ["dev"], runtimeOptions);
  } finally {
    await stopDb();
  }
}

main().catch((error) => {
  console.error(`[dev-preview] ${error.message}`);
  process.exit(1);
});
