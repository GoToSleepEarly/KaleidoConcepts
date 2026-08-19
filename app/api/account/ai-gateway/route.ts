import { NextResponse } from "next/server";
import { z } from "zod";

import { AI_GATEWAY_COOKIE, AUTH_USER_COOKIE } from "@/lib/ai-gateway";
import { getDb } from "@/lib/server/db";

const inputSchema = z.object({ aiGateway: z.enum(["quickrouter", "crazyrouter"]) }).strict();

function userId(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie.split(";").map((part) => part.trim().split("=")).find(([name]) => name === AUTH_USER_COOKIE)?.[1] ?? null;
}

export async function GET(request: Request) {
  const id = userId(request);
  if (!id) return NextResponse.json({ message: "请重新登录后设置中转站" }, { status: 401 });
  const user = await getDb().user.findUnique({ where: { id } });
  if (!user) return NextResponse.json({ message: "账号不存在" }, { status: 404 });
  return NextResponse.json({ aiGateway: user.aiGateway });
}

export async function PATCH(request: Request) {
  const id = userId(request);
  if (!id) return NextResponse.json({ message: "请重新登录后设置中转站" }, { status: 401 });
  const input = inputSchema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ message: "中转站设置无效" }, { status: 400 });
  const user = await getDb().user.update({ where: { id }, data: { aiGateway: input.data.aiGateway } });
  const response = NextResponse.json({ aiGateway: user.aiGateway });
  response.cookies.set(AI_GATEWAY_COOKIE, user.aiGateway, { httpOnly: true, sameSite: "lax", path: "/" });
  return response;
}
