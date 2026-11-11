import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requestId } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { TenantError } from "@/lib/tenant";
import { ZodError } from "zod";

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiError(401, "Non authentifié");
  }
  return session;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function jsonOk<T>(data: T, init?: { status?: number; requestId?: string }) {
  return NextResponse.json(
    { ok: true, data, requestId: init?.requestId },
    { status: init?.status ?? 200 },
  );
}

export function jsonError(
  error: unknown,
  fields: { requestId?: string; storeId?: string } = {},
) {
  const rid = fields.requestId || requestId();
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        ok: false,
        error: "Validation error",
        details: error.flatten(),
        requestId: rid,
      },
      { status: 400 },
    );
  }
  if (error instanceof ApiError) {
    return NextResponse.json(
      { ok: false, error: error.message, requestId: rid },
      { status: error.status },
    );
  }
  if (error instanceof TenantError) {
    return NextResponse.json(
      { ok: false, error: error.message, requestId: rid },
      { status: 403 },
    );
  }
  const message = error instanceof Error ? error.message : "Erreur serveur";
  logger.error("api.error", {
    requestId: rid,
    storeId: fields.storeId,
    error: message,
  });
  return NextResponse.json(
    { ok: false, error: message, requestId: rid },
    { status: 500 },
  );
}

export function withRequestId() {
  return requestId();
}
