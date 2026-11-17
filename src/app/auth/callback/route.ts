import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";
export async function GET(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  if (code) {
    const db = await serverClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", origin));
  }
  return NextResponse.redirect(new URL("/?auth=failed", origin));
}
