import { describe, it, expect } from "vitest";
import {
  base,
  convert,
  defaults,
  deduct,
  generatePlan,
  nutrition,
  requirements,
  shortages,
  status,
  safety,
  shoppingSuggestions,
  planRequirements,
  energyTarget,
  recipeSchema,
  rank,
  type Inventory,
  type Recipe,
} from "../src/lib/domain";
import { catalog, recipes, emptyState } from "../src/lib/catalog";
const inv = (
  ingredient_id: string,
  quantity: number,
  extra: Partial<Inventory> = {},
): Inventory => ({
  id: crypto.randomUUID(),
  ingredient_id,
  quantity,
  unit: "g",
  purchase_date: "2026-01-01",
  expiry_date: null,
  date_type: "estimated",
  storage: "Pantry",
  minimum: 10,
  spoiled: false,
  ...extra,
});
describe("units and availability", () => {
  it("normalizes mass and volume without mixing dimensions", () => {
    expect(base(1.2, "kg")).toBe(1200);
    expect(convert(1500, "ml", "l")).toBe(1.5);
    expect(() => convert(1, "pieces", "g")).toThrow();
    expect(() => convert(1, "ml", "g")).toThrow();
  });
  it("rejects invalid quantities", () => {
    expect(() => base(-1, "g")).toThrow();
    expect(() => base(NaN, "g")).toThrow();
  });
  it("combines recipe duplicates before checking or deducting", () => {
    const r = {
      ...recipes[0],
      ingredients: [
        { ingredient_id: "rice", quantity: 60, unit: "g" as const },
        { ingredient_id: "rice", quantity: 0.05, unit: "kg" as const },
      ],
    };
    expect(requirements(r)[0].quantity).toBe(110);
    expect(shortages(requirements(r), [inv("rice", 100)])[0].quantity).toBe(10);
    expect(() => deduct([inv("rice", 100)], r.ingredients)).toThrow();
  });
  it("does not treat kilograms as pieces", () => {
    expect(
      shortages(
        [{ ingredient_id: "eggs", quantity: 2, unit: "pieces" }],
        [inv("eggs", 20)],
      ).length,
    ).toBe(1);
  });
  it("deducts earliest-dated stock first and leaves the input untouched", () => {
    const input = [
      inv("rice", 0.1, { unit: "kg", expiry_date: "2099-01-05" }),
      inv("rice", 80, { expiry_date: "2099-01-01" }),
    ];
    const out = deduct(input, [
      { ingredient_id: "rice", quantity: 100, unit: "g" },
    ]);
    expect(out[1].quantity).toBe(0);
    expect(out[0].quantity).toBeCloseTo(0.08);
    expect(input[1].quantity).toBe(80);
  });
  it("does not partially mutate stock when another ingredient is missing", () => {
    const input = [inv("rice", 100)];
    expect(() =>
      deduct(input, [
        { ingredient_id: "rice", quantity: 50, unit: "g" },
        { ingredient_id: "onion", quantity: 50, unit: "g" },
      ]),
    ).toThrow();
    expect(input[0].quantity).toBe(100);
  });
});
describe("freshness and safety", () => {
  it("categorizes date boundaries without claiming food safety", () => {
    expect(
      status(inv("rice", 100, { expiry_date: "2026-11-15" }), "2026-11-16"),
    ).toBe("Date passed");
    expect(
      status(inv("rice", 100, { expiry_date: "2026-11-19" }), "2026-11-16"),
    ).toBe("Use soon");
    expect(
      status(inv("rice", 100, { expiry_date: "2026-11-20" }), "2026-11-16"),
    ).toBe("Fresh");
  });
  it("prioritizes spoiled and past-date flags over stock", () => {
    expect(status(inv("rice", 0, { spoiled: true }))).toBe("Spoiled");
    expect(status(inv("rice", 0, { expiry_date: "2000-01-01" }))).toBe(
      "Date passed",
    );
    expect(status(inv("rice", 0))).toBe("Out of stock");
    expect(status(inv("rice", 5))).toBe("Low stock");
  });
  it("excludes expired and spoiled inventory", () => {
    const stock = [
      inv("rice", 100, { expiry_date: "2000-01-01" }),
      inv("rice", 100, { spoiled: true }),
    ];
    expect(
      shortages([{ ingredient_id: "rice", quantity: 20, unit: "g" }], stock)[0]
        .quantity,
    ).toBe(20);
  });
  it("rejects milk allergies even when dairy needs rescuing", () => {
    const p = { ...defaults, allergies: ["milk"] };
    expect(safety(recipes[2], p, catalog)).toBe(false);
    expect(rank(recipes[2], [inv("paneer", 200)], p, catalog)).toBe(-Infinity);
  });
  it("fails closed on unknown custom restrictions and unknown ingredients", () => {
    expect(
      safety(recipes[0], { ...defaults, allergies: ["unknown herb"] }, catalog),
    ).toBe(false);
    expect(
      safety(
        {
          ...recipes[0],
          ingredients: [{ ingredient_id: "mystery", quantity: 1, unit: "g" }],
        },
        defaults,
        catalog,
      ),
    ).toBe(false);
  });
  it("enforces vegetarian, vegan, equipment and time constraints", () => {
    expect(safety(recipes[5], defaults, catalog)).toBe(false);
    expect(safety(recipes[2], { ...defaults, diet: "Vegan" }, catalog)).toBe(
      false,
    );
    expect(safety(recipes[0], { ...defaults, equipment: [] }, catalog)).toBe(
      false,
    );
    expect(safety(recipes[0], { ...defaults, max_time: 10 }, catalog)).toBe(
      false,
    );
  });
  it("rejects generated unit mismatches", () => {
    expect(
      safety(
        {
          ...recipes[0],
          ingredients: [{ ingredient_id: "rice", quantity: 10, unit: "ml" }],
        },
        defaults,
        catalog,
      ),
    ).toBe(false);
  });
  it("validates generated response structure", () => {
    expect(recipeSchema.safeParse({ ...recipes[0], servings: 0 }).success).toBe(
      false,
    );
    expect(recipeSchema.safeParse({ ...recipes[0], steps: [] }).success).toBe(
      false,
    );
    expect(recipeSchema.safeParse(recipes[0]).success).toBe(true);
  });
});
describe("nutrition, planning and shopping", () => {
  it("calculates per-serving nutrition deterministically", () => {
    const food = {
      ...catalog[0],
      nutrition: { calories: 20, protein: 3, carbs: 4, fat: 0.5 },
    };
    const r = {
      ...recipes[0],
      servings: 2,
      ingredients: [
        { ingredient_id: "spinach", quantity: 0.3, unit: "kg" as const },
      ],
    };
    expect(nutrition(r, [food])).toEqual({
      calories: 30,
      protein: 4.5,
      carbs: 6,
      fat: 0.75,
    });
  });
  it("returns unavailable for incomplete composition data or piece weight", () => {
    expect(nutrition(recipes[0], catalog)).toBeNull();
    const r = {
      ...recipes[0],
      ingredients: [
        { ingredient_id: "spinach", quantity: 1, unit: "pieces" as const },
      ],
    };
    expect(
      nutrition(r, [
        {
          ...catalog[0],
          nutrition: { calories: 1, protein: 1, carbs: 1, fat: 1 },
        },
      ]),
    ).toBeNull();
  });
  it("does not reuse inventory across meals", () => {
    const r: Recipe = {
      ...recipes[0],
      ingredients: [{ ingredient_id: "rice", quantity: 70, unit: "g" }],
    };
    const choices = [r, { ...r, id: "second" }, { ...r, id: "third" }];
    const p = generatePlan(choices, [inv("rice", 150)], defaults, catalog);
    expect(p).toHaveLength(2);
    expect(shortages(planRequirements(p), [inv("rice", 150)])).toHaveLength(0);
  });
  it("planned quantities exclude already prepared meals", () => {
    const e = {
      id: "a",
      slot: "Lunch" as const,
      recipe: recipes[0],
      servings: 2,
      prepared: true,
      eaten: false,
    };
    expect(planRequirements([e])).toEqual([]);
    expect(planRequirements([{ ...e, prepared: false }])[0].quantity).toBe(140);
  });
  it("combines low stock and meal shortage without doubling demand", () => {
    const s = emptyState();
    s.inventory = [inv("rice", 10, { minimum: 50 })];
    s.entries = [
      {
        id: "meal",
        slot: "Lunch",
        recipe: {
          ...recipes[0],
          ingredients: [{ ingredient_id: "rice", quantity: 60, unit: "g" }],
        },
        servings: 1,
        prepared: false,
        eaten: false,
      },
    ];
    const items = shoppingSuggestions(s);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(90);
    s.shopping = items;
    expect(shoppingSuggestions(s)).toHaveLength(0);
  });
  it("returns no nutrition target without consent and a deterministic estimate with it", () => {
    expect(energyTarget(defaults)).toBeNull();
    expect(
      energyTarget({
        ...defaults,
        nutrition: {
          age: 25,
          height: 170,
          weight: 65,
          sex: "female",
          activity: 1.2,
          steps: 0,
          exercise_frequency: 0,
          exercise_type: "",
          goal: "maintenance",
        },
      }),
    ).toBe(1712);
  });
});
