import "server-only";
import { catalog } from "./catalog";
import type { Ingredient, Nutrients } from "./domain";
// Missing or unreviewed composition mappings intentionally remain unavailable.
export async function nutritionCatalog(): Promise<Ingredient[]> {
  if (!process.env.USDA_API_KEY) return catalog;
  return Promise.all(
    catalog.map(async (i) => {
      if (!i.fdcId) return i;
      try {
        const res = await fetch(
          `https://api.nal.usda.gov/fdc/v1/food/${i.fdcId}?api_key=${encodeURIComponent(process.env.USDA_API_KEY!)}`,
          { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) },
        );
        if (!res.ok) return i;
        const data = await res.json();
        const nutrients = data.foodNutrients as {
          nutrient: { id: number };
          amount: number;
        }[];
        const get = (id: number) =>
          nutrients.find((n) => n.nutrient.id === id)?.amount;
        const vals = [get(1008), get(1003), get(1005), get(1004)];
        if (vals.some((v) => !Number.isFinite(v))) return i;
        const nutrition: Nutrients = {
          calories: vals[0]!,
          protein: vals[1]!,
          carbs: vals[2]!,
          fat: vals[3]!,
        };
        return { ...i, nutrition };
      } catch {
        return i;
      }
    }),
  );
}
