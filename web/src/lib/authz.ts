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

/** Returns the current session user, or null if not signed in. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as SessionUser) ?? null;
}

/** Throws unless the caller is signed in; returns the user. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("Unauthorized: you must be signed in.");
  }
  return user;
}

/** Throws unless the caller is signed in with the given role; returns the user. */
export async function requireRole(role: SessionUser["role"]): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== role) {
    throw new Error(`Unauthorized: ${role} access required.`);
  }
  return user;
}

/** Throws unless the caller is an admin; returns the user. */
export async function requireAdmin(): Promise<SessionUser> {
  return requireRole("admin");
}
