import "server-only";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import {
  defaults,
  today,
  type State,
  type Inventory,
  type Shopping,
  type History,
  type Entry,
  type Preferences,
} from "./domain";
import type { Command } from "./commands";
const host = globalThis as typeof globalThis & {
  pantryDatabase?: Promise<PGlite>;
};
export function database() {
  if (process.env.VERCEL)
    throw Error(
      "Configure Supabase for Vercel. Local storage requires a persistent Node server.",
    );
  return (host.pantryDatabase ??= openDatabase());
}
async function openDatabase() {
  const dir = path.resolve(
    process.env.PANTRYPILOT_DATA_DIR ||
      path.join(process.cwd(), ".data", "pantrypilot"),
  );
  await mkdir(dir, { recursive: true });
  const db = new PGlite(dir);
  await db.waitReady;
  const check = await db.query<{ exists: boolean }>(
    "select exists(select 1 from information_schema.tables where table_schema='auth' and table_name='users')",
  );
  if (!check.rows[0].exists)
    await db.transaction(async (tx) => {
      await tx.exec(`create role anon;create role authenticated;create schema auth;
   create table auth.users(id uuid primary key, raw_user_meta_data jsonb not null default '{}', email text not null unique, password_hash text not null, created_at timestamptz not null default now());
   create table auth.sessions(token_hash text primary key,user_id uuid not null references auth.users on delete cascade,expires_at timestamptz not null);
   create index on auth.sessions(user_id);
   create table auth.login_limits(key text not null,window_start timestamptz not null,attempts integer not null,primary key(key,window_start));
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;`);
      const sql = await readFile(
        path.join(process.cwd(), "supabase/migrations/001_initial.sql"),
        "utf8",
      );
      await tx.exec(
        sql.replace("create extension if not exists pgcrypto;", ""),
      );
      await tx.exec(
        "grant select,insert,update,delete on all tables in schema public to authenticated",
      );
    });
  return db;
}
export async function asUser<T>(
  id: string,
  fn: (tx: Transaction) => Promise<T>,
) {
  return (await database()).transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    await tx.exec("set local role authenticated");
    return fn(tx);
  });
}
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function passwordHash(
  password: string,
  salt = randomBytes(16).toString("hex"),
) {
  const hash = await new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (e, key) => (e ? reject(e) : resolve(key)),
    ),
  );
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || expected?.length !== 128) return false;
  const actual = (await passwordHash(password, salt)).split(":")[1];
  return timingSafeEqual(
    Buffer.from(actual, "hex"),
    Buffer.from(expected, "hex"),
  );
}
export async function takeLoginAttempt(email: string) {
  return (await database()).transaction(async (tx) => {
    await tx.exec(
      "delete from auth.login_limits where window_start < now()-interval '1 day'",
    );
    for (const [key, max] of [
      [hashToken(email), 12],
      ["global", 300],
    ] as const) {
      const r = await tx.query<{ attempts: number }>(
        "insert into auth.login_limits(key,window_start,attempts) values($1,date_trunc('hour',now()),1) on conflict(key,window_start) do update set attempts=auth.login_limits.attempts+1 returning attempts",
        [key],
      );
      if (r.rows[0].attempts > max) return false;
    }
    return true;
  });
}
export async function registerLocal(
  name: string,
  email: string,
  password: string,
) {
  const hash = await passwordHash(password);
  const id = randomUUID();
  await (
    await database()
  ).query(
    "insert into auth.users(id,email,password_hash,raw_user_meta_data) values($1,$2,$3,$4::jsonb)",
    [id, email, hash, JSON.stringify({ full_name: name })],
  );
  return id;
}
export async function loginLocal(email: string, password: string) {
  const r = await (
    await database()
  ).query<{ id: string; password_hash: string }>(
    "select id,password_hash from auth.users where email=$1",
    [email],
  );
  const user = r.rows[0];
  const stored = user?.password_hash ?? `${"0".repeat(32)}:${"0".repeat(128)}`;
  const valid = await verifyPassword(password, stored);
  return valid && user ? user.id : null;
}
export async function createLocalSession(id: string) {
  const token = randomBytes(32).toString("hex");
  await (
    await database()
  ).transaction(async (tx) => {
    await tx.exec("delete from auth.sessions where expires_at<now()");
    await tx.query(
      "insert into auth.sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '7 days')",
      [hashToken(token), id],
    );
  });
  return token;
}
export async function localUser(token?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const r = await (
    await database()
  ).query<{ id: string; email: string }>(
    "select u.id,u.email from auth.sessions s join auth.users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now()",
    [hashToken(token)],
  );
  return r.rows[0] ?? null;
}
export async function revokeLocalSession(token?: string) {
  if (token)
    await (
      await database()
    ).query("delete from auth.sessions where token_hash=$1", [
      hashToken(token),
    ]);
}
export async function deleteLocalUser(id: string) {
  await (await database()).query("delete from auth.users where id=$1", [id]);
}
export async function localState(id: string, date = today()): Promise<State> {
  return asUser(id, async (tx) => {
    const profile = (
      await tx.query<{ name: string; onboarded: boolean }>(
        "select name,onboarded from public.profiles where id=$1",
        [id],
      )
    ).rows[0];
    if (!profile) throw Error("Account not found");
    const prefs = (
      await tx.query<{ data: Partial<Preferences> }>(
        "select data from public.user_preferences",
      )
    ).rows[0]?.data;
    const goals = (
      await tx.query<{ data: Preferences["nutrition"] }>(
        "select data from public.nutrition_goals",
      )
    ).rows[0]?.data;
    const inventory = (
      await tx.query<Inventory>(
        "select id,ingredient_id,quantity::float8,unit,purchase_date::text,expiry_date::text,date_type,storage,minimum::float8,spoiled from public.inventory_items order by created_at,id",
      )
    ).rows;
    const shopping = (
      await tx.query<Shopping>(
        "select id,ingredient_id,quantity::float8,unit,checked,reason from public.shopping_items order by created_at,id",
      )
    ).rows;
    const history = (
      await tx.query<History>(
        "select id,ingredient_id,quantity::float8,unit,reason,created_at::text from public.inventory_transactions order by created_at desc limit 100",
      )
    ).rows;
    const entries = (
      await tx.query<Entry>(
        "select e.id,e.slot,e.servings::float8,e.prepared,e.eaten,r.data as recipe from public.meal_plan_entries e join public.meal_plans p on p.id=e.plan_id join public.recipes r on r.id=e.recipe_id where p.plan_date=$1::date order by e.created_at,e.id",
        [date],
      )
    ).rows;
    return {
      preferences: {
        ...defaults,
        ...prefs,
        ...profile,
        nutrition: goals ?? null,
      },
      inventory,
      shopping,
      history,
      entries,
      planDate: date,
    };
  });
}
export async function localCommand(id: string, c: Command) {
  return asUser(id, async (tx) => {
    switch (c.action) {
      case "preferences":
        await tx.query("select public.save_preferences($1::jsonb)", [
          JSON.stringify(c.value),
        ]);
        break;
      case "inventory":
        await tx.query("select public.change_inventory($1::jsonb,$2)", [
          JSON.stringify(c.value),
          c.remove ?? false,
        ]);
        break;
      case "plan":
        await tx.query("select public.save_plan($1::date,$2::jsonb)", [
          c.date,
          JSON.stringify(c.entries),
        ]);
        break;
      case "cook":
        await tx.query("select public.confirm_cooking($1::uuid,$2::jsonb)", [
          c.id,
          JSON.stringify(c.actual),
        ]);
        break;
      case "eaten":
        await tx.query("select public.log_eaten($1::uuid)", [c.id]);
        break;
      case "purchase":
        await tx.query("select public.purchase_item($1::uuid)", [c.id]);
        break;
      case "remove-shopping":
        await tx.query("delete from public.shopping_items where id=$1", [c.id]);
        break;
      case "shopping":
        for (const s of c.items)
          await tx.query(
            "insert into public.shopping_items(id,user_id,ingredient_id,quantity,unit,checked,reason) values($1,$2,$3,$4,$5,$6,$7) on conflict(id) do update set ingredient_id=excluded.ingredient_id,quantity=excluded.quantity,unit=excluded.unit,checked=excluded.checked,reason=excluded.reason",
            [
              s.id,
              id,
              s.ingredient_id,
              s.quantity,
              s.unit,
              s.checked,
              s.reason,
            ],
          );
        break;
    }
  });
}
export async function localAIToken(id: string) {
  return asUser(
    id,
    async (tx) =>
      (
        await tx.query<{ allowed: boolean }>(
          "select public.take_ai_token() as allowed",
        )
      ).rows[0].allowed,
  );
}
