"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Leaf,
  LockKeyhole,
  Mail,
  Sprout,
} from "lucide-react";
import { Button } from "./ui/button";
export default function AuthForm({
  mode,
  googleEnabled,
  errorMessage,
}: {
  mode: "login" | "signup";
  googleEnabled: boolean;
  errorMessage?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(errorMessage ?? ""),
    [message, setMessage] = useState(""),
    [show, setShow] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const signup = mode === "signup";
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Link className="brand" href="/login">
          <span className="brand-icon">
            <Sprout />
          </span>
          Pantry<span>Pilot</span>
        </Link>
        <div className="auth-story-copy">
          <div className="eyebrow">EAT SMARTER. WASTE LESS. SPEND LESS.</div>
          <h1>
            A happier kitchen
            <br />
            starts with you.
          </h1>
          <p>
            Make room for good food, simple plans, and one less thing to worry
            about.
          </p>
          <div className="auth-benefits">
            {[
              "Your groceries, always within reach",
              "Meals made around what you have",
              "A shopping list that makes sense",
            ].map((s) => (
              <span key={s}>
                <Check size={17} />
                {s}
              </span>
            ))}
          </div>
        </div>
        <div className="auth-story-footer">
          <Leaf size={19} /> Small habits. Good things.
        </div>
      </section>
      <section className="auth-form-side">
        <div className="auth-card">
          <span className="auth-symbol">
            <Sprout size={30} />
          </span>
          <div className="eyebrow">YOUR PERSONAL KITCHEN COMPANION</div>
          <h2>{signup ? "Make yourself at home." : "Welcome back."}</h2>
          <p>
            {signup
              ? "Create your account. Your kitchen starts fresh."
              : "Your kitchen is right where you left it."}
          </p>
          <form
            method="post"
            action="/api/auth"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              const data = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              setMessage("");
              try {
                const response = await fetch("/api/auth", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: mode,
                    email: data.get("email"),
                    password: data.get("password"),
                    ...(signup ? { name: data.get("name") } : {}),
                  }),
                });
                const result = await response.json();
                if (!response.ok) throw Error(result.error);
                if (result.redirect) window.location.assign(result.redirect);
                else setMessage(result.message);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Unable to connect. Please try again.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <input type="hidden" name="action" value={mode} />
            {signup && (
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="given-name"
                  placeholder="What should we call you?"
                  maxLength={60}
                  required
                />
              </label>
            )}
            <label>
              Email address
              <div className="auth-input">
                <Mail size={17} />
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  maxLength={254}
                  required
                />
              </div>
            </label>
            <label>
              Password
              <div className="auth-input">
                <LockKeyhole size={17} />
                <input
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete={signup ? "new-password" : "current-password"}
                  minLength={signup ? 10 : 1}
                  maxLength={128}
                  placeholder={
                    signup ? "At least 10 characters" : "Enter your password"
                  }
                  required
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="auth-success" role="status">
                {message}
              </p>
            )}
            <Button
              type="submit"
              disabled={busy || !ready}
              className="auth-submit"
            >
              {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
              <ArrowRight size={17} />
            </Button>
          </form>
          {googleEnabled && (
            <>
              <div className="auth-divider">
                <span>or</span>
              </div>
              <a
                className="button button-outline auth-google"
                href="/auth/login"
              >
                Continue with Google
              </a>
            </>
          )}
          <p className="auth-switch">
            {signup ? "Already have an account?" : "New to PantryPilot?"}{" "}
            <Link href={signup ? "/login" : "/signup"}>
              {signup ? "Sign in" : "Create an account"}
            </Link>
          </p>
          <p className="auth-footnote">
            <LockKeyhole size={13} /> Your account keeps your kitchen separate
            and private.
          </p>
        </div>
      </section>
    </main>
  );
}
