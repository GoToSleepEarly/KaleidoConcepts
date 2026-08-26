import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticatedUserId } from "@/lib/auth-cookie";
import { AI_GATEWAYS, QUICKROUTER_ENDPOINTS } from "@/lib/ai-gateway";
import { getDb } from "@/lib/server/db";

const inputSchema = z.object({
  aiGateway: z.enum(AI_GATEWAYS),
  quickRouterEndpoint: z.enum(QUICKROUTER_ENDPOINTS).optional(),
}).strict();

export async function GET(request: Request) {
  const id = authenticatedUserId(request);
  if (!id) return NextResponse.json({ message: "请重新登录后设置中转站" }, { status: 401 });
  const user = await getDb().user.findUnique({ where: { id } });
  if (!user) return NextResponse.json({ message: "账号不存在" }, { status: 404 });
  return NextResponse.json({ aiGateway: user.aiGateway, quickRouterEndpoint: user.quickRouterEndpoint });
}

export async function PATCH(request: Request) {
  const id = authenticatedUserId(request);
  if (!id) return NextResponse.json({ message: "请重新登录后设置中转站" }, { status: 401 });
  const input = inputSchema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ message: "中转站设置无效" }, { status: 400 });
  const db = getDb();
  const current = await db.user.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ message: "账号不存在" }, { status: 404 });
  const user = await db.user.update({
    where: { id },
    data: {
      aiGateway: input.data.aiGateway,
      quickRouterEndpoint: input.data.quickRouterEndpoint ?? current.quickRouterEndpoint,
    },
  });
  return NextResponse.json({ aiGateway: user.aiGateway, quickRouterEndpoint: user.quickRouterEndpoint });
}
