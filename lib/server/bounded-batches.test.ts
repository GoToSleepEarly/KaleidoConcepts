import { describe, expect, test, vi } from "vitest";

import { runBoundedBatches } from "./bounded-batches";

describe("有上限的批量任务", () => {
  test("按配置并发执行并保持结果顺序", async () => {
    let active = 0;
    let maxActive = 0;
    const releases: Array<() => void> = [];
    const worker = vi.fn(async (value: number) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return value * 10;
    });

    const pending = runBoundedBatches([1, 2, 3, 4], 3, worker, () => false);
    await vi.waitFor(() => expect(worker).toHaveBeenCalledTimes(3));
    expect(maxActive).toBe(3);
    releases.splice(0).forEach((release) => release());
    await vi.waitFor(() => expect(worker).toHaveBeenCalledTimes(4));
    releases.splice(0).forEach((release) => release());

    await expect(pending).resolves.toEqual([10, 20, 30, 40]);
  });

  test("当前批次失败互不影响，命中停止条件后不提交下一批", async () => {
    const worker = vi.fn(async (value: number) => ({ value, blocked: value === 2 }));

    const results = await runBoundedBatches([1, 2, 3, 4, 5], 3, worker, (result) => result.blocked);

    expect(results).toEqual([
      { value: 1, blocked: false },
      { value: 2, blocked: true },
      { value: 3, blocked: false },
    ]);
    expect(worker).toHaveBeenCalledTimes(3);
  });
});
