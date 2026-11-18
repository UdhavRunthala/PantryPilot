import { z } from "zod";
import {
  inventorySchema,
  preferencesSchema,
  recipeSchema,
  units,
} from "./domain";
export const entrySchema = z.object({
  id: z.uuid(),
  slot: z.enum(["Breakfast", "Lunch", "Dinner", "Snack"]),
  recipe: recipeSchema,
  servings: z.number().min(1).max(8),
  prepared: z.boolean(),
  eaten: z.boolean(),
});
export const shoppingSchema = z.object({
  id: z.uuid(),
  ingredient_id: z.string(),
  quantity: z.number().positive().max(100000),
  unit: z.enum(units),
  checked: z.boolean(),
  reason: z.string().max(100),
});
export const commandSchema = z.discriminatedUnion("action", [
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
export type Command = z.infer<typeof commandSchema>;
