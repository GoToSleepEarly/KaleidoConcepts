import { describe, expect, it } from "vitest";

import {
  buildVisualRevisionChain,
  resolveVisualWorkspaceMode,
} from "@/lib/people/visual-workspace";

const visual = (
  id: string,
  parentAssetId: string | null,
  status: "succeeded" | "failed" = "succeeded",
) => ({ id, parentAssetId, status });

describe("人物形象工作台", () => {
  it("没有任何版本时进入首次创建态", () => {
    expect(resolveVisualWorkspaceMode([])).toBe("create");
  });

  it("成功版本进入结果态，失败尝试不进入历史工作区", () => {
    expect(resolveVisualWorkspaceMode([visual("root", null)])).toBe("refine");
    expect(resolveVisualWorkspaceMode([visual("failed", null, "failed")])).toBe(
      "create",
    );
  });

  it("只展示当前选中版本所在的修改链", () => {
    const chain = buildVisualRevisionChain(
      [
        visual("branch", "root"),
        visual("latest", "revision"),
        visual("revision", "root"),
        visual("root", null),
      ],
      "latest",
    );

    expect(chain.map((item) => item.id)).toEqual([
      "root",
      "revision",
      "latest",
    ]);
  });
});
