import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticatedUserId } from "@/lib/auth-cookie";
import { getDb } from "@/lib/server/db";

const inputSchema = z.object({ aiGateway: z.enum(["quickrouter", "crazyrouter"]) }).strict();

export async function GET(request: Request) {
  const id = authenticatedUserId(request);
  if (!id) return NextResponse.json({ message: "请重新登录后设置中转站" }, { status: 401 });
  const user = await getDb().user.findUnique({ where: { id } });
  if (!user) return NextResponse.json({ message: "账号不存在" }, { status: 404 });
  return NextResponse.json({ aiGateway: user.aiGateway });
}

export async function PATCH(request: Request) {
  const id = authenticatedUserId(request);
  if (!id) return NextResponse.json({ message: "请重新登录后设置中转站" }, { status: 401 });
  const input = inputSchema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ message: "中转站设置无效" }, { status: 400 });
  const user = await getDb().user.update({ where: { id }, data: { aiGateway: input.data.aiGateway } });
  return NextResponse.json({ aiGateway: user.aiGateway });
}
