import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { configured, serverClient } from "@/lib/supabase/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { sameOrigin } from "@/lib/request-security";
const schema = z
  .object({
    action: z.enum(["login", "signup"]),
    email: z
      .email()
      .max(254)
      .transform((v) => v.trim().toLowerCase()),
    password: z.string().min(1).max(128),
    name: z.string().trim().min(1).max(60).optional(),
  })
  .refine((v) => v.action !== "signup" || v.password.length >= 10, {
    message: "Use at least 10 characters for a new password.",
  });
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const raw = await req.text();
    if (raw.length > 4096)
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const isForm = req.headers
      .get("content-type")
      ?.includes("application/x-www-form-urlencoded");
    const value = schema.parse(
      isForm ? Object.fromEntries(new URLSearchParams(raw)) : JSON.parse(raw),
    );
    if (configured()) {
      const db = await serverClient();
      if (value.action === "signup") {
        const { data, error } = await db.auth.signUp({
          email: value.email,
          password: value.password,
          options: {
            data: { full_name: value.name ?? "Friend" },
            emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin}/auth/callback`,
          },
        });
        if (error)
          return NextResponse.json(
            {
              error:
                "Unable to create an account. Check your details or try signing in.",
            },
            { status: 400 },
          );
        return NextResponse.json(
          data.session
            ? { redirect: "/onboarding" }
            : {
                message:
                  "Check your email to confirm your account, then sign in.",
              },
        );
      }
      const { error } = await db.auth.signInWithPassword({
        email: value.email,
        password: value.password,
      });
      if (error)
        return NextResponse.json(
          {
            error:
              "Email or password is incorrect, or your email needs confirmation.",
          },
          { status: 401 },
        );
      return NextResponse.json({ redirect: "/dashboard" });
    }
    const local = await import("@/lib/local-database");
    if (!(await local.takeLoginAttempt(value.email)))
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 },
      );
    let id: string | null;
    if (value.action === "signup") {
      try {
        id = await local.registerLocal(
          value.name ?? "Friend",
          value.email,
          value.password,
        );
      } catch {
        return NextResponse.json(
          {
            error:
              "Unable to create an account with this email. Try signing in.",
          },
          { status: 400 },
        );
      }
    } else id = await local.loginLocal(value.email, value.password);
    if (!id)
      return NextResponse.json(
        { error: "Email or password is incorrect." },
        { status: 401 },
      );
    const token = await local.createLocalSession(id);
    const destination =
      value.action === "signup" ? "/onboarding" : "/dashboard";
    const response = isForm
      ? NextResponse.redirect(
          new URL(destination, req.headers.get("origin")!),
          303,
        )
      : NextResponse.json({ redirect: destination });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Enter a valid email and a password with 10–128 characters."
            : "Sign-in is temporarily unavailable. Please try again.",
      },
      { status: 400 },
    );
  }
}
