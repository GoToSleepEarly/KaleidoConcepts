import pg from "pg";

const { Client } = pg;

const BASELINE_MIGRATION = "20260820000000_baseline";
const LEGACY_HEAD_MIGRATION = "20260819030000_replace_ai_gateways_with_crazyrouter";
const BASELINE_SCHEMA_SIGNATURE = [
  "User.aiGateway",
  "Course.visualQuality",
  "CourseStorySetting.operationStatus",
  "CourseImage.failureCode",
  "CoursePresentation.slideOverrides",
];

export function assessLegacyBaseline({ migrations, columns }) {
  if (migrations.some((migration) => migration.migrationName === BASELINE_MIGRATION && migration.finished && !migration.rolledBack)) {
    return { action: "none" };
  }

  const failedBaseline = migrations.find((migration) => (
    migration.migrationName === BASELINE_MIGRATION && !migration.finished && !migration.rolledBack
  ));
  if (!failedBaseline) return { action: "none" };

  const logs = failedBaseline.logs ?? "";
  if (!logs.includes("AiGateway") || !logs.includes("already exists")) {
    throw new Error("本地 baseline migration 失败，但不是已知的本地基线重复执行问题；未自动修改 migration 历史");
  }

  const hasLegacyHead = migrations.some((migration) => (
    migration.migrationName === LEGACY_HEAD_MIGRATION && migration.finished && !migration.rolledBack
  ));
  const availableColumns = new Set(columns);
  const missingColumns = BASELINE_SCHEMA_SIGNATURE.filter((column) => !availableColumns.has(column));
  if (!hasLegacyHead || missingColumns.length) {
    const details = [
      !hasLegacyHead ? `缺少旧 migration 终点 ${LEGACY_HEAD_MIGRATION}` : null,
      missingColumns.length ? `缺少字段 ${missingColumns.join(", ")}` : null,
    ].filter(Boolean).join("；");
    throw new Error(`本地旧库结构校验未通过（${details}）；未自动修改 migration 历史`);
  }

  return { action: "resolve", migrationName: BASELINE_MIGRATION };
}

export async function recoverLocalMigrationHistory(databaseUrl, resolveMigration) {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 2_000 });
  try {
    await client.connect();
    const migrationResult = await client.query(`
      SELECT
        migration_name AS "migrationName",
        finished_at IS NOT NULL AS "finished",
        rolled_back_at IS NOT NULL AS "rolledBack",
        logs
      FROM "_prisma_migrations"
      ORDER BY started_at
    `).catch((error) => {
      if (error?.code === "42P01") return { rows: [] };
      throw error;
    });
    const columnResult = await client.query(`
      SELECT table_name || '.' || column_name AS column
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `);
    const assessment = assessLegacyBaseline({
      migrations: migrationResult.rows,
      columns: columnResult.rows.map((row) => row.column),
    });
    if (assessment.action === "resolve") await resolveMigration(assessment.migrationName);
    return assessment;
  } finally {
    await client.end().catch(() => undefined);
  }
}
