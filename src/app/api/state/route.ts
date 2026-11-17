import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { configured, serverClient } from "@/lib/supabase/server";
import { readState } from "@/lib/repository";
import {
  inventorySchema,
  preferencesSchema,
  recipeSchema,
  safety,
  units,
  dimension,
  type Entry,
} from "@/lib/domain";
import { catalog } from "@/lib/catalog";
import { createClient } from "@supabase/supabase-js";
import { nutritionCatalog } from "@/lib/nutrition-server";
const entrySchema = z.object({
  id: z.uuid(),
  slot: z.enum(["Breakfast", "Lunch", "Dinner", "Snack"]),
  recipe: recipeSchema,
  servings: z.number().min(1).max(8),
  prepared: z.boolean(),
  eaten: z.boolean(),
});
const shoppingSchema = z.object({
  id: z.uuid(),
  ingredient_id: z.string(),
  quantity: z.number().positive().max(100000),
  unit: z.enum(units),
  checked: z.boolean(),
  reason: z.string().max(100),
});
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preferences"), value: preferencesSchema }),
  z.object({
    action: z.literal("inventory"),
    value: inventorySchema,
    remove: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("plan"),
    date: z.iso.date(),
    entries: z.array(entrySchema).max(12),
  }),
  z.object({
    action: z.literal("cook"),
    id: z.uuid(),
    actual: z.array(recipeSchema.shape.ingredients.element).min(1).max(25),
  }),
  z.object({ action: z.literal("eaten"), id: z.uuid() }),
  z.object({
    action: z.literal("shopping"),
    items: z.array(shoppingSchema).max(100),
  }),
  z.object({ action: z.enum(["remove-shopping", "purchase"]), id: z.uuid() }),
  z.object({ action: z.enum(["signout", "delete-account"]) }),
]);
export async function GET(req: NextRequest) {
  if (!configured())
    return NextResponse.json(
      { error: "Cloud storage is not configured" },
      { status: 503 },
    );
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const date = z.iso
      .date()
      .parse(
        req.nextUrl.searchParams.get("date") ??
          new Date().toISOString().slice(0, 10),
      );
    return NextResponse.json(
      {
        ...(await readState(db, user.id, date)),
        catalog: await nutritionCatalog(),
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not load data. Check the database migration." },
      { status: 500 },
    );
  }
}
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== new URL(req.url).origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (!configured())
    return NextResponse.json(
      { error: "Cloud storage is not configured" },
      { status: 503 },
    );
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const raw = await req.text();
    if (raw.length > 100000)
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const c = command.parse(JSON.parse(raw));
    let result: { error: unknown } = { error: null };
    if (c.action === "preferences")
      result = await db.rpc("save_preferences", { p: c.value });
    if (c.action === "inventory") {
      const i = catalog.find((i) => i.id === c.value.ingredient_id);
      if (!i || dimension(i.unit) !== dimension(c.value.unit))
        throw Error("Invalid ingredient unit");
      result = await db.rpc("change_inventory", {
        item: c.value,
        remove_item: c.remove ?? false,
      });
    }
    if (c.action === "plan") {
      const state = await readState(db, user.id, c.date);
      if (c.entries.some((e) => !safety(e.recipe, state.preferences, catalog)))
        throw Error(
          "A meal conflicts with your dietary or cooking preferences",
        );
      result = await db.rpc("save_plan", {
        d: c.date,
        entries: c.entries as Entry[],
      });
    }
    if (c.action === "cook") {
      const state = await readState(
        db,
        user.id,
        req.nextUrl.searchParams.get("date") ?? undefined,
      );
      const entry = state.entries.find((e) => e.id === c.id);
      if (!entry || !safety(entry.recipe, state.preferences, catalog))
        throw Error(
          "Meal is unavailable or conflicts with your current preferences",
        );
      if (
        c.actual.some(
          (r) =>
            !entry.recipe.ingredients.some(
              (i) =>
                i.ingredient_id === r.ingredient_id &&
                dimension(i.unit) === dimension(r.unit),
            ),
        )
      )
        throw Error("Unexpected ingredient");
      result = await db.rpc("confirm_cooking", {
        entry: c.id,
        actual: c.actual,
      });
    }
    if (c.action === "eaten")
      result = await db.rpc("log_eaten", { entry: c.id });
    if (c.action === "shopping") {
      if (
        c.items.some(
          (s) =>
            !catalog.some(
              (i) =>
                i.id === s.ingredient_id &&
                dimension(i.unit) === dimension(s.unit),
            ),
        )
      )
        throw Error("Invalid shopping item");
      result = await db
        .from("shopping_items")
        .upsert(c.items.map((i) => ({ ...i, user_id: user.id })));
    }
    if (c.action === "remove-shopping")
      result = await db
        .from("shopping_items")
        .delete()
        .eq("id", c.id)
        .eq("user_id", user.id);
    if (c.action === "purchase")
      result = await db.rpc("purchase_item", { item_id: c.id });
    if (c.action === "signout") result = await db.auth.signOut();
    if (c.action === "delete-account") {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
        return NextResponse.json(
          {
            error:
              "Account deletion needs the server service-role key. Contact the operator.",
          },
          { status: 503 },
        );
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      result = await admin.auth.admin.deleteUser(user.id);
      if (!result.error) await db.auth.signOut();
    }
    if (result.error)
      throw Error(
        "The change could not be saved. Refresh and check your stock before retrying.",
      );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Please check the form fields."
            : e instanceof Error
              ? e.message
              : "Unable to complete request",
      },
      { status: 400 },
    );
  }
}
