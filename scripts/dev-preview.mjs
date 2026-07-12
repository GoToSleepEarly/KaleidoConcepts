#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

import { cleanNextCache } from "./next-cache.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const databaseUrl = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:51214/template1?sslmode=disable";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
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

function waitForPort(port, host, timeoutMs) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ port, host });

      socket.once("connect", () => {
        socket.end();
        resolve();
      });

      socket.once("error", () => {
        socket.destroy();

        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${host}:${port}`));
          return;
        }

        setTimeout(tryConnect, 250);
      });
    };

    tryConnect();
  });
}

async function main() {
  const dbProcess = spawn(process.execPath, ["scripts/dev-db.mjs"], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });

  let dbStopRequested = false;
  const stopDb = () => {
    if (!dbStopRequested && !dbProcess.killed) {
      dbStopRequested = true;
      dbProcess.kill("SIGTERM");
    }
  };

  process.once("SIGINT", () => {
    stopDb();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    stopDb();
    process.exit(143);
  });
  process.once("exit", stopDb);

  dbProcess.once("exit", (code) => {
    if (code && code !== 0) {
      process.exit(code);
    }
  });

  await waitForPort(51214, "127.0.0.1", 30_000);
  await run("pnpm", ["prisma:generate"]);
  await run("pnpm", ["prisma:deploy"]);
  await run("pnpm", ["prisma:seed"]);
  console.log("[dev-preview] cleaning stale Next.js build cache");
  await cleanNextCache(rootDir);
  await run("pnpm", ["dev"]);
}

main().catch((error) => {
  console.error(`[dev-preview] ${error.message}`);
  process.exit(1);
});
