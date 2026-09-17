import { NextResponse } from "next/server";

import { AUTH_USER_COOKIE, authCookieSecure } from "@/lib/auth-cookie";
import { getDb } from "@/lib/server/db";
import { readAuthSession } from "@/lib/server/auth-session-cookie";

function clearSession(response: NextResponse) {
  response.cookies.set(AUTH_USER_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: authCookieSecure(),
    maxAge: 0,
  });
  return response;
}

export async function GET(request: Request) {
  const auth = readAuthSession(request);
  if (auth.status === "missing") {
    return NextResponse.json({ code: "AUTH_SESSION_MISSING" }, { status: 401 });
  }
  if (auth.status === "upgrade_required") {
    return clearSession(NextResponse.json({ code: "AUTH_SESSION_UPGRADE_REQUIRED" }, { status: 401 }));
  }
  if (auth.status === "invalid") {
    return clearSession(NextResponse.json({ code: "AUTH_SESSION_INVALID" }, { status: 401 }));
  }

  const user = await getDb().user.findUnique({ where: { id: auth.userId } });
  if (!user) {
    return clearSession(NextResponse.json({ code: "AUTH_SESSION_INVALID" }, { status: 401 }));
  }
  return NextResponse.json({
    user: { id: user.id, displayName: user.displayName },
    createdAt: new Date().toISOString(),
  });
}
