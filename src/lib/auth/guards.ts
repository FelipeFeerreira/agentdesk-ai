import { redirect } from "next/navigation";
import { getCurrentSession } from "./session";
import type { SessionPayload } from "./session";

export async function requireUser(): Promise<SessionPayload> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireRole(
  roles: SessionPayload["role"][],
): Promise<SessionPayload> {
  const session = await requireUser();
  if (!roles.includes(session.role)) redirect("/overview");
  return session;
}

export async function requireAdmin(): Promise<SessionPayload> {
  return requireRole(["OWNER", "ADMIN"]);
}
