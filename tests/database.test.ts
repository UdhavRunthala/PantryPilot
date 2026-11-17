import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { defaults } from "../src/lib/domain";
import { recipes } from "../src/lib/catalog";
describe("migration on embedded PostgreSQL", () => {
  let db: PGlite;
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222",
    item = "33333333-3333-4333-8333-333333333333",
    entry = "44444444-4444-4444-8444-444444444444";
  async function asUser(id: string) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  }
  async function stock() {
    return (
      await db.query<{ quantity: string }>(
        "select quantity from public.inventory_items where id=$1",
        [item],
      )
    ).rows[0]?.quantity;
  }
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      "create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;",
    );
    const migration = readFileSync(
      "supabase/migrations/001_initial.sql",
      "utf8",
    ).replace("create extension if not exists pgcrypto;", "");
    await db.exec(migration);
    await db.exec(
      "grant select,insert,update,delete on all tables in schema public to authenticated",
    );
    await db.query("insert into auth.users values ($1,'{}'),($2,'{}')", [a, b]);
    await asUser(a);
  });
  afterAll(async () => {
    await db?.close();
  });
  it("creates profiles and saves onboarding atomically", async () => {
    expect((await db.query("select * from public.profiles")).rows).toHaveLength(
      1,
    );
    await db.query("select public.save_preferences($1::jsonb)", [
      JSON.stringify({ ...defaults, name: "Sam", onboarded: true }),
    ]);
    expect(
      (await db.query<{ name: string }>("select name from public.profiles"))
        .rows[0].name,
    ).toBe("Sam");
  });
  it("persists inventory and blocks cross-account visibility and correction", async () => {
    await db.query("select public.change_inventory($1::jsonb)", [
      JSON.stringify({
        id: item,
        ingredient_id: "rice",
        quantity: 100,
        unit: "g",
        purchase_date: "2026-01-01",
        expiry_date: null,
        date_type: "estimated",
        storage: "Pantry",
        minimum: 10,
        spoiled: false,
      }),
    ]);
    await asUser(b);
    expect(
      (await db.query("select * from public.inventory_items")).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "update public.inventory_items set quantity=999 where id=$1 returning *",
          [item],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        "insert into public.inventory_items(user_id,ingredient_id,quantity,unit,date_type,storage) values($1,'rice',1,'g','estimated','Pantry')",
        [a],
      ),
    ).rejects.toThrow();
    await asUser(a);
    expect(Number(await stock())).toBe(100);
  });
  it("saves normalized plans with ownership boundaries", async () => {
    await db.query("select public.save_plan($1::date,$2::jsonb)", [
      "2026-01-01",
      JSON.stringify([
        {
          id: entry,
          slot: "Lunch",
          servings: 1,
          recipe: {
            ...recipes[0],
            ingredients: [{ ingredient_id: "rice", quantity: 60, unit: "g" }],
          },
        },
      ]),
    ]);
    expect(
      (await db.query("select * from public.recipe_ingredients")).rows,
    ).toHaveLength(1);
    await asUser(b);
    expect(
      (await db.query("select * from public.meal_plans")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.confirm_cooking($1,$2)", [
        entry,
        JSON.stringify([{ ingredient_id: "rice", quantity: 1, unit: "g" }]),
      ]),
    ).rejects.toThrow("Meal not found");
    await asUser(a);
  });
  it("rolls back the complete transaction on insufficient stock", async () => {
    await expect(
      db.query("select public.confirm_cooking($1,$2)", [
        entry,
        JSON.stringify([{ ingredient_id: "rice", quantity: 150, unit: "g" }]),
      ]),
    ).rejects.toThrow("Insufficient");
    expect(Number(await stock())).toBe(100);
    expect(
      (
        await db.query(
          "select * from public.inventory_transactions where reason='Cooked meal'",
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("deducts only once and logs consumption separately", async () => {
    const actual = JSON.stringify([
      { ingredient_id: "rice", quantity: 60, unit: "g" },
    ]);
    await db.query("select public.confirm_cooking($1,$2)", [entry, actual]);
    await db.query("select public.confirm_cooking($1,$2)", [entry, actual]);
    expect(Number(await stock())).toBe(40);
    expect(
      (
        await db.query(
          "select * from public.inventory_transactions where reason='Cooked meal'",
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.meal_logs")).rows,
    ).toHaveLength(0);
    await db.query("select public.log_eaten($1)", [entry]);
    await db.query("select public.log_eaten($1)", [entry]);
    expect(
      (await db.query("select * from public.meal_logs")).rows,
    ).toHaveLength(1);
  });
  it("moves a purchased item into stock exactly once", async () => {
    const id = crypto.randomUUID();
    await db.query(
      "insert into public.shopping_items(id,user_id,ingredient_id,quantity,unit,checked) values($1,$2,'milk',500,'ml',true)",
      [id, a],
    );
    await db.query("select public.purchase_item($1)", [id]);
    await db.query("select public.purchase_item($1)", [id]);
    expect(
      (
        await db.query(
          "select * from public.inventory_items where ingredient_id='milk'",
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.shopping_items")).rows,
    ).toHaveLength(0);
  });
  it("enforces the shared hourly AI cap", async () => {
    for (let i = 0; i < 10; i++)
      expect(
        (await db.query<{ ok: boolean }>("select public.take_ai_token() as ok"))
          .rows[0].ok,
      ).toBe(true);
    expect(
      (await db.query<{ ok: boolean }>("select public.take_ai_token() as ok"))
        .rows[0].ok,
    ).toBe(false);
    await asUser(b);
    expect(
      (await db.query<{ ok: boolean }>("select public.take_ai_token() as ok"))
        .rows[0].ok,
    ).toBe(true);
    await asUser(a);
  });
  it("cascades personal data when an auth account is deleted", async () => {
    await db.exec("reset role");
    await db.query("delete from auth.users where id=$1", [a]);
    for (const t of [
      "profiles",
      "user_preferences",
      "inventory_items",
      "inventory_transactions",
      "recipes",
      "recipe_ingredients",
      "meal_plans",
      "meal_plan_entries",
      "meal_logs",
      "shopping_items",
    ])
      expect(
        (
          await db.query(
            `select * from public.${t} where ${t === "profiles" ? "id" : "user_id"}=$1`,
            [a],
          )
        ).rows,
      ).toHaveLength(0);
  });
});
