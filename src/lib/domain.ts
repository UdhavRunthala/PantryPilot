import { z } from "zod";
export const units = ["g", "kg", "ml", "l", "pieces"] as const;
export const categories = [
  "Vegetables",
  "Fruits",
  "Dairy",
  "Grains",
  "Pulses and legumes",
  "Eggs and meat",
  "Spices",
  "Pantry essentials",
  "Other",
] as const;
export const inventorySchema = z.object({
  id: z.uuid(),
  ingredient_id: z.string().min(1).max(80),
  quantity: z.number().min(0).max(100000),
  unit: z.enum(units),
  purchase_date: z.iso.date(),
  expiry_date: z.iso.date().nullable(),
  date_type: z.enum(["best-before", "use-by", "estimated"]),
  storage: z.enum(["Fridge", "Freezer", "Pantry"]),
  minimum: z.number().min(0).max(100000),
  spoiled: z.boolean(),
});
export const preferencesSchema = z.object({
  name: z.string().trim().min(1).max(60),
  goal: z.string().max(80),
  diet: z.enum(["Vegetarian", "Vegan", "Eggetarian", "Non-vegetarian"]),
  allergies: z.array(z.string().trim().min(1).max(50)).max(30),
  exclusions: z.array(z.string().trim().min(1).max(50)).max(30),
  max_time: z.number().int().min(5).max(180),
  skill: z.enum(["Beginner", "Comfortable", "Confident"]),
  equipment: z
    .array(
      z.enum(["Stove", "Pan", "Pot", "Pressure cooker", "Microwave", "Oven"]),
    )
    .max(6),
  cuisines: z.array(z.string().max(40)).max(10),
  budget: z.number().min(0).max(10000).nullable(),
  nutrition: z
    .object({
      age: z.number().min(18).max(100),
      height: z.number().min(120).max(230),
      weight: z.number().min(35).max(250),
      sex: z.enum(["female", "male"]),
      activity: z.number().min(1.2).max(1.9),
      steps: z.number().min(0).max(50000),
      exercise_frequency: z.number().min(0).max(7),
      exercise_type: z.string().max(60),
      goal: z.enum(["maintenance", "muscle gain"]),
    })
    .nullable(),
  onboarded: z.boolean(),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export type Inventory = z.infer<typeof inventorySchema>;
export type Nutrients = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};
export type Ingredient = {
  id: string;
  name: string;
  category: (typeof categories)[number];
  unit: (typeof units)[number];
  emoji: string;
  allergens: string[];
  animal: "none" | "dairy" | "egg" | "meat";
  fdcId?: number;
  gramsPerPiece?: number;
  density?: number;
  nutrition?: Nutrients;
};
export const recipeSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  description: z.string().max(400),
  prep: z.number().int().min(0).max(120),
  cook: z.number().int().min(1).max(180),
  servings: z.number().int().min(1).max(8),
  ingredients: z
    .array(
      z.object({
        ingredient_id: z.string().max(80),
        quantity: z.number().positive().max(10000),
        unit: z.enum(units),
      }),
    )
    .min(1)
    .max(25),
  steps: z.array(z.string().min(1).max(700)).min(1).max(15),
  equipment: z.array(z.string().max(40)).max(6),
  cuisine: z.string().max(40),
});
export type Recipe = z.infer<typeof recipeSchema>;
export type Entry = {
  id: string;
  slot: "Breakfast" | "Lunch" | "Dinner" | "Snack";
  recipe: Recipe;
  servings: number;
  prepared: boolean;
  eaten: boolean;
};
export type Shopping = {
  id: string;
  ingredient_id: string;
  quantity: number;
  unit: (typeof units)[number];
  checked: boolean;
  reason: string;
};
export type History = {
  id: string;
  ingredient_id: string;
  quantity: number;
  unit: string;
  reason: string;
  created_at: string;
};
export type State = {
  preferences: Preferences;
  inventory: Inventory[];
  entries: Entry[];
  shopping: Shopping[];
  history: History[];
  planDate: string;
};
export const defaults: Preferences = {
  name: "Friend",
  goal: "Reduce food waste",
  diet: "Vegetarian",
  allergies: [],
  exclusions: [],
  max_time: 35,
  skill: "Beginner",
  equipment: ["Stove", "Pan", "Pot"],
  cuisines: ["Indian"],
  budget: 200,
  nutrition: null,
  onboarded: false,
};
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function base(q: number, u: string) {
  if (!Number.isFinite(q) || q < 0) throw Error("Invalid quantity");
  return q * (u === "kg" || u === "l" ? 1000 : 1);
}
export function dimension(u: string) {
  return u === "g" || u === "kg"
    ? "mass"
    : u === "ml" || u === "l"
      ? "volume"
      : "count";
}
export function convert(q: number, from: string, to: string) {
  if (dimension(from) !== dimension(to)) throw Error("Incompatible units");
  return base(q, from) / (to === "kg" || to === "l" ? 1000 : 1);
}
export function status(i: Inventory, date = today()) {
  if (i.spoiled) return "Spoiled";
  if (i.expiry_date && i.expiry_date < date) return "Date passed";
  if (i.quantity === 0) return "Out of stock";
  if (
    i.expiry_date &&
    (Date.parse(i.expiry_date) - Date.parse(date)) / 86400000 <= 3
  )
    return "Use soon";
  if (i.quantity <= i.minimum) return "Low stock";
  return "Fresh";
}
export function usable(i: Inventory, date = today()) {
  return !["Spoiled", "Date passed", "Out of stock"].includes(status(i, date));
}
export function safety(recipe: Recipe, p: Preferences, catalog: Ingredient[]) {
  const blocked = [...p.allergies, ...p.exclusions].map((x) =>
    x.toLowerCase().trim(),
  );
  // Unknown custom restrictions fail closed until the user removes or maps them.
  const known = new Set([
    "milk",
    "dairy",
    "lactose",
    "egg",
    "eggs",
    "gluten",
    "peanut",
    "soy",
    "sesame",
    "tree nut",
    "shellfish",
    "fish",
    ...catalog.flatMap((i) => [i.id, i.name.toLowerCase(), ...i.allergens]),
  ]);
  if (blocked.some((b) => !known.has(b))) return false;
  return (
    recipe.prep + recipe.cook <= p.max_time &&
    recipe.equipment.every((e) =>
      p.equipment.includes(e as Preferences["equipment"][number]),
    ) &&
    recipe.ingredients.every((r) => {
      const i = catalog.find((i) => i.id === r.ingredient_id);
      return (
        !!i &&
        dimension(i.unit) === dimension(r.unit) &&
        !blocked.some(
          (b) =>
            i.allergens.includes(b) || i.id === b || i.name.toLowerCase() === b,
        ) &&
        !(p.diet === "Vegan" && i.animal !== "none") &&
        !(p.diet === "Vegetarian" && ["egg", "meat"].includes(i.animal)) &&
        !(p.diet === "Eggetarian" && i.animal === "meat")
      );
    })
  );
}
export function requirements(recipe: Recipe, servings = recipe.servings) {
  const map = new Map<
    string,
    { ingredient_id: string; quantity: number; unit: (typeof units)[number] }
  >();
  for (const r of recipe.ingredients) {
    const key = r.ingredient_id;
    const old = map.get(key);
    const quantity = (r.quantity * servings) / recipe.servings;
    if (old) old.quantity += convert(quantity, r.unit, old.unit);
    else map.set(key, { ...r, quantity });
  }
  return [...map.values()];
}
export function shortages(req: Recipe["ingredients"], inventory: Inventory[]) {
  return req
    .map((r) => ({
      ...r,
      quantity: Math.max(
        0,
        r.quantity -
          inventory
            .filter(
              (i) =>
                i.ingredient_id === r.ingredient_id &&
                usable(i) &&
                dimension(i.unit) === dimension(r.unit),
            )
            .reduce((n, i) => n + convert(i.quantity, i.unit, r.unit), 0),
      ),
    }))
    .filter((r) => r.quantity > 0.00001);
}
export function deduct(inventory: Inventory[], req: Recipe["ingredients"]) {
  const normalized = requirements(
    { ingredients: req, servings: 1 } as Recipe,
    1,
  );
  if (shortages(normalized, inventory).length)
    throw Error("Not enough usable ingredients. Update your kitchen first.");
  const result = inventory.map((i) => ({ ...i }));
  for (const r of normalized) {
    let left = r.quantity;
    for (const i of result
      .filter(
        (i) =>
          i.ingredient_id === r.ingredient_id &&
          usable(i) &&
          dimension(i.unit) === dimension(r.unit),
      )
      .sort((a, b) =>
        (a.expiry_date ?? "9999").localeCompare(b.expiry_date ?? "9999"),
      )) {
      const take = Math.min(convert(i.quantity, i.unit, r.unit), left);
      i.quantity = Math.max(0, i.quantity - convert(take, r.unit, i.unit));
      left -= take;
    }
  }
  return result;
}
export function planRequirements(entries: Entry[]) {
  return requirements(
    {
      servings: 1,
      ingredients: entries
        .filter((e) => !e.prepared)
        .flatMap((e) => requirements(e.recipe, e.servings)),
    } as Recipe,
    1,
  );
}
export function nutrition(
  recipe: Recipe,
  catalog: Ingredient[],
): Nutrients | null {
  const total = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const r of recipe.ingredients) {
    const i = catalog.find((i) => i.id === r.ingredient_id);
    if (!i?.nutrition) return null;
    const grams =
      dimension(r.unit) === "mass"
        ? base(r.quantity, r.unit)
        : dimension(r.unit) === "count"
          ? r.quantity * (i.gramsPerPiece ?? NaN)
          : base(r.quantity, r.unit) * (i.density ?? NaN);
    if (!Number.isFinite(grams)) return null;
    for (const k of Object.keys(total) as (keyof Nutrients)[])
      total[k] += (i.nutrition[k] * grams) / 100 / recipe.servings;
  }
  return total;
}
export function energyTarget(p: Preferences) {
  const n = p.nutrition;
  if (!n) return null;
  return Math.round(
    (10 * n.weight +
      6.25 * n.height -
      5 * n.age +
      (n.sex === "male" ? 5 : -161)) *
      n.activity +
      (n.goal === "muscle gain" ? 200 : 0),
  );
}
export function rank(
  recipe: Recipe,
  inventory: Inventory[],
  p: Preferences,
  catalog: Ingredient[],
) {
  if (!safety(recipe, p, catalog)) return -Infinity;
  const missing = shortages(requirements(recipe), inventory).length;
  const rescue = recipe.ingredients.filter((r) =>
    inventory.some(
      (i) => i.ingredient_id === r.ingredient_id && status(i) === "Use soon",
    ),
  ).length;
  return (
    100 -
    missing * 30 +
    rescue * 15 -
    recipe.cook / 10 +
    (p.cuisines.includes(recipe.cuisine) ? 5 : 0)
  );
}
export function generatePlan(
  recipes: Recipe[],
  inventory: Inventory[],
  p: Preferences,
  catalog: Ingredient[],
): Entry[] {
  let remaining = inventory.map((i) => ({ ...i }));
  const used = new Set<string>();
  return (["Breakfast", "Lunch", "Dinner"] as const).flatMap((slot) => {
    const sorted = recipes
      .filter((r) => safety(r, p, catalog) && !used.has(r.id))
      .sort(
        (a, b) =>
          rank(b, remaining, p, catalog) - rank(a, remaining, p, catalog),
      );
    const r = sorted.find(
      (r) => shortages(requirements(r, 1), remaining).length === 0,
    );
    if (!r) return [];
    used.add(r.id);
    remaining = deduct(remaining, requirements(r, 1));
    return [
      {
        id: crypto.randomUUID(),
        slot,
        recipe: r,
        servings: 1,
        prepared: false,
        eaten: false,
      },
    ];
  });
}
export function shoppingSuggestions(state: State) {
  const needed = new Map<string, Shopping>();
  for (const r of shortages(planRequirements(state.entries), state.inventory))
    needed.set(r.ingredient_id, {
      ...r,
      id: crypto.randomUUID(),
      checked: false,
      reason: "For your meal plan",
    });
  for (const i of state.inventory) {
    if (i.quantity <= i.minimum) {
      const q = Math.max(i.minimum * 2 - i.quantity, 1);
      const old = needed.get(i.ingredient_id);
      if (old) {
        if (dimension(old.unit) === dimension(i.unit))
          old.quantity = Math.max(old.quantity, convert(q, i.unit, old.unit));
      } else
        needed.set(i.ingredient_id, {
          id: crypto.randomUUID(),
          ingredient_id: i.ingredient_id,
          quantity: q,
          unit: i.unit,
          checked: false,
          reason: "Running low",
        });
    }
  }
  return [...needed.values()].filter(
    (i) => !state.shopping.some((s) => s.ingredient_id === i.ingredient_id),
  );
}
