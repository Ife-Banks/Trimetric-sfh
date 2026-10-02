import "server-only";

// Shared server-side error helpers.
//
// SEC-14 (05_SECURITY_ASSESSMENT.md): raw Postgres error text must never reach
// a client. Supabase/PostgREST messages leak schema detail — table names,
// column names, constraint names, sometimes row values. It was returned
// verbatim from all four write routes.
//
// The detail is logged server-side and correlated with a short opaque id the
// caller can quote in a bug report, so operators keep the diagnostic without
// the client gaining it.

import { randomUUID } from "node:crypto";

export function correlationId(): string {
  return randomUUID().slice(0, 8);
}

/**
 * Log the real error server-side and return a generic response.
 *
 * `code` is a stable, non-revealing identifier the client can branch on
 * ("insert_failed"); `message` is safe to display.
 */
export function serverError(
  operation: string,
  error: unknown,
  status: number,
  code: string,
  message: string,
  correlation: string
): Response {
  const detail =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { message: String(error) };
  console.error(`[${correlation}] ${operation} failed`, detail);

  return Response.json(
    { error: code, message, correlation },
    { status, headers: { "X-Correlation-Id": correlation } }
  );
}
