import { describe, expect, it } from "vitest";

import {
  formatGenerationWait,
  generationWaitMessage,
} from "@/lib/people/generation-wait";

describe("人物形象生成等待反馈", () => {
  it("按秒和分钟展示稳定的等待时间", () => {
    expect(formatGenerationWait(0)).toBe("0 秒");
    expect(formatGenerationWait(59)).toBe("59 秒");
    expect(formatGenerationWait(60)).toBe("1 分 00 秒");
    expect(formatGenerationWait(125)).toBe("2 分 05 秒");
  });

  it("长等待时给出诚实且可操作的说明", () => {
    expect(generationWaitMessage(5)).toContain("已提交");
    expect(generationWaitMessage(40)).toContain("自动显示");
    expect(generationWaitMessage(100)).toContain("保持页面打开");
  });
});
