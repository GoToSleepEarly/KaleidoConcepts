import { NextResponse } from "next/server";
import { z } from "zod";

import { mockAuth } from "@/lib/auth-session";

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export async function POST(request: Request) {
  const payload = loginSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ message: "账号或密码错误" }, { status: 401 });
  }

  const { username, password } = payload.data;

  if (username !== mockAuth.username || password !== mockAuth.password) {
    return NextResponse.json({ message: "账号或密码错误" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      displayName: mockAuth.displayName,
    },
    createdAt: new Date().toISOString(),
  });
}
