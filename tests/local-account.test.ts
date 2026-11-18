import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
vi.mock("server-only", () => ({}));
import {
  database,
  registerLocal,
  loginLocal,
  localUser,
  createLocalSession,
  revokeLocalSession,
  localCommand,
  localState,
  deleteLocalUser,
  takeLoginAttempt,
} from "../src/lib/local-database";
import { defaults } from "../src/lib/domain";
import { recipes } from "../src/lib/catalog";
describe("real local accounts and persistence", () => {
  let dir: string, a: string, b: string, token: string;
  const password = "A-long-test-password-27!";
  const item = crypto.randomUUID();
  const clearHost = () => {
    delete (globalThis as typeof globalThis & { pantryDatabase?: unknown })
      .pantryDatabase;
  };
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "pantrypilot-account-test-"));
    process.env.PANTRYPILOT_DATA_DIR = dir;
    clearHost();
    a = await registerLocal("Sam", "sam@example.test", password);
    b = await registerLocal("Another", "another@example.test", password);
  });
  afterAll(async () => {
    await (await database()).close();
    clearHost();
    delete process.env.PANTRYPILOT_DATA_DIR;
    const relative = path.relative(tmpdir(), path.resolve(dir));
    if (
      !relative.startsWith("..") &&
      !path.isAbsolute(relative) &&
      relative.startsWith("pantrypilot-account-test-")
    )
      await rm(dir, { recursive: true, force: true });
  });
  it("hashes passwords and starts with an empty, un-onboarded kitchen", async () => {
    expect(await loginLocal("sam@example.test", password)).toBe(a);
    expect(
      await loginLocal("sam@example.test", "incorrect password"),
    ).toBeNull();
    expect(await loginLocal("absent@example.test", password)).toBeNull();
    const rows = await (
      await database()
    ).query<{ password_hash: string }>(
      "select password_hash from auth.users where id=$1",
      [a],
    );
    expect(rows.rows[0].password_hash).not.toContain(password);
    const s = await localState(a);
    expect(s.preferences.name).toBe("Sam");
    expect(s.preferences.onboarded).toBe(false);
    expect(s.inventory).toEqual([]);
  });
  it("creates opaque sessions and persists onboarding, lots, and dated plans", async () => {
    token = await createLocalSession(a);
    expect((await localUser(token))?.id).toBe(a);
    expect(await localUser("forged-token")).toBeNull();
    await localCommand(a, {
      action: "preferences",
      value: { ...defaults, name: "Sam", onboarded: true },
    });
    await localCommand(a, {
      action: "inventory",
      value: {
        id: item,
        ingredient_id: "rice",
        quantity: 200,
        unit: "g",
        purchase_date: "2026-11-17",
        expiry_date: null,
        date_type: "estimated",
        storage: "Pantry",
        minimum: 20,
        spoiled: false,
      },
    });
    await localCommand(a, {
      action: "plan",
      date: "2026-11-18",
      entries: [
        {
          id: crypto.randomUUID(),
          slot: "Lunch",
          servings: 1,
          prepared: false,
          eaten: false,
          recipe: {
            ...recipes[0],
            ingredients: [{ ingredient_id: "rice", quantity: 60, unit: "g" }],
          },
        },
      ],
    });
    expect((await localState(a, "2026-11-18")).entries).toHaveLength(1);
    expect((await localState(a, "2026-11-19")).entries).toHaveLength(0);
  });
  it("survives database closure and reopening, including the session", async () => {
    await (await database()).close();
    clearHost();
    expect((await localUser(token))?.id).toBe(a);
    const s = await localState(a, "2026-11-18");
    expect(s.preferences.onboarded).toBe(true);
    expect(s.inventory[0].quantity).toBe(200);
    expect(s.entries).toHaveLength(1);
  });
  it("isolates owners even across concurrent requests", async () => {
    const [sa, sb] = await Promise.all([localState(a), localState(b)]);
    expect(sa.inventory).toHaveLength(1);
    expect(sb.inventory).toHaveLength(0);
    await expect(
      localCommand(b, {
        action: "inventory",
        value: { ...sa.inventory[0], quantity: 999 },
      }),
    ).rejects.toThrow();
    expect((await localState(a)).inventory[0].quantity).toBe(200);
  });
  it("serializes duplicate cooking and records one deduction", async () => {
    const s = await localState(a, "2026-11-18");
    const c = {
      action: "cook" as const,
      id: s.entries[0].id,
      actual: [{ ingredient_id: "rice", quantity: 60, unit: "g" as const }],
    };
    await Promise.all([localCommand(a, c), localCommand(a, c)]);
    const result = await localState(a, "2026-11-18");
    expect(result.inventory[0].quantity).toBe(140);
    expect(
      result.history.filter((h) => h.reason === "Cooked meal"),
    ).toHaveLength(1);
    expect(result.entries[0].eaten).toBe(false);
  });
  it("enforces sign-in limits, invalidates logout, and cascades deletion", async () => {
    for (let i = 0; i < 12; i++)
      expect(await takeLoginAttempt("rate@example.test")).toBe(true);
    expect(await takeLoginAttempt("rate@example.test")).toBe(false);
    await revokeLocalSession(token);
    expect(await localUser(token)).toBeNull();
    const t = await createLocalSession(b);
    await deleteLocalUser(b);
    expect(await localUser(t)).toBeNull();
    expect(await loginLocal("another@example.test", password)).toBeNull();
  });
});
