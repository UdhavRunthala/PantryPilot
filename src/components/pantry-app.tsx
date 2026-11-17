"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChefHat,
  ChevronRight,
  Clock,
  Flame,
  Heart,
  History,
  Home,
  Leaf,
  LogOut,
  Package,
  Plus,
  Search,
  Settings2,
  ShoppingBasket,
  ShoppingCart,
  Sparkles,
  Sprout,
  Trash2,
  UserRound,
  Utensils,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Modal } from "./modal";
import Onboarding from "./onboarding";
import {
  catalog as baseCatalog,
  recipes as library,
  foodPhotos,
  demoState,
  emptyState,
} from "@/lib/catalog";
import {
  categories,
  units,
  inventorySchema,
  preferencesSchema,
  today,
  status,
  usable,
  requirements,
  shortages,
  deduct,
  nutrition,
  energyTarget,
  rank,
  safety,
  generatePlan,
  planRequirements,
  shoppingSuggestions,
  type State,
  type Recipe,
  type Inventory,
  type Entry,
  type Preferences,
  type Ingredient,
  type Shopping,
} from "@/lib/domain";
type Page =
  "Dashboard" | "My Kitchen" | "Meal Planner" | "Shopping List" | "Profile";
const nav = [
  ["Dashboard", Home],
  ["My Kitchen", ShoppingBasket],
  ["Meal Planner", CalendarDays],
  ["Shopping List", ShoppingCart],
] as const;
const key = "pantrypilot-demo-v1";
const num = (n: number) => Number(n.toFixed(1));
export default function PantryApp({
  cloudConfigured,
  authenticated,
}: {
  cloudConfigured: boolean;
  authenticated: boolean;
}) {
  const [state, setState] = useState<State | null>(null);
  const [demo, setDemo] = useState(!cloudConfigured);
  const [page, setPage] = useState<Page>("Dashboard");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All ingredients");
  const [inventoryModal, setInventoryModal] = useState<
    Inventory | "new" | null
  >(null);
  const [recipeModal, setRecipeModal] = useState<Recipe | null>(null);
  const [cooking, setCooking] = useState<Entry | null>(null);
  const [shopModal, setShopModal] = useState<Shopping | "new" | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [catalog, setCatalog] = useState(baseCatalog);
  const [recipes, setRecipes] = useState(library);
  const [source, setSource] = useState("Curated for everyday cooking");
  const [rescue, setRescue] = useState(false);
  async function refresh(date = today()) {
    const res = await fetch(`/api/state?date=${date}`);
    const data = await res.json();
    if (!res.ok) throw Error(data.error);
    if (data.catalog) setCatalog(data.catalog);
    setState(data);
  }
  useEffect(() => {
    if (demo) {
      try {
        const saved = localStorage.getItem(key);
        if (saved) {
          const data = JSON.parse(saved) as State;
          preferencesSchema.parse(data.preferences);
          data.inventory.forEach((i) => inventorySchema.parse(i));
          if (data.planDate !== today()) {
            data.entries = [];
            data.planDate = today();
          }
          setState(data);
        } else setState(demoState());
      } catch {
        setError(
          "Your local demo could not be restored. A fresh sample kitchen is loaded.",
        );
        setState(demoState());
      }
    } else if (authenticated) refresh().catch((e) => setError(e.message));
  }, [demo, authenticated]);
  useEffect(() => {
    if (state && demo) {
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch {
        setError(
          "Browser storage is full or disabled. Changes cannot persist.",
        );
      }
    }
  }, [state, demo]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  async function perform(
    command: Record<string, unknown>,
    local: (s: State) => State,
    message: string,
  ) {
    if (lock.current || !state) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (demo) setState(local(state));
      else {
        const r = await fetch(`/api/state?date=${state.planDate}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        });
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (
          command.action === "signout" ||
          command.action === "delete-account"
        ) {
          window.location.assign("/");
          return true;
        }
        await refresh(state.planDate);
      }
      setToast(message);
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const ingredient = (id: string) => catalog.find((i) => i.id === id)!;
  const attention =
    state?.inventory.filter((i) =>
      ["Use soon", "Date passed", "Spoiled"].includes(status(i)),
    ) ?? [];
  const low = state?.inventory.filter((i) => i.quantity <= i.minimum) ?? [];
  const suggested = useMemo(
    () =>
      state
        ? recipes
            .filter(
              (r) =>
                safety(r, state.preferences, catalog) &&
                (!rescue ||
                  r.ingredients.some((r) =>
                    state.inventory.some(
                      (i) =>
                        i.ingredient_id === r.ingredient_id &&
                        status(i) === "Use soon",
                    ),
                  )),
            )
            .sort(
              (a, b) =>
                rank(b, state.inventory, state.preferences, catalog) -
                rank(a, state.inventory, state.preferences, catalog),
            )
        : [],
    [state, recipes, catalog, rescue],
  );
  function go(p: Page) {
    setPage(p);
    setQuery("");
    setRescue(false);
  }
  async function generate() {
    if (!state || lock.current) return;
    setBusy(true);
    lock.current = true;
    setError("");
    try {
      let next = library;
      let cat = catalog;
      if (!demo) {
        const r = await fetch("/api/recipes", { method: "POST" });
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        next = d.recipes;
        cat = d.catalog;
        setCatalog(cat);
        setSource(d.source);
      } else setSource("Demo · curated recipe library, no AI request");
      setRecipes(next);
      const prepared = state.entries.filter((e) => e.prepared);
      const entries = [
        ...prepared,
        ...generatePlan(next, state.inventory, state.preferences, cat).filter(
          (e) => !prepared.some((p) => p.slot === e.slot),
        ),
      ];
      lock.current = false;
      setBusy(false);
      await perform(
        { action: "plan", date: state.planDate, entries },
        (s) => ({ ...s, entries }),
        entries.length < 3
          ? "Saved a partial plan. Add groceries or review your restrictions to fill the remaining meals."
          : "Your meal plan is ready. A little less to think about.",
      );
      setPage("Meal Planner");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate meals");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function addMeal(r: Recipe, slot?: Entry["slot"]) {
    if (!state) return;
    const chosen =
      slot ??
      (["Breakfast", "Lunch", "Dinner", "Snack"] as const).find(
        (s) => !state.entries.some((e) => e.slot === s),
      ) ??
      "Snack";
    const entry: Entry = {
      id: crypto.randomUUID(),
      slot: chosen,
      recipe: r,
      servings: 1,
      prepared: false,
      eaten: false,
    };
    const entries = [...state.entries, entry];
    if (
      await perform(
        { action: "plan", date: state.planDate, entries },
        (s) => ({ ...s, entries }),
        `${r.name} added to your plan`,
      )
    )
      setRecipeModal(null);
  }
  async function savePreferences(p: Preferences) {
    if (
      await perform(
        { action: "preferences", value: p },
        (s) => ({ ...s, preferences: p }),
        "Your preferences are saved",
      )
    ) {
      setOnboarding(false);
      setPage("Dashboard");
    }
  }
  if (!demo && !authenticated)
    return (
      <main className="welcome">
        <a className="brand" href="/">
          <span className="brand-icon">
            <Sprout />
          </span>
          Pantry<span>Pilot</span>
        </a>
        <div className="welcome-content">
          <div className="eyebrow">A LITTLE PLANNING. A HAPPIER KITCHEN.</div>
          <h1>
            Good food starts
            <br />
            with what you have.
          </h1>
          <p>
            Your groceries, meals, and shopping list. Finally on the same page.
          </p>
          <a className="button button-primary" href="/auth/login">
            Continue with Google <ArrowRight size={18} />
          </a>
          <Button variant="outline" onClick={() => setDemo(true)}>
            Explore the local demo
          </Button>
          <p className="note">
            Your kitchen is private. No extra password to remember.
          </p>
        </div>
        <img
          src={foodPhotos.khichdi}
          alt="A colorful bowl of fresh food"
          className="welcome-photo"
        />
      </main>
    );
  if (!state)
    return (
      <main className="loading-page">
        <div className="brand">
          <Sprout /> PantryPilot
        </div>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <Button onClick={() => refresh().catch((e) => setError(e.message))}>
              Try again
            </Button>
          </>
        ) : (
          <>
            <div className="skeleton" />
            <p>Getting your kitchen ready…</p>
          </>
        )}
      </main>
    );
  const target = energyTarget(state.preferences);
  const totals = (entries: Entry[]) => {
    const values = entries.map((e) => ({
      n: nutrition(e.recipe, catalog),
      servings: e.servings,
    }));
    if (!values.length) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    if (values.some((v) => !v.n)) return null;
    return values.reduce(
      (a, v) => ({
        calories: a.calories + v.n!.calories * v.servings,
        protein: a.protein + v.n!.protein * v.servings,
        carbs: a.carbs + v.n!.carbs * v.servings,
        fat: a.fat + v.n!.fat * v.servings,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );
  };
  const planned = totals(state.entries),
    eaten = totals(state.entries.filter((e) => e.eaten));
  const missing = shortages(planRequirements(state.entries), state.inventory);
  function MealCard({
    r,
    entry,
    index = 0,
  }: {
    r: Recipe;
    entry?: Entry;
    index?: number;
  }) {
    const n = nutrition(r, catalog);
    const need = shortages(
      requirements(r, entry?.servings ?? 1),
      state!.inventory,
    );
    const uses = r.ingredients.find((r) =>
      state!.inventory.some(
        (i) => i.ingredient_id === r.ingredient_id && status(i) === "Use soon",
      ),
    );
    return (
      <article className="meal-card">
        <button
          className="meal-image-button"
          onClick={() => setRecipeModal(r)}
          aria-label={`View ${r.name}`}
        >
          <img
            src={foodPhotos[r.id] ?? foodPhotos.khichdi}
            alt=""
            loading="lazy"
          />
          <span className="photo-note">Serving inspiration</span>
          <span className="meal-image-badge">
            <Leaf size={12} />
            {entry?.slot ??
              (index === 0 ? "A kitchen favorite" : "Made for your day")}
          </span>
          <span className="round-arrow">
            <ArrowUpRight size={19} />
          </span>
        </button>
        <div className="meal-body">
          <div className="meal-meta">
            <span>
              <Clock size={13} />
              {r.prep + r.cook} min
            </span>
            <span>
              {n
                ? `${Math.round(n.calories)} kcal / serving`
                : "Nutrition pending"}
            </span>
          </div>
          <button className="text-title" onClick={() => setRecipeModal(r)}>
            {r.name}
          </button>
          <p>{r.description}</p>
          <div className="meal-foot">
            <span className={`availability ${need.length ? "amber" : ""}`}>
              <span className="dot" />
              {need.length
                ? `${need.length} ingredients needed`
                : "All ingredients in your kitchen"}
            </span>
            {uses && (
              <span className="rescue-tag">
                Uses your {ingredient(uses.ingredient_id).name.toLowerCase()}
              </span>
            )}
          </div>
          {entry && (
            <div className="entry-actions">
              <label className="serving-label">
                Servings
                <select
                  aria-label={`Servings for ${r.name}`}
                  disabled={entry.prepared || busy}
                  value={entry.servings}
                  onChange={(e) => {
                    const entries = state!.entries.map((x) =>
                      x.id === entry.id
                        ? { ...x, servings: +e.target.value }
                        : x,
                    );
                    void perform(
                      { action: "plan", date: state!.planDate, entries },
                      (s) => ({ ...s, entries }),
                      "Serving size updated",
                    );
                  }}
                >
                  {[1, 2, 3, 4, 6, 8].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              {entry.prepared ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || entry.eaten}
                  onClick={() =>
                    perform(
                      { action: "eaten", id: entry.id },
                      (s) => ({
                        ...s,
                        entries: s.entries.map((e) =>
                          e.id === entry.id ? { ...e, eaten: true } : e,
                        ),
                      }),
                      "Meal logged as eaten",
                    )
                  }
                >
                  {entry.eaten ? <CheckCheck size={15} /> : <Check size={15} />}{" "}
                  {entry.eaten ? "Eaten" : "Log as eaten"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={busy || !!need.length}
                  onClick={() => setCooking(entry)}
                >
                  <ChefHat size={15} />
                  Cooked it
                </Button>
              )}
              {!entry.prepared && (
                <button
                  className="icon-button"
                  aria-label={`Remove ${r.name} from plan`}
                  disabled={busy}
                  onClick={() => {
                    const entries = state!.entries.filter(
                      (e) => e.id !== entry.id,
                    );
                    void perform(
                      { action: "plan", date: state!.planDate, entries },
                      (s) => ({ ...s, entries }),
                      "Meal removed. Choose a replacement from the recipe library.",
                    );
                  }}
                >
                  <X size={15} />
                </button>
              )}
            </div>
          )}
        </div>
      </article>
    );
  }
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="PantryPilot home">
          <span className="brand-icon">
            <Sprout size={25} />
          </span>
          Pantry<span>Pilot</span>
        </a>
        <div className="workspace-label">YOUR EVERYDAY COMPANION</div>
        <nav>
          {nav.map(([n, I]) => (
            <button
              className={page === n ? "nav-item active" : "nav-item"}
              key={n}
              onClick={() => go(n)}
            >
              <I size={20} />
              <span>{n}</span>
              {n === "Shopping List" && state.shopping.length > 0 && (
                <b>{state.shopping.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-tip">
          <div className="tip-leaf">
            <Leaf size={23} />
          </div>
          <h3>
            Small habits.
            <br />
            Big difference.
          </h3>
          <p>A happier kitchen starts with using what you already have.</p>
          <button
            onClick={() => {
              go("Meal Planner");
              setRescue(true);
            }}
          >
            Rescue my groceries <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${page === "Profile" ? "active" : ""}`}
            onClick={() => go("Profile")}
          >
            <Settings2 size={19} />
            Preferences
          </button>
          <button className="profile-button" onClick={() => go("Profile")}>
            <span className="avatar">
              {state.preferences.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{state.preferences.name}</strong>
              <small>
                {demo ? "Your demo kitchen" : "Your personal kitchen"}
              </small>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Your space <ChevronRight size={14} /> <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <span className="date">
              {new Date().toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
            <button
              className="notification icon-button"
              aria-label="View ingredients needing attention"
              onClick={() => {
                go("My Kitchen");
                setFilter("Needs attention");
              }}
            >
              <Bell size={19} />
              {attention.length > 0 && <i />}
            </button>
            <button
              className="avatar small-avatar"
              aria-label="Open profile"
              onClick={() => go("Profile")}
            >
              {state.preferences.name[0]}
            </button>
          </div>
        </header>
        <main id="main" className="main-content">
          {demo && (
            <div className="demo-banner">
              <span>
                <span className="dot" />
                Local demo · Sample groceries, saved only in this browser.
              </span>
              <button
                onClick={() => {
                  if (cloudConfigured) {
                    setDemo(false);
                    setState(null);
                  } else
                    setToast(
                      "Connect Supabase using .env.local to enable Google sign-in and cloud sync. See README.md.",
                    );
                }}
              >
                Connect your kitchen <ArrowUpRight size={13} />
              </button>
            </div>
          )}
          {error && (
            <div role="alert" className="error-banner">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {!state.preferences.onboarded || onboarding ? (
            <Onboarding
              initial={state.preferences}
              onSave={savePreferences}
              busy={busy}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {page === "Dashboard"
                      ? "A FRESH START, EVERY DAY"
                      : page === "My Kitchen"
                        ? "GOOD THINGS YOU ALREADY HAVE"
                        : page === "Meal Planner"
                          ? "LESS GUESSWORK. MORE GOOD FOOD."
                          : page === "Shopping List"
                            ? "JUST WHAT YOUR KITCHEN NEEDS"
                            : "MAKE YOURSELF AT HOME"}
                  </div>
                  <h1>
                    {page === "Dashboard" ? (
                      <>
                        Hey {state.preferences.name.split(" ")[0]}, let’s eat
                        well <span className="wave">☀</span>
                      </>
                    ) : page === "My Kitchen" ? (
                      "A little order in your kitchen."
                    ) : page === "Meal Planner" ? (
                      "What’s cooking today?"
                    ) : page === "Shopping List" ? (
                      "Your next grocery run."
                    ) : (
                      "Your kitchen, your way."
                    )}
                  </h1>
                  <p>
                    {page === "Dashboard"
                      ? "A little planning today. A healthier, happier you tomorrow."
                      : page === "My Kitchen"
                        ? "Know what you have. Use what you love. Waste a little less."
                        : page === "Meal Planner"
                          ? "Practical meals, built around your ingredients and your day."
                          : page === "Shopping List"
                            ? "Keep the essentials close and the unnecessary extras out."
                            : "A few preferences make every recommendation feel more like you."}
                  </p>
                </div>
                {page === "Dashboard" || page === "My Kitchen" ? (
                  <Button onClick={() => setInventoryModal("new")}>
                    <Plus size={17} />
                    Add groceries
                  </Button>
                ) : page === "Meal Planner" ? (
                  <Button disabled={busy} onClick={generate}>
                    <Sparkles size={17} />
                    {busy ? "Planning…" : "Generate my meals"}
                  </Button>
                ) : page === "Shopping List" ? (
                  <Button onClick={() => setShopModal("new")}>
                    <Plus size={17} />
                    Add an item
                  </Button>
                ) : null}
              </div>
              {page === "Dashboard" && (
                <>
                  <section className="hero">
                    <div className="hero-copy">
                      <div className="hero-kicker">
                        <span className="dot" />
                        GOOD FOOD. LESS FUSS.
                      </div>
                      <h2>
                        Your kitchen has potential.
                        <br />
                        Let’s make something good.
                      </h2>
                      <p>
                        Turn what’s already in your kitchen into meals
                        <br className="desktop-br" /> you’ll actually look
                        forward to.
                      </p>
                      <Button disabled={busy} onClick={generate}>
                        <Sparkles size={17} />
                        {busy
                          ? "Finding your next favorite…"
                          : "Generate my meals"}
                        <ArrowRight size={16} />
                      </Button>
                      <span className="hero-caption">
                        Made for your ingredients. And your everyday life.
                      </span>
                    </div>
                    <div className="hero-visual">
                      <img
                        src={foodPhotos.khichdi}
                        alt="Fresh vegetables and a colorful nourishing bowl"
                      />
                      <div className="hero-sticker">
                        <span>Fresh ideas.</span>
                        <strong>Zero dinner drama.</strong>
                        <Leaf size={17} />
                      </div>
                      <span className="hero-photo-credit">
                        A little inspiration for your table
                      </span>
                    </div>
                  </section>
                  <section className="stats-grid">
                    <button
                      className="stat-card"
                      onClick={() => go("My Kitchen")}
                    >
                      <span className="stat-icon green">
                        <ShoppingBasket size={22} />
                      </span>
                      <span>
                        <small>In your kitchen</small>
                        <strong>
                          {state.inventory.length}
                          <em>ingredients</em>
                        </strong>
                      </span>
                      <ArrowUpRight className="stat-arrow" size={17} />
                    </button>
                    <button
                      className="stat-card"
                      onClick={() => {
                        go("My Kitchen");
                        setFilter("Needs attention");
                      }}
                    >
                      <span className="stat-icon peach">
                        <Clock size={22} />
                      </span>
                      <span>
                        <small>Need a little love</small>
                        <strong>
                          {attention.length}
                          <em>to check soon</em>
                        </strong>
                      </span>
                      <span className="tiny-tag">Use thoughtfully</span>
                    </button>
                    <button
                      className="stat-card"
                      onClick={() => go("Shopping List")}
                    >
                      <span className="stat-icon violet">
                        <ShoppingCart size={22} />
                      </span>
                      <span>
                        <small>Running a little low</small>
                        <strong>
                          {low.length}
                          <em>essentials</em>
                        </strong>
                      </span>
                      <ArrowUpRight className="stat-arrow" size={17} />
                    </button>
                  </section>
                  <div className="dashboard-columns">
                    <div>
                      <div className="section-heading">
                        <div>
                          <h2>
                            {state.entries.length
                              ? "On the menu today"
                              : "A little meal inspiration"}{" "}
                            <span className="count-pill">
                              {state.entries.length ||
                                Math.min(suggested.length, 3)}
                            </span>
                          </h2>
                          <p>
                            {state.entries.length
                              ? "Your plan is saved. A meal is logged only when you say so."
                              : "Simple, comforting, and a good use of what you have."}
                          </p>
                        </div>
                        <button
                          className="text-link"
                          onClick={() => go("Meal Planner")}
                        >
                          Meal planner <ArrowRight size={15} />
                        </button>
                      </div>
                      <div className="meal-grid dashboard-meals">
                        {state.entries.length
                          ? state.entries
                              .slice(0, 3)
                              .map((e, i) => (
                                <MealCard
                                  key={e.id}
                                  r={e.recipe}
                                  entry={e}
                                  index={i}
                                />
                              ))
                          : suggested
                              .slice(0, 3)
                              .map((r, i) => (
                                <MealCard r={r} index={i} key={r.id} />
                              ))}
                      </div>
                      {!suggested.length && !state.entries.length && (
                        <Empty
                          title="Let’s find your first meal"
                          text="Add a few ingredients, or review your cooking and dietary preferences."
                        />
                      )}
                      <section className="nutrition-panel panel">
                        <div className="section-heading">
                          <div>
                            <h2>A little balance, every day</h2>
                            <p>Planned and eaten are always kept separate.</p>
                          </div>
                          <span className="soft-icon">
                            <Heart size={19} />
                          </span>
                        </div>
                        <div className="nutrition-grid">
                          <div>
                            <small>Energy estimate</small>
                            <strong>
                              {target ? target.toLocaleString() : "—"}
                              <em> kcal / day</em>
                            </strong>
                            <button
                              className="text-link"
                              onClick={() => {
                                go("Profile");
                                setOnboarding(true);
                              }}
                            >
                              {target
                                ? "Edit your estimate"
                                : "Personalize your target"}{" "}
                              <ArrowUpRight size={13} />
                            </button>
                          </div>
                          <div>
                            <small>Planned energy</small>
                            <strong>
                              {planned ? Math.round(planned.calories) : "—"}
                              <em> kcal</em>
                            </strong>
                            <span>
                              {state.entries.length
                                ? `${state.entries.length} planned meals`
                                : "No meals planned yet"}
                            </span>
                          </div>
                          <div>
                            <small>Logged as eaten</small>
                            <strong>
                              {eaten ? Math.round(eaten.calories) : "—"}
                              <em> kcal</em>
                            </strong>
                            <span>
                              {state.entries.filter((e) => e.eaten).length}{" "}
                              meals logged
                            </span>
                          </div>
                        </div>
                        {!planned && (
                          <p className="note">
                            Nutrition is unavailable until all ingredients have
                            verified composition data.
                          </p>
                        )}
                      </section>
                    </div>
                    <aside className="right-column">
                      <section className="rescue-panel panel">
                        <div className="section-heading">
                          <h2>
                            <Leaf size={19} /> A little rescue mission
                          </h2>
                          <span className="orange-dot" />
                        </div>
                        <p>
                          Good ingredients deserve a good meal.
                          <br />
                          Start with these.
                        </p>
                        {attention.slice(0, 3).map((i) => (
                          <div className="rescue-item" key={i.id}>
                            <span className="ingredient-emoji">
                              {ingredient(i.ingredient_id).emoji}
                            </span>
                            <span>
                              <strong>
                                {ingredient(i.ingredient_id).name}
                              </strong>
                              <small>
                                {num(i.quantity)} {i.unit} · {i.storage}
                              </small>
                            </span>
                            <span
                              className={`status-badge ${status(i) === "Use soon" ? "amber" : "red"}`}
                            >
                              {status(i)}
                            </span>
                          </div>
                        ))}
                        {!attention.length && (
                          <p className="empty-small">
                            Nothing needs attention. A lovely place to start.
                          </p>
                        )}
                        <Button
                          variant="outline"
                          onClick={() => {
                            go("Meal Planner");
                            setRescue(true);
                          }}
                        >
                          <Leaf size={15} />
                          Rescue my groceries
                          <ArrowRight size={15} />
                        </Button>
                        <p className="tiny-note">
                          Dates aren’t a guarantee of safety. Always check your
                          food.
                        </p>
                      </section>
                      <section className="tip-card">
                        <span className="eyebrow">
                          <Sprout size={14} /> THE LITTLE THINGS
                        </span>
                        <h3>
                          Shop your kitchen
                          <br />
                          before you shop the store.
                        </h3>
                        <p>
                          A quick look at what you have can make your next
                          grocery run a little lighter.
                        </p>
                        <button
                          className="text-link"
                          onClick={() => go("My Kitchen")}
                        >
                          Take a look <ArrowRight size={15} />
                        </button>
                        <span className="tip-decoration">✳</span>
                      </section>
                    </aside>
                  </div>
                </>
              )}
              {page === "My Kitchen" && (
                <>
                  <div className="toolbar">
                    <div className="search-field">
                      <Search size={18} />
                      <input
                        aria-label="Search your kitchen"
                        placeholder="Find something in your kitchen…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    <select
                      aria-label="Filter inventory"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      {[
                        "All ingredients",
                        "Needs attention",
                        "Low stock",
                        ...categories,
                      ].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      onClick={() => setShowHistory(true)}
                    >
                      <History size={16} />
                      History
                    </Button>
                  </div>
                  <div className="inventory-grid">
                    {state.inventory
                      .filter(
                        (i) =>
                          ingredient(i.ingredient_id)
                            .name.toLowerCase()
                            .includes(query.toLowerCase()) &&
                          (filter === "All ingredients" ||
                            filter === ingredient(i.ingredient_id).category ||
                            (filter === "Needs attention" &&
                              attention.includes(i)) ||
                            (filter === "Low stock" &&
                              i.quantity <= i.minimum)),
                      )
                      .map((i) => (
                        <article className="inventory-card panel" key={i.id}>
                          <div className="inventory-top">
                            <span className="large-emoji">
                              {ingredient(i.ingredient_id).emoji}
                            </span>
                            <span
                              className={`status-badge ${["Use soon", "Low stock"].includes(status(i)) ? "amber" : ["Date passed", "Spoiled"].includes(status(i)) ? "red" : ""}`}
                            >
                              {status(i)}
                            </span>
                          </div>
                          <small className="muted">
                            {ingredient(i.ingredient_id).category}
                          </small>
                          <h3>{ingredient(i.ingredient_id).name}</h3>
                          <strong className="quantity">
                            {num(i.quantity)} <span>{i.unit}</span>
                          </strong>
                          <p className="muted">
                            {i.storage} ·{" "}
                            {i.expiry_date
                              ? `${i.date_type === "estimated" ? "Estimated freshness" : i.date_type === "use-by" ? "Use-by" : "Best-before"}: ${i.expiry_date}`
                              : "No date recorded"}
                          </p>
                          <div className="inventory-actions">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setInventoryModal(i)}
                            >
                              Edit item
                            </Button>
                            <button
                              className="text-link muted"
                              disabled={busy || i.spoiled}
                              onClick={() =>
                                perform(
                                  {
                                    action: "inventory",
                                    value: { ...i, spoiled: true },
                                  },
                                  (s) => ({
                                    ...s,
                                    inventory: s.inventory.map((x) =>
                                      x.id === i.id
                                        ? { ...x, spoiled: true }
                                        : x,
                                    ),
                                    history: [
                                      {
                                        id: crypto.randomUUID(),
                                        ingredient_id: i.ingredient_id,
                                        quantity: 0,
                                        unit: i.unit,
                                        reason: "Marked spoiled",
                                        created_at: new Date().toISOString(),
                                      },
                                      ...s.history,
                                    ],
                                  }),
                                  "Marked spoiled. Excluded from meal suggestions.",
                                )
                              }
                            >
                              Mark spoiled
                            </button>
                          </div>
                        </article>
                      ))}
                  </div>
                  {!state.inventory.length && (
                    <Empty
                      title="A fresh start for your kitchen"
                      text="Add a few ingredients. We’ll help with what comes next."
                      action={
                        <Button onClick={() => setInventoryModal("new")}>
                          <Plus size={16} />
                          Add your first grocery
                        </Button>
                      }
                    />
                  )}
                  <p className="note">
                    Estimated freshness dates are estimates, separate from
                    manufacturer use-by and best-before dates. Check storage,
                    packaging, and signs of spoilage.
                  </p>
                </>
              )}
              {page === "Meal Planner" && (
                <>
                  <div className="planner-toolbar">
                    <label>
                      Planning for
                      <input
                        type="date"
                        value={state.planDate}
                        onChange={(e) => {
                          if (!e.target.value) return;
                          if (demo) {
                            setToast(
                              "The demo supports one saved day at a time. Cloud accounts retain each day.",
                            );
                            setState({
                              ...state,
                              planDate: e.target.value,
                              entries: [],
                            });
                          } else
                            refresh(e.target.value).catch((e) =>
                              setError(e.message),
                            );
                        }}
                      />
                    </label>
                    <span className="pill">
                      <Check size={14} />
                      Changes save automatically
                    </span>
                  </div>
                  <div className="meal-grid">
                    {state.entries.map((e, i) => (
                      <MealCard key={e.id} r={e.recipe} entry={e} index={i} />
                    ))}
                  </div>
                  {!state.entries.length && (
                    <Empty
                      title="A good day starts with a little plan"
                      text="Generate a plan from your usable groceries, or add a recipe from the library below."
                      action={
                        <Button onClick={generate} disabled={busy}>
                          <Sparkles size={16} />
                          Generate my meals
                        </Button>
                      }
                    />
                  )}
                  <section className="plan-summary panel">
                    <div>
                      <h3>Your day, at a glance</h3>
                      <p>
                        {state.entries.length} planned ·{" "}
                        {state.entries.filter((e) => e.prepared).length}{" "}
                        prepared · {state.entries.filter((e) => e.eaten).length}{" "}
                        eaten
                      </p>
                    </div>
                    <div className="macro-row">
                      {(["calories", "protein", "carbs", "fat"] as const).map(
                        (k) => (
                          <span key={k}>
                            <strong>
                              {planned ? Math.round(planned[k]) : "—"}
                              {k === "calories" ? "" : "g"}
                            </strong>
                            <small>
                              {k === "calories" ? "kcal planned" : k}
                            </small>
                          </span>
                        ),
                      )}
                    </div>
                  </section>
                  {missing.length > 0 && (
                    <div className="notice">
                      <ShoppingCart size={19} />
                      <div>
                        <strong>
                          {missing.length} ingredients need a top-up for the
                          whole plan.
                        </strong>
                        <p>
                          Meal quantities are combined across all unprepared
                          meals.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const items = shoppingSuggestions(state);
                          void perform(
                            { action: "shopping", items },
                            (s) => ({
                              ...s,
                              shopping: [...s.shopping, ...items],
                            }),
                            "Missing ingredients added to your shopping list",
                          );
                        }}
                      >
                        Add to shopping
                      </Button>
                    </div>
                  )}
                  <div className="section-heading recipes-heading">
                    <div>
                      <h2>
                        {rescue
                          ? "Rescue my groceries"
                          : "Find your next favorite"}
                      </h2>
                      <p>{source}. Nutrition and costs are never invented.</p>
                    </div>
                    <button
                      className={`chip ${rescue ? "selected" : ""}`}
                      onClick={() => setRescue(!rescue)}
                    >
                      <Leaf size={15} />
                      Use-soon first
                    </button>
                  </div>
                  <div className="meal-grid">
                    {suggested.map((r, i) => (
                      <MealCard r={r} index={i} key={r.id} />
                    ))}
                  </div>
                  {!suggested.length && (
                    <Empty
                      title="No matching recipes just yet"
                      text="Check your dietary restrictions, cooking equipment, and available time in Preferences."
                    />
                  )}
                </>
              )}
              {page === "Shopping List" && (
                <>
                  <div className="shopping-intro panel">
                    <span className="stat-icon green">
                      <ShoppingCart size={24} />
                    </span>
                    <div>
                      <h3>A thoughtful little top-up</h3>
                      <p>
                        Suggestions come from low stock and missing meal
                        ingredients.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        const items = shoppingSuggestions(state);
                        if (!items.length) {
                          setToast(
                            "You’re all set. No new shopping suggestions.",
                          );
                          return;
                        }
                        void perform(
                          { action: "shopping", items },
                          (s) => ({
                            ...s,
                            shopping: [...s.shopping, ...items],
                          }),
                          "Shopping suggestions added",
                        );
                      }}
                    >
                      <Sparkles size={16} />
                      Suggest essentials
                    </Button>
                  </div>
                  {categories
                    .filter((c) =>
                      state.shopping.some(
                        (s) => ingredient(s.ingredient_id).category === c,
                      ),
                    )
                    .map((c) => (
                      <section className="shopping-group panel" key={c}>
                        <h3>
                          {c}
                          <span className="count-pill">
                            {
                              state.shopping.filter(
                                (s) =>
                                  ingredient(s.ingredient_id).category === c,
                              ).length
                            }
                          </span>
                        </h3>
                        {state.shopping
                          .filter(
                            (s) => ingredient(s.ingredient_id).category === c,
                          )
                          .map((s) => (
                            <div
                              className={`shopping-row ${s.checked ? "checked" : ""}`}
                              key={s.id}
                            >
                              <input
                                type="checkbox"
                                aria-label={`Mark ${ingredient(s.ingredient_id).name} purchased`}
                                checked={s.checked}
                                disabled={busy}
                                onChange={() =>
                                  perform(
                                    {
                                      action: "shopping",
                                      items: [{ ...s, checked: !s.checked }],
                                    },
                                    (x) => ({
                                      ...x,
                                      shopping: x.shopping.map((i) =>
                                        i.id === s.id
                                          ? { ...i, checked: !i.checked }
                                          : i,
                                      ),
                                    }),
                                    "Shopping list updated",
                                  )
                                }
                              />
                              <span className="ingredient-emoji">
                                {ingredient(s.ingredient_id).emoji}
                              </span>
                              <div className="shopping-name">
                                <strong>
                                  {ingredient(s.ingredient_id).name}
                                </strong>
                                <small>{s.reason}</small>
                              </div>
                              <button
                                className="chip"
                                onClick={() => setShopModal(s)}
                              >
                                {num(s.quantity)} {s.unit}
                              </button>
                              {s.checked && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() =>
                                    perform(
                                      { action: "purchase", id: s.id },
                                      (x) => ({
                                        ...x,
                                        shopping: x.shopping.filter(
                                          (i) => i.id !== s.id,
                                        ),
                                        inventory: [
                                          ...x.inventory,
                                          {
                                            id: crypto.randomUUID(),
                                            ingredient_id: s.ingredient_id,
                                            quantity: s.quantity,
                                            unit: s.unit,
                                            purchase_date: today(),
                                            expiry_date: null,
                                            date_type: "estimated",
                                            storage: "Pantry",
                                            minimum: 0,
                                            spoiled: false,
                                          },
                                        ],
                                        history: [
                                          {
                                            id: crypto.randomUUID(),
                                            ingredient_id: s.ingredient_id,
                                            quantity: s.quantity,
                                            unit: s.unit,
                                            reason: "Purchased",
                                            created_at:
                                              new Date().toISOString(),
                                          },
                                          ...x.history,
                                        ],
                                      }),
                                      "Moved to your kitchen. Add storage and date details when you’re ready.",
                                    )
                                  }
                                >
                                  <ArrowRight size={15} />
                                  To kitchen
                                </Button>
                              )}
                              <button
                                className="icon-button"
                                disabled={busy}
                                aria-label={`Remove ${ingredient(s.ingredient_id).name}`}
                                onClick={() =>
                                  perform(
                                    { action: "remove-shopping", id: s.id },
                                    (x) => ({
                                      ...x,
                                      shopping: x.shopping.filter(
                                        (i) => i.id !== s.id,
                                      ),
                                    }),
                                    "Item removed",
                                  )
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                      </section>
                    ))}
                  {!state.shopping.length && (
                    <Empty
                      title="A clean list. A clear head."
                      text="Add an item or let your kitchen suggest what needs a top-up."
                    />
                  )}
                  <p className="note">
                    Check off purchased items, then move them to your kitchen.
                    We don’t assume that checked items are already in stock.
                  </p>
                </>
              )}
              {page === "Profile" && (
                <div className="profile-grid">
                  <section className="panel profile-panel">
                    <span className="avatar large-avatar">
                      {state.preferences.name[0]}
                    </span>
                    <h2>{state.preferences.name}’s kitchen</h2>
                    <p>
                      {state.preferences.goal} · {state.preferences.diet}
                    </p>
                    <dl>
                      <div>
                        <dt>Cooking time</dt>
                        <dd>Up to {state.preferences.max_time} minutes</dd>
                      </div>
                      <div>
                        <dt>Daily budget</dt>
                        <dd>
                          {state.preferences.budget
                            ? `₹${state.preferences.budget}`
                            : "Not set"}
                        </dd>
                      </div>
                      <div>
                        <dt>Allergies</dt>
                        <dd>
                          {state.preferences.allergies.join(", ") ||
                            "No known allergies"}
                        </dd>
                      </div>
                      <div>
                        <dt>Equipment</dt>
                        <dd>
                          {state.preferences.equipment.join(", ") || "Not set"}
                        </dd>
                      </div>
                      <div>
                        <dt>Energy estimate</dt>
                        <dd>
                          {target ? `${target} kcal / day` : "Not personalized"}
                        </dd>
                      </div>
                    </dl>
                    <Button onClick={() => setOnboarding(true)}>
                      <Settings2 size={16} />
                      Edit preferences
                    </Button>
                  </section>
                  <div>
                    <section className="panel profile-panel">
                      <h3>Your data, your choice.</h3>
                      <p>
                        {demo
                          ? "This demo stores sample data in this browser. It does not sync to an account."
                          : "Your profile, inventory, and meals are stored in your Supabase account with user-scoped access controls."}
                      </p>
                      <p className="note">
                        Optional energy estimates use Mifflin–St Jeor × activity
                        factor, with a 200 kcal adjustment for muscle-gain
                        goals. Steps and exercise details are contextual and are
                        not counted again. Not a medical prescription.
                      </p>
                      {!demo && (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            perform(
                              { action: "signout" },
                              (s) => s,
                              "Signed out",
                            )
                          }
                        >
                          <LogOut size={16} />
                          Sign out
                        </Button>
                      )}
                    </section>
                    <section className="panel profile-panel danger-zone">
                      <h3>
                        {demo ? "Reset this demo" : "Delete your account"}
                      </h3>
                      <p>
                        {demo
                          ? "Clear local demo data and start onboarding with an empty kitchen."
                          : "Permanently remove your account and associated kitchen, profile, and meal data."}
                      </p>
                      <Button
                        variant="danger"
                        onClick={() => setDeleteConfirm(true)}
                      >
                        {demo ? "Reset demo" : "Delete account"}
                      </Button>
                    </section>
                  </div>
                </div>
              )}
            </>
          )}
          <footer>
            <span>
              <Sprout size={15} /> A little less waste. A little more
              well-being.
            </span>
            <span>Made for real life. Made for you.</span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav">
        {nav.map(([n, I]) => (
          <button
            className={page === n ? "active" : ""}
            key={n}
            onClick={() => go(n)}
          >
            <I size={20} />
            <span>
              {n === "Shopping List"
                ? "Shopping"
                : n === "Meal Planner"
                  ? "Meals"
                  : n === "My Kitchen"
                    ? "Kitchen"
                    : "Home"}
            </span>
          </button>
        ))}
        <button
          onClick={() => go("Profile")}
          className={page === "Profile" ? "active" : ""}
        >
          <UserRound size={20} />
          <span>Profile</span>
        </button>
      </nav>
      {toast && (
        <div role="status" className="toast">
          <Check size={18} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {inventoryModal && (
        <InventoryForm
          item={inventoryModal}
          catalog={catalog}
          busy={busy}
          onClose={() => setInventoryModal(null)}
          onSave={async (value, remove) => {
            const old = state.inventory.find((i) => i.id === value.id);
            if (
              await perform(
                { action: "inventory", value, remove },
                (s) => ({
                  ...s,
                  inventory: remove
                    ? s.inventory.filter((i) => i.id !== value.id)
                    : old
                      ? s.inventory.map((i) => (i.id === value.id ? value : i))
                      : [...s.inventory, value],
                  history: [
                    {
                      id: crypto.randomUUID(),
                      ingredient_id: value.ingredient_id,
                      quantity: remove
                        ? -value.quantity
                        : value.quantity - (old?.quantity ?? 0),
                      unit: value.unit,
                      reason: remove
                        ? "Removed"
                        : old
                          ? "Inventory correction"
                          : "Added groceries",
                      created_at: new Date().toISOString(),
                    },
                    ...s.history,
                  ],
                }),
                remove ? "Grocery removed" : "Your kitchen is up to date",
              )
            )
              setInventoryModal(null);
          }}
        />
      )}
      {recipeModal && (
        <Modal
          title={recipeModal.name}
          description={recipeModal.description}
          onClose={() => setRecipeModal(null)}
        >
          <div className="recipe-facts">
            <span>
              <Clock size={16} />
              {recipeModal.prep} min prep + {recipeModal.cook} min cook
            </span>
            <span>
              <Utensils size={16} />
              {recipeModal.servings} serving(s)
            </span>
          </div>
          <h3>What you’ll need</h3>
          <p className="note">
            Quantities below make {recipeModal.servings} serving(s). Adding to
            your plan starts with one serving.
          </p>
          <div className="recipe-ingredients">
            {recipeModal.ingredients.map((r, i) => (
              <div key={i}>
                <span>
                  {ingredient(r.ingredient_id).emoji}{" "}
                  {ingredient(r.ingredient_id).name}
                </span>
                <strong>
                  {r.quantity} {r.unit}
                </strong>
                <span
                  className={`status-badge ${shortages([r], state.inventory).length ? "amber" : ""}`}
                >
                  {shortages([r], state.inventory).length
                    ? "Top up"
                    : "In kitchen"}
                </span>
              </div>
            ))}
          </div>
          <h3>Let’s make it</h3>
          <ol className="recipe-steps">
            {recipeModal.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <p className="note">
            Check ingredient labels and handling instructions. Nutrition is
            estimated only when complete composition data is available.
            Additional shopping cost is unavailable.
          </p>
          <div className="modal-actions">
            <Button
              variant="outline"
              onClick={() => {
                const items = shortages(
                  requirements(recipeModal, 1),
                  state.inventory,
                )
                  .filter(
                    (i) =>
                      !state.shopping.some(
                        (s) => s.ingredient_id === i.ingredient_id,
                      ),
                  )
                  .map((i) => ({
                    ...i,
                    id: crypto.randomUUID(),
                    checked: false,
                    reason: `For ${recipeModal.name}`.slice(0, 100),
                  }));
                if (!items.length) {
                  setToast("No new missing ingredients to add.");
                  return;
                }
                void perform(
                  { action: "shopping", items },
                  (s) => ({ ...s, shopping: [...s.shopping, ...items] }),
                  "Missing ingredients added",
                );
              }}
            >
              <ShoppingCart size={16} />
              Shop missing
            </Button>
            <Button disabled={busy} onClick={() => addMeal(recipeModal)}>
              <Plus size={16} />
              Add to plan
            </Button>
          </div>
        </Modal>
      )}
      {cooking && (
        <CookingForm
          entry={cooking}
          catalog={catalog}
          busy={busy}
          onClose={() => setCooking(null)}
          onConfirm={async (actual) => {
            if (
              await perform(
                { action: "cook", id: cooking.id, actual },
                (s) => {
                  if (s.entries.find((e) => e.id === cooking.id)?.prepared)
                    return s;
                  return {
                    ...s,
                    inventory: deduct(s.inventory, actual),
                    entries: s.entries.map((e) =>
                      e.id === cooking.id ? { ...e, prepared: true } : e,
                    ),
                    history: [
                      ...actual.map((i) => ({
                        id: crypto.randomUUID(),
                        ingredient_id: i.ingredient_id,
                        quantity: -i.quantity,
                        unit: i.unit,
                        reason: "Cooked meal",
                        created_at: new Date().toISOString(),
                      })),
                      ...s.history,
                    ],
                  };
                },
                "Meal prepared. Your kitchen quantities are updated.",
              )
            )
              setCooking(null);
          }}
        />
      )}
      {shopModal && (
        <ShoppingForm
          item={shopModal}
          catalog={catalog}
          busy={busy}
          onClose={() => setShopModal(null)}
          onSave={async (item) => {
            if (
              await perform(
                { action: "shopping", items: [item] },
                (s) => ({
                  ...s,
                  shopping: s.shopping.some((i) => i.id === item.id)
                    ? s.shopping.map((i) => (i.id === item.id ? item : i))
                    : [...s.shopping, item],
                }),
                "Shopping list updated",
              )
            )
              setShopModal(null);
          }}
        />
      )}
      {showHistory && (
        <Modal
          title="Your kitchen history"
          description="Confirmed changes, most recent first."
          onClose={() => setShowHistory(false)}
        >
          {state.history.length ? (
            state.history.map((h) => (
              <div className="history-row" key={h.id}>
                <span className="ingredient-emoji">
                  {ingredient(h.ingredient_id)?.emoji}
                </span>
                <div>
                  <strong>{ingredient(h.ingredient_id)?.name}</strong>
                  <small>
                    {h.reason} · {new Date(h.created_at).toLocaleString()}
                  </small>
                </div>
                <strong>
                  {h.quantity > 0 ? "+" : ""}
                  {num(h.quantity)} {h.unit}
                </strong>
              </div>
            ))
          ) : (
            <p>No changes yet. Your next grocery addition will appear here.</p>
          )}
        </Modal>
      )}
      {deleteConfirm && (
        <Modal
          title={demo ? "Start fresh?" : "Permanently delete your account?"}
          description={
            demo
              ? "This clears the demo data in this browser."
              : "This removes your personal data and cannot be undone."
          }
          onClose={() => setDeleteConfirm(false)}
        >
          <div className="modal-actions">
            <Button variant="outline" onClick={() => setDeleteConfirm(false)}>
              Keep my kitchen
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (demo) {
                  setState(emptyState());
                  setDeleteConfirm(false);
                  go("Dashboard");
                } else
                  void perform(
                    { action: "delete-account" },
                    (s) => s,
                    "Account deleted",
                  );
              }}
            >
              {demo ? "Clear demo and start" : "Delete permanently"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Sprout size={30} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function InventoryForm({
  item,
  catalog,
  busy,
  onSave,
  onClose,
}: {
  item: Inventory | "new";
  catalog: Ingredient[];
  busy: boolean;
  onSave: (i: Inventory, remove?: boolean) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState<Inventory>(
    item === "new"
      ? {
          id: crypto.randomUUID(),
          ingredient_id: "spinach",
          quantity: 200,
          unit: "g",
          purchase_date: today(),
          expiry_date: null,
          date_type: "estimated",
          storage: "Fridge",
          minimum: 50,
          spoiled: false,
        }
      : item,
  );
  const [error, setError] = useState("");
  return (
    <Modal
      title={
        item === "new"
          ? "Something fresh for your kitchen"
          : "Edit your grocery"
      }
      description="A few details now make your next meal easier."
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const p = inventorySchema.safeParse(v);
          if (!p.success) {
            setError("Please check the quantities and dates.");
            return;
          }
          onSave(p.data);
        }}
      >
        <label>
          Ingredient
          <input
            list="ingredient-catalog"
            disabled={item !== "new"}
            value={
              catalog.find((i) => i.id === v.ingredient_id)?.name ??
              v.ingredient_id
            }
            onChange={(e) => {
              const i = catalog.find(
                (i) => i.name.toLowerCase() === e.target.value.toLowerCase(),
              );
              setV({
                ...v,
                ingredient_id: i?.id ?? e.target.value,
                unit: i?.unit ?? v.unit,
              });
            }}
            required
          />
          <datalist id="ingredient-catalog">
            {catalog.map((i) => (
              <option key={i.id} value={i.name} />
            ))}
          </datalist>
        </label>
        <div className="form-grid">
          <label>
            Quantity
            <input
              type="number"
              min="0"
              max="100000"
              step="any"
              value={v.quantity}
              onChange={(e) => setV({ ...v, quantity: +e.target.value })}
              required
            />
          </label>
          <label>
            Unit
            <select
              value={v.unit}
              disabled={item !== "new"}
              onChange={(e) =>
                setV({ ...v, unit: e.target.value as Inventory["unit"] })
              }
            >
              {units
                .filter((u) => {
                  const i = catalog.find((i) => i.id === v.ingredient_id);
                  return (
                    !i ||
                    (i.unit === "g" || i.unit === "kg"
                      ? ["g", "kg"].includes(u)
                      : i.unit === "pieces"
                        ? u === "pieces"
                        : ["ml", "l"].includes(u))
                  );
                })
                .map((u) => (
                  <option key={u}>{u}</option>
                ))}
            </select>
          </label>
          <label>
            Purchased on
            <input
              type="date"
              value={v.purchase_date}
              onChange={(e) => setV({ ...v, purchase_date: e.target.value })}
              required
            />
          </label>
          <label>
            Storage
            <select
              value={v.storage}
              onChange={(e) =>
                setV({ ...v, storage: e.target.value as Inventory["storage"] })
              }
            >
              {["Fridge", "Freezer", "Pantry"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Date (optional)
            <input
              type="date"
              value={v.expiry_date ?? ""}
              onChange={(e) =>
                setV({ ...v, expiry_date: e.target.value || null })
              }
            />
          </label>
          <label>
            Date source
            <select
              value={v.date_type}
              onChange={(e) =>
                setV({
                  ...v,
                  date_type: e.target.value as Inventory["date_type"],
                })
              }
            >
              <option value="estimated">Estimated freshness</option>
              <option value="use-by">Manufacturer use-by</option>
              <option value="best-before">Manufacturer best-before</option>
            </select>
          </label>
          <label>
            Low-stock threshold ({v.unit})
            <input
              type="number"
              min="0"
              max="100000"
              step="any"
              value={v.minimum}
              onChange={(e) => setV({ ...v, minimum: +e.target.value })}
            />
          </label>
        </div>
        {item !== "new" && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={v.spoiled}
              onChange={(e) => setV({ ...v, spoiled: e.target.checked })}
            />
            Marked spoiled / unsafe
          </label>
        )}
        <p className="note">
          Choose a catalog ingredient. Custom ingredients need reviewed dietary
          and unit metadata before recipe use.
        </p>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <div className="modal-actions">
          {item !== "new" && (
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => onSave(v, true)}
            >
              <Trash2 size={15} />
              Remove
            </Button>
          )}
          <Button
            type="submit"
            disabled={busy || !catalog.some((i) => i.id === v.ingredient_id)}
          >
            <Check size={16} />
            {busy ? "Saving…" : "Save grocery"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function CookingForm({
  entry,
  catalog,
  busy,
  onConfirm,
  onClose,
}: {
  entry: Entry;
  catalog: Ingredient[];
  busy: boolean;
  onConfirm: (actual: Recipe["ingredients"]) => void;
  onClose: () => void;
}) {
  const [actual, setActual] = useState(
    requirements(entry.recipe, entry.servings),
  );
  return (
    <Modal
      title="Made it? Let’s update your kitchen."
      description={`${entry.recipe.name} · ${entry.servings} serving(s). Correct the quantities you actually used.`}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(actual);
        }}
      >
        {actual.map((i, n) => (
          <label className="cooking-row" key={i.ingredient_id}>
            <span>{catalog.find((c) => c.id === i.ingredient_id)?.name}</span>
            <input
              aria-label={`Actual ${i.ingredient_id} used`}
              type="number"
              min="0.01"
              max="10000"
              step="any"
              required
              value={i.quantity}
              onChange={(e) =>
                setActual(
                  actual.map((v, k) =>
                    k === n ? { ...v, quantity: +e.target.value } : v,
                  ),
                )
              }
            />
            <span>{i.unit}</span>
          </label>
        ))}
        <p className="note">
          This deducts stock once and marks the meal prepared. You can log it as
          eaten separately.
        </p>
        <div className="modal-actions">
          <Button type="submit" disabled={busy}>
            <Check size={16} />
            {busy ? "Updating…" : "Confirm cooking & update stock"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function ShoppingForm({
  item,
  catalog,
  busy,
  onSave,
  onClose,
}: {
  item: Shopping | "new";
  catalog: Ingredient[];
  busy: boolean;
  onSave: (item: Shopping) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState<Shopping>(
    item === "new"
      ? {
          id: crypto.randomUUID(),
          ingredient_id: "milk",
          quantity: 500,
          unit: "ml",
          checked: false,
          reason: "Added by you",
        }
      : item,
  );
  return (
    <Modal
      title={
        item === "new" ? "Add to your shopping list" : "Edit shopping item"
      }
      description="Just the essentials, in the quantities you need."
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(v);
        }}
      >
        <label>
          Ingredient
          <select
            value={v.ingredient_id}
            onChange={(e) =>
              setV({
                ...v,
                ingredient_id: e.target.value,
                unit: catalog.find((i) => i.id === e.target.value)!.unit,
              })
            }
          >
            {catalog.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantity ({v.unit})
          <input
            type="number"
            min="0.01"
            step="any"
            max="100000"
            required
            value={v.quantity}
            onChange={(e) => setV({ ...v, quantity: +e.target.value })}
          />
        </label>
        <div className="modal-actions">
          <Button disabled={busy}>Save item</Button>
        </div>
      </form>
    </Modal>
  );
}
