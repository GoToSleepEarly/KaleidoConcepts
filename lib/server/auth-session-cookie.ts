import { createHmac, timingSafeEqual } from "node:crypto";

import { AUTH_USER_COOKIE, REMEMBERED_AUTH_MAX_AGE_SECONDS } from "@/lib/auth-cookie";

type SessionPayload = {
  userId: string;
  issuedAt: number;
  expiresAt: number;
};

export type AuthSessionReadResult =
  | { status: "missing" }
  | { status: "upgrade_required" }
  | { status: "invalid" }
  | { status: "valid"; userId: string };

function sessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SESSION_SECRET must contain at least 32 characters");
  }
  return secret;
}

function signature(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function cookieValue(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const encoded = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_USER_COOKIE}=`))
    ?.slice(AUTH_USER_COOKIE.length + 1);
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return "";
  }
}

export function createSignedAuthSession(userId: string, nowSeconds = Math.floor(Date.now() / 1_000)) {
  if (!userId) throw new Error("Cannot create an auth session without a user id");
  const payload: SessionPayload = {
    userId,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + REMEMBERED_AUTH_MAX_AGE_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signedValue = `v1.${encodedPayload}`;
  return `${signedValue}.${signature(signedValue)}`;
}

export function readAuthSession(request: Request, nowSeconds = Math.floor(Date.now() / 1_000)): AuthSessionReadResult {
  const token = cookieValue(request);
  if (token === null) return { status: "missing" };
  if (!token.startsWith("v1.")) return { status: "upgrade_required" };

  try {
    const [version, encodedPayload, receivedSignature, extra] = token.split(".");
    if (version !== "v1" || !encodedPayload || !receivedSignature || extra) return { status: "invalid" };
    const expectedSignature = signature(`${version}.${encodedPayload}`);
    const received = Buffer.from(receivedSignature, "utf8");
    const expected = Buffer.from(expectedSignature, "utf8");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return { status: "invalid" };

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (typeof payload.userId !== "string" || !payload.userId || !Number.isInteger(payload.issuedAt) || !Number.isInteger(payload.expiresAt)) {
      return { status: "invalid" };
    }
    if ((payload.issuedAt as number) > nowSeconds + 60 || (payload.expiresAt as number) <= nowSeconds) return { status: "invalid" };
    return { status: "valid", userId: payload.userId };
  } catch {
    return { status: "invalid" };
  }
}

export function authenticatedUserId(request: Request) {
  const result = readAuthSession(request);
  return result.status === "valid" ? result.userId : null;
}
