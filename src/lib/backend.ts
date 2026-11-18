import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { configured, serverClient } from "./supabase/server";
import { readState } from "./repository";
import { SESSION_COOKIE } from "./auth";
import type { Command } from "./commands";
export async function getState(userId: string, date?: string) {
  return configured()
    ? readState(await serverClient(), userId, date)
    : (await import("./local-database")).localState(userId, date);
}
export async function takeAIToken(userId: string) {
  if (!configured())
    return (await import("./local-database")).localAIToken(userId);
  const { data, error } = await (await serverClient()).rpc("take_ai_token");
  return !error && data === true;
}
export async function execute(userId: string, c: Command) {
  if (!configured()) {
    const local = await import("./local-database");
    if (c.action === "delete-account") await local.deleteLocalUser(userId);
    else if (c.action === "signout")
      await local.revokeLocalSession(
        (await cookies()).get(SESSION_COOKIE)?.value,
      );
    else await local.localCommand(userId, c);
    if (c.action === "signout" || c.action === "delete-account")
      (await cookies()).delete(SESSION_COOKIE);
    return;
  }
  const db = await serverClient();
  let result: { error: unknown } = { error: null };
  switch (c.action) {
    case "preferences":
      result = await db.rpc("save_preferences", { p: c.value });
      break;
    case "inventory":
      result = await db.rpc("change_inventory", {
        item: c.value,
        remove_item: c.remove ?? false,
      });
      break;
    case "plan":
      result = await db.rpc("save_plan", { d: c.date, entries: c.entries });
      break;
    case "cook":
      result = await db.rpc("confirm_cooking", {
        entry: c.id,
        actual: c.actual,
      });
      break;
    case "eaten":
      result = await db.rpc("log_eaten", { entry: c.id });
      break;
    case "purchase":
      result = await db.rpc("purchase_item", { item_id: c.id });
      break;
    case "shopping":
      if (c.items.length)
        result = await db
          .from("shopping_items")
          .upsert(c.items.map((i) => ({ ...i, user_id: userId })));
      break;
    case "remove-shopping":
      result = await db
        .from("shopping_items")
        .delete()
        .eq("id", c.id)
        .eq("user_id", userId);
      break;
    case "signout":
      result = await db.auth.signOut();
      break;
    case "delete-account": {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
        throw Error(
          "Account deletion is not configured. Contact the operator.",
        );
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      result = await admin.auth.admin.deleteUser(userId);
      if (!result.error) await db.auth.signOut();
      break;
    }
  }
  if (result.error)
    throw Error(
      "The change could not be saved. Refresh and check your stock before retrying.",
    );
}
