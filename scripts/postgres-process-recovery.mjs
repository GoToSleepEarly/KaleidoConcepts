import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function matchingPostgresProcessIds(processes, databaseDir) {
  const target = path.resolve(databaseDir).toLowerCase();
  return processes
    .filter((processInfo) => {
      const name = String(processInfo.Name || processInfo.name || "").toLowerCase();
      const commandLine = String(processInfo.CommandLine || processInfo.commandLine || "").toLowerCase();
      return name === "postgres.exe" && commandLine.includes(target);
    })
    .map((processInfo) => Number(processInfo.ProcessId || processInfo.processId))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

async function windowsProcesses() {
  const command = [
    "$items = @(Get-CimInstance Win32_Process -Filter \"Name = 'postgres.exe'\" | Select-Object Name, ProcessId, CommandLine)",
    "if ($items.Count -eq 0) { '[]' } else { $items | ConvertTo-Json -Compress }",
  ].join("; ");
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
    windowsHide: true,
  });
  const parsed = JSON.parse(stdout.trim() || "[]");
  return Array.isArray(parsed) ? parsed : [parsed];
}

export async function terminateStaleProjectPostgres(databaseDir) {
  if (process.platform !== "win32") return [];
  const processIds = matchingPostgresProcessIds(await windowsProcesses(), databaseDir);
  for (const pid of processIds) {
    await execFileAsync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
    }).catch(() => undefined);
  }
  return processIds;
}

export async function stopPostgresGracefully(postgres, databaseDir) {
  const postgresProcess = postgres.process;
  if (!postgresProcess?.spawnfile || postgresProcess.exitCode !== null) {
    postgres.process = undefined;
    return;
  }

  const pgCtlName = process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl";
  const pgCtlPath = path.join(path.dirname(postgresProcess.spawnfile), pgCtlName);
  await execFileAsync(pgCtlPath, ["stop", "-D", databaseDir, "-m", "fast", "-w", "-t", "15"], {
    encoding: "utf8",
    windowsHide: true,
  });
  postgres.process = undefined;
}
