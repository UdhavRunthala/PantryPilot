import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function Page() {
  redirect((await currentUser()) ? "/dashboard" : "/login");
}
