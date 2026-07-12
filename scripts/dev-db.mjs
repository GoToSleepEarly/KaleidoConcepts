#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import EmbeddedPostgres from "embedded-postgres";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const databaseDir = process.env.DEV_DATABASE_DIR || path.join(rootDir, ".local", "postgres");
const port = Number(process.env.DEV_DATABASE_PORT || "51214");
const user = process.env.DEV_DATABASE_USER || "postgres";
const password = process.env.DEV_DATABASE_PASSWORD || "postgres";
const database = process.env.DEV_DATABASE_NAME || "postgres";

function log(message) {
  console.log(`[dev-db] ${message}`);
}

function createPostgres() {
  return new EmbeddedPostgres({
    databaseDir,
    user,
    password,
    port,
    persistent: true,
    onLog: (message) => {
      const text = String(message).trim();
      if (text) {
        log(text);
      }
    },
    onError: (message) => {
      const text = String(message).trim();
      if (text) {
        console.error(`[dev-db] ${text}`);
      }
    },
  });
}

async function main() {
  fs.mkdirSync(path.dirname(databaseDir), { recursive: true });

  const pg = createPostgres();
  const isInitialised = fs.existsSync(path.join(databaseDir, "PG_VERSION"));

  if (!isInitialised) {
    log(`initialising PostgreSQL data directory at ${databaseDir}`);
    await pg.initialise();
  }

  log(`starting PostgreSQL on localhost:${port}`);
  await pg.start();

  log(`ready: postgres://${user}:${password}@localhost:${port}/${database}?sslmode=disable`);

  let shutdownStarted = false;
  const shutdown = async () => {
    if (shutdownStarted) {
      return;
    }

    shutdownStarted = true;
    log("stopping PostgreSQL");
    await pg.stop();
  };

  process.once("SIGINT", async () => {
    await shutdown();
    process.exit(0);
  });
  process.once("SIGTERM", async () => {
    await shutdown();
    process.exit(0);
  });

  await new Promise(() => {});
}

main().catch((error) => {
  console.error("[dev-db] failed to start local PostgreSQL");
  console.error(error);
  process.exit(1);
});
