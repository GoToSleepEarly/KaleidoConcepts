import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

const scriptPath = path.resolve(process.cwd(), "scripts/deploy-shared-host.sh");
const updateScriptPath = path.resolve(process.cwd(), "scripts/update-production.sh");
const servicePath = path.resolve(process.cwd(), "deploy/pbl-v2-deploy.service");

describe("共享主机安全发布", () => {
  test("构建成功后才备份和迁移，并在健康检查后切换 current", async () => {
    const script = await fs.readFile(scriptPath, "utf8");

    const build = script.indexOf('pnpm build');
    const backup = script.indexOf('echo "==> Backing up database and images"');
    const migrate = script.indexOf('pnpm prisma:deploy');
    const health = script.indexOf('if ! health_check; then');
    const switchCurrent = script.indexOf('mv -Tf "$NEXT_LINK" "$CURRENT_LINK"');

    expect(build).toBeGreaterThan(-1);
    expect(build).toBeLessThan(backup);
    expect(backup).toBeLessThan(migrate);
    expect(migrate).toBeLessThan(health);
    expect(health).toBeLessThan(switchCurrent);
  });

  test("只允许操作重构版资源，并拒绝并发发布", async () => {
    const script = await fs.readFile(scriptPath, "utf8");

    expect(script).toContain('EXPECTED_APP_NAME="pbl-studio-v2"');
    expect(script).toContain('DEPLOYMENT_TARGET:-}" == "shared-host"');
    expect(script).toContain('EXPECTED_DATABASE_NAME="pbl_studio_v2"');
    expect(script).toContain('EXPECTED_STORAGE_DIR="$APP_ROOT/images"');
    expect(script).toContain('flock -n 9');
    expect(script).not.toContain("/home/ubuntu");
    expect(script).not.toContain("rm -rf");
  });

  test("systemd 对部署任务设置资源硬边界且不会开机自动发布", async () => {
    const service = await fs.readFile(servicePath, "utf8");

    expect(service).toContain("User=pblv2");
    expect(service).toContain("CPUQuota=50%");
    expect(service).toContain("MemoryHigh=768M");
    expect(service).toContain("MemoryMax=1200M");
    expect(service).toContain("IOSchedulingClass=idle");
    expect(service).not.toContain("[Install]");
  });

  test("一键入口先检查 Swap 和旧 PM2，再同步 service 并阻塞等待发布结果", async () => {
    const updateScript = await fs.readFile(updateScriptPath, "utf8");

    const swapCheck = updateScript.indexOf("SwapTotal:");
    const oldServiceCheck = updateScript.indexOf("pm2-ubuntu.service");
    const installService = updateScript.indexOf('install -m 0644 "$UNIT_SOURCE" "$SERVICE_FILE"');
    const startService = updateScript.indexOf('systemctl start "$SERVICE_NAME"');
    const healthCheck = updateScript.indexOf("http://127.0.0.1:3100/login");

    expect(swapCheck).toBeGreaterThan(-1);
    expect(swapCheck).toBeLessThan(oldServiceCheck);
    expect(oldServiceCheck).toBeLessThan(installService);
    expect(installService).toBeLessThan(startService);
    expect(startService).toBeLessThan(healthCheck);
  });
});
