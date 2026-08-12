import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { VisualResourcesInvalidStateError, VisualResourcesNotFoundError } from "@/lib/server/repositories/visual-resources";

export function idempotencyKey(request: Request) {
  const value = request.headers.get("Idempotency-Key")?.trim();
  if (!value || value.length > 100) throw new VisualResourcesInvalidStateError("缺少有效的重复提交保护标识");
  return value;
}

export function visualResourcesError(error: unknown) {
  if (error instanceof VisualResourcesNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
  if (error instanceof VisualResourcesInvalidStateError || error instanceof ZodError) return NextResponse.json({ message: error instanceof ZodError ? error.issues[0]?.message || "请求参数无效" : error.message }, { status: 400 });
  return NextResponse.json({ message: error instanceof Error ? error.message : "视觉资源操作失败" }, { status: 500 });
}
