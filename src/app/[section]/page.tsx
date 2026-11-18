import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getState } from "@/lib/backend";
import { pagePaths, pageFromPath } from "@/lib/navigation";
import PantryApp from "@/components/pantry-app";
export const dynamic = "force-dynamic";
export default async function Section({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const pathname = `/${section}`;
  if (
    !Object.values(pagePaths).includes(
      pathname as (typeof pagePaths)[keyof typeof pagePaths],
    ) &&
    section !== "onboarding"
  )
    notFound();
  const user = await currentUser();
  if (!user) redirect("/login");
  const state = await getState(user.id);
  if (!state.preferences.onboarded && section !== "onboarding")
    redirect("/onboarding");
  if (state.preferences.onboarded && section === "onboarding")
    redirect("/dashboard");
  return (
    <PantryApp initialState={state} initialPage={pageFromPath(pathname)} />
  );
}
