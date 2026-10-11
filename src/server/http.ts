import { ZodError } from "zod";

import { DesignIntegrityError } from "@/lib/design/integrity";
import { ScaffoldError } from "@/lib/design/scaffold";
import { AppError, type AppErrorCode } from "@/server/errors";

export const MAX_DESIGN_BYTES = 5 * 1024 * 1024;
export const MAX_JSON_BYTES = 1024 * 1024;

const STATUS: Record<AppErrorCode, number> = {
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION: 422,
  UNAUTHORIZED: 401,
  PAYLOAD_TOO_LARGE: 413,
};

function body(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json(body(error.code, error.message, error.details), {
      status: STATUS[error.code],
    });
  }
  if (error instanceof DesignIntegrityError) {
    return Response.json(body("VALIDATION", error.message, error.issues), { status: 422 });
  }
  if (error instanceof ScaffoldError) {
    return Response.json(body("VALIDATION", error.message), { status: 422 });
  }
  if (error instanceof ZodError) {
    return Response.json(body("VALIDATION", "Invalid input", error.issues), { status: 422 });
  }
  console.error("[api]", error);
  return Response.json(body("INTERNAL", "Internal error"), { status: 500 });
}

/** Reads a JSON request body, rejecting anything over `maxBytes` with PAYLOAD_TOO_LARGE. */
export async function readJson(request: Request, maxBytes = MAX_JSON_BYTES): Promise<unknown> {
  const tooLarge = () =>
    new AppError("PAYLOAD_TOO_LARGE", `Request body is larger than ${maxBytes} bytes`);
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();

  const reader = request.body?.getReader();
  if (!reader) throw new AppError("VALIDATION", "Request body is empty");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("VALIDATION", "Request body is not valid JSON");
  }
}

/** Parses ?version=draft|latest|N; anything else is a VALIDATION error. */
export function parseVersionRef(value: string | null): "draft" | "latest" | number {
  if (value === null || value === "" || value === "draft") return "draft";
  if (value === "latest") return "latest";
  const n = Number(value);
  if (Number.isInteger(n) && n > 0) return n;
  throw new AppError("VALIDATION", `Invalid version "${value}". Use draft, latest or a number.`);
}

/** A same-origin redirect. Relative, so it works whatever host the request came in on. */
export const redirectTo = (path: string) =>
  new Response(null, { status: 303, headers: { Location: path } });
