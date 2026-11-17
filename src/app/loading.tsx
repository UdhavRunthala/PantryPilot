export default function Loading() {
  return (
    <main className="loading-page" aria-busy="true">
      <div className="brand">◉ PantryPilot</div>
      <div className="skeleton" />
      <div className="skeleton" />
      <p>Getting your kitchen ready…</p>
    </main>
  );
}
