import { NextResponse } from "next/server";

import { AiGatewayAuthenticationError } from "@/lib/server/ai/request-gateway";

export function authenticationErrorResponse(error: unknown) {
  return error instanceof AiGatewayAuthenticationError
    ? NextResponse.json({ message: error.message }, { status: 401 })
    : null;
}
