import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { getState, execute } from "@/lib/backend";
import { commandSchema } from "@/lib/commands";
import { catalog } from "@/lib/catalog";
import { dimension, safety, today } from "@/lib/domain";
import { nutritionCatalog } from "@/lib/nutrition-server";
import { sameOrigin } from "@/lib/request-security";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const date = z.iso
      .date()
      .parse(req.nextUrl.searchParams.get("date") ?? today());
    return NextResponse.json(
      { ...(await getState(user.id, date)), catalog: await nutritionCatalog() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not load your kitchen. Please try again." },
      { status: 500 },
    );
  }
}
export async function POST(req: NextRequest) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const raw = await req.text();
    if (raw.length > 100000)
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const c = commandSchema.parse(JSON.parse(raw));
    if (c.action === "inventory") {
      const i = catalog.find((i) => i.id === c.value.ingredient_id);
      if (!i || dimension(i.unit) !== dimension(c.value.unit))
        throw Error("Invalid ingredient unit");
    }
    if (c.action === "plan") {
      const state = await getState(user.id, c.date);
      if (c.entries.some((e) => !safety(e.recipe, state.preferences, catalog)))
        throw Error(
          "A meal conflicts with your dietary or cooking preferences",
        );
    }
    if (c.action === "cook") {
      const date = z.iso
        .date()
        .parse(req.nextUrl.searchParams.get("date") ?? today());
      const state = await getState(user.id, date);
      const entry = state.entries.find((e) => e.id === c.id);
      if (!entry || !safety(entry.recipe, state.preferences, catalog))
        throw Error("Meal unavailable or conflicts with your preferences");
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
    }
    if (
      c.action === "shopping" &&
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
    await execute(user.id, c);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message =
      e instanceof z.ZodError
        ? "Please check the form fields."
        : e instanceof Error &&
            /Invalid|conflicts|unavailable|Unexpected|not configured|could not be saved/.test(
              e.message,
            )
          ? e.message
          : "Could not save this change. Check your quantities and refresh before retrying.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
