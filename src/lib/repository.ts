import "server-only";
import { serverClient } from "./supabase/server";
import { defaults, today, type State, type Entry, type Recipe } from "./domain";
export async function readState(
  db: Awaited<ReturnType<typeof serverClient>>,
  userId: string,
  date = today(),
): Promise<State> {
  const [profile, prefs, goals, inv, shopping, history, plans] =
    await Promise.all([
      db.from("profiles").select("*").eq("id", userId).single(),
      db
        .from("user_preferences")
        .select("data")
        .eq("user_id", userId)
        .maybeSingle(),
      db
        .from("nutrition_goals")
        .select("data")
        .eq("user_id", userId)
        .maybeSingle(),
      db.from("inventory_items").select("*").eq("user_id", userId),
      db.from("shopping_items").select("*").eq("user_id", userId),
      db
        .from("inventory_transactions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("meal_plans")
        .select("id")
        .eq("user_id", userId)
        .eq("plan_date", date)
        .maybeSingle(),
    ]);
  for (const r of [profile, prefs, goals, inv, shopping, history, plans])
    if (r.error)
      throw Error("Unable to load your kitchen. Check database setup.");
  let entries: Entry[] = [];
  if (plans.data) {
    const r = await db
      .from("meal_plan_entries")
      .select("*, recipes(data)")
      .eq("plan_id", plans.data.id)
      .eq("user_id", userId);
    if (r.error) throw Error("Unable to load meals");
    entries = (r.data ?? []).map((e) => ({
      id: e.id,
      slot: e.slot,
      servings: Number(e.servings),
      prepared: e.prepared,
      eaten: e.eaten,
      recipe: (e.recipes as unknown as { data: Recipe }).data,
    }));
  }
  return {
    preferences: {
      ...defaults,
      ...prefs.data?.data,
      name: profile.data.name,
      onboarded: profile.data.onboarded,
      nutrition: goals.data?.data ?? null,
    },
    inventory: inv.data ?? [],
    shopping: shopping.data ?? [],
    history: history.data ?? [],
    entries,
    planDate: date,
  };
}
