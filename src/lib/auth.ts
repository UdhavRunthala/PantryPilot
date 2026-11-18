import "server-only";
import { cookies } from "next/headers";
import { configured, serverClient } from "./supabase/server";
export const SESSION_COOKIE = "pantrypilot_session";
export async function currentUser() {
  if (configured()) {
    const db = await serverClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    return user ? { id: user.id, email: user.email ?? "" } : null;
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const { localUser } = await import("./local-database");
  return localUser(token);
}
