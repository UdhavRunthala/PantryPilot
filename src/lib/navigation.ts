export const pagePaths = {
  Dashboard: "/dashboard",
  "My Kitchen": "/kitchen",
  "Meal Planner": "/meal-planner",
  "Shopping List": "/shopping-list",
  Profile: "/profile",
} as const;
export type Page = keyof typeof pagePaths;
export function pageFromPath(path: string): Page {
  return (
    (Object.keys(pagePaths) as Page[]).find((p) => pagePaths[p] === path) ??
    "Dashboard"
  );
}
