import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { defaults } from "../src/lib/domain";
import { recipes } from "../src/lib/catalog";
// Use a disposable test Supabase project with the migration applied. Never production.
const enabled = !!(
  process.env.TEST_SUPABASE_URL &&
  process.env.TEST_SUPABASE_ANON_KEY &&
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY
);
describe.skipIf(!enabled)(
  "Supabase ownership and transactional workflows",
  () => {
    let admin: SupabaseClient, a: SupabaseClient, b: SupabaseClient;
    const users: string[] = [];
    const item = crypto.randomUUID();
    const entry = crypto.randomUUID();
    beforeAll(async () => {
      admin = createClient(
        process.env.TEST_SUPABASE_URL!,
        process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
      );
      for (let n = 0; n < 2; n++) {
        const email = `pantrypilot-${crypto.randomUUID()}@example.test`,
          password = crypto.randomUUID() + "A1!";
        const result = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (result.error) throw result.error;
        users.push(result.data.user.id);
        const client = createClient(
          process.env.TEST_SUPABASE_URL!,
          process.env.TEST_SUPABASE_ANON_KEY!,
          { auth: { persistSession: false } },
        );
        const login = await client.auth.signInWithPassword({ email, password });
        if (login.error) throw login.error;
        if (n === 0) a = client;
        else b = client;
      }
    });
    afterAll(async () => {
      for (const id of users) await admin.auth.admin.deleteUser(id);
    });
    it("creates profiles and saves private onboarding", async () => {
      expect((await a.from("profiles").select("*")).data?.[0].id).toBe(
        users[0],
      );
      expect(
        (
          await a.rpc("save_preferences", {
            p: { ...defaults, name: "Test student", onboarded: true },
          })
        ).error,
      ).toBeNull();
      expect(
        (await b.from("user_preferences").select("*").eq("user_id", users[0]))
          .data,
      ).toEqual([]);
    });
    it("persists groceries and denies another user reads and writes", async () => {
      expect(
        (
          await a.rpc("change_inventory", {
            item: {
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
            },
          })
        ).error,
      ).toBeNull();
      expect(
        (await b.from("inventory_items").select("*").eq("id", item)).data,
      ).toEqual([]);
      expect(
        (
          await b
            .from("inventory_items")
            .update({ quantity: 999 })
            .eq("id", item)
            .select()
        ).data,
      ).toEqual([]);
      expect(
        (
          await a
            .from("inventory_items")
            .select("quantity")
            .eq("id", item)
            .single()
        ).data?.quantity,
      ).toBe(100);
    });
    it("persists a meal with normalized ingredients", async () => {
      expect(
        (
          await a.rpc("save_plan", {
            d: "2026-01-01",
            entries: [
              {
                id: entry,
                slot: "Lunch",
                servings: 1,
                recipe: {
                  ...recipes[0],
                  ingredients: [
                    { ingredient_id: "rice", quantity: 60, unit: "g" },
                  ],
                },
              },
            ],
          })
        ).error,
      ).toBeNull();
      expect(
        (await a.from("recipe_ingredients").select("*")).data,
      ).toHaveLength(1);
      expect(
        (await b.from("meal_plan_entries").select("*").eq("id", entry)).data,
      ).toEqual([]);
    });
    it("rolls back insufficient cooking and is idempotent under retries", async () => {
      const fail = await a.rpc("confirm_cooking", {
        entry,
        actual: [{ ingredient_id: "rice", quantity: 120, unit: "g" }],
      });
      expect(fail.error).not.toBeNull();
      expect(
        (
          await a
            .from("inventory_items")
            .select("quantity")
            .eq("id", item)
            .single()
        ).data?.quantity,
      ).toBe(100);
      await Promise.all(
        [1, 2].map(() =>
          a.rpc("confirm_cooking", {
            entry,
            actual: [{ ingredient_id: "rice", quantity: 60, unit: "g" }],
          }),
        ),
      );
      expect(
        (
          await a
            .from("inventory_items")
            .select("quantity")
            .eq("id", item)
            .single()
        ).data?.quantity,
      ).toBe(40);
      expect(
        (
          await a
            .from("inventory_transactions")
            .select("*")
            .eq("reason", "Cooked meal")
        ).data,
      ).toHaveLength(1);
    });
    it("rejects cooking someone else’s meal and separates eaten logs", async () => {
      expect(
        (
          await b.rpc("confirm_cooking", {
            entry,
            actual: [{ ingredient_id: "rice", quantity: 1, unit: "g" }],
          })
        ).error,
      ).not.toBeNull();
      expect((await a.from("meal_logs").select("*")).data).toEqual([]);
      expect((await a.rpc("log_eaten", { entry })).error).toBeNull();
      expect((await a.from("meal_logs").select("*")).data).toHaveLength(1);
    });
  },
);
