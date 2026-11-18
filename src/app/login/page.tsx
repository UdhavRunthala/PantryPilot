import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { configured } from "@/lib/supabase/server";
import AuthForm from "@/components/auth-form";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await currentUser()) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <AuthForm
      mode="login"
      googleEnabled={configured()}
      errorMessage={
        error ? "Sign-in could not be completed. Please try again." : undefined
      }
    />
  );
}
