"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="loading-page">
      <h1>Something didn’t load.</h1>
      <p>Your saved kitchen is still there. Let’s try again.</p>
      <button className="button button-primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
