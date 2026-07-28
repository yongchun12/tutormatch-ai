import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

/**
 * Authorization helpers for Server Actions and Route Handlers.
 *
 * Server Actions are independently-invokable endpoints, so page/layout
 * protection is NOT enough — every mutating action must authorize itself.
 * These helpers centralise that check.
 */

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: "student" | "owner" | "admin";
};

/**
 * Thrown when a caller is not signed in (401) or is signed in but lacks the
 * required role (403).
 *
 * A distinct error type matters because most of these call sites sit inside a
 * `try { … } catch { … }` that turns any error into a generic failure. Being
 * able to recognise an authorization failure lets route handlers answer with the
 * correct status code, and lets Server Actions re-throw it instead of quietly
 * swallowing it.
 */
export class AuthorizationError extends Error {
  readonly status: 401 | 403;

  constructor(message: string, status: 401 | 403 = 401) {
    super(message);
    this.name = "AuthorizationError";
    this.status = status;
  }
}

export function isAuthorizationError(error: unknown): error is AuthorizationError {
  return error instanceof AuthorizationError;
}

/**
 * Turn an authorization failure into the right HTTP response, or return null if
 * the error was something else (so the caller can handle it as a 500).
 *
 * Usage in a Route Handler:
 *   catch (error) {
 *     const denied = authorizationErrorResponse(error);
 *     if (denied) return denied;
 *     … existing error handling …
 *   }
 */
export function authorizationErrorResponse(error: unknown): NextResponse | null {
  if (!isAuthorizationError(error)) return null;
  return NextResponse.json({ error: error.message }, { status: error.status });
}

/** Returns the current session user, or null if not signed in. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as SessionUser) ?? null;
}

/** Throws unless the caller is signed in; returns the user. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new AuthorizationError("Unauthorized: you must be signed in.", 401);
  }
  return user;
}

/** Throws unless the caller is signed in with the given role; returns the user. */
export async function requireRole(role: SessionUser["role"]): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== role) {
    throw new AuthorizationError(`Unauthorized: ${role} access required.`, 403);
  }
  return user;
}

/** Throws unless the caller is an admin; returns the user. */
export async function requireAdmin(): Promise<SessionUser> {
  return requireRole("admin");
}

/**
 * Throws unless the caller is signed in with one of the given roles.
 * Used where more than one role may act, e.g. an owner or an admin.
 */
export async function requireAnyRole(
  ...roles: NonNullable<SessionUser["role"]>[]
): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.role || !roles.includes(user.role)) {
    throw new AuthorizationError(
      `Unauthorized: ${roles.join(" or ")} access required.`,
      403
    );
  }
  return user;
}
