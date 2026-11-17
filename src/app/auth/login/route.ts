import { NextResponse } from "next/server";
import { configured, serverClient } from "@/lib/supabase/server";
export async function GET() {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  if (!configured())
    return NextResponse.redirect(new URL("/?auth=unconfigured", origin));
  const db = await serverClient();
  const { data, error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });
  return NextResponse.redirect(
    error || !data.url ? new URL("/?auth=failed", origin) : data.url,
  );
}
