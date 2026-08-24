import { NextResponse } from "next/server";

import { AUTH_USER_COOKIE } from "@/lib/auth-cookie";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(AUTH_USER_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
  return response;
}
