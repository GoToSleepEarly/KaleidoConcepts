import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/server/db";
import { verifyTeacherLogin } from "@/lib/server/repositories/auth";
import { AUTH_USER_COOKIE, REMEMBERED_AUTH_MAX_AGE_SECONDS } from "@/lib/auth-cookie";

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
  remember: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const payload = loginSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ message: "账号或密码错误" }, { status: 401 });
  }

  try {
    const user = await verifyTeacherLogin(getDb(), payload.data);

    if (!user) {
      return NextResponse.json({ message: "账号或密码错误" }, { status: 401 });
    }

    const response = NextResponse.json({
      user,
      createdAt: new Date().toISOString(),
    });
    response.cookies.set(AUTH_USER_COOKIE, user.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      ...(payload.data.remember ? { maxAge: REMEMBERED_AUTH_MAX_AGE_SECONDS } : {}),
    });
    return response;
  } catch {
    return NextResponse.json({ message: "登录服务暂不可用" }, { status: 500 });
  }
}
