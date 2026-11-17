-- Apply in a new Supabase project. All private rows are owned by auth.uid().
create extension if not exists pgcrypto;
create table public.profiles(id uuid primary key references auth.users on delete cascade, name text not null default 'Friend', onboarded boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.user_preferences(id uuid primary key default gen_random_uuid(), user_id uuid not null unique references public.profiles on delete cascade, data jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.nutrition_goals(id uuid primary key default gen_random_uuid(),user_id uuid not null unique references public.profiles on delete cascade,data jsonb not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.ingredients(id text primary key,name text not null,category text not null,unit text not null check(unit in ('g','kg','ml','l','pieces')),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
insert into public.ingredients(id,name,category,unit) values ('spinach','Spinach','Vegetables','g'),('tomato','Tomato','Vegetables','g'),('onion','Onion','Vegetables','g'),('carrot','Carrot','Vegetables','g'),('potato','Potato','Vegetables','g'),('banana','Banana','Fruits','g'),('milk','Milk','Dairy','ml'),('paneer','Paneer','Dairy','g'),('rice','Rice (dry)','Grains','g'),('oats','Oats (dry)','Grains','g'),('poha','Poha (dry)','Grains','g'),('lentils','Lentils (dry)','Pulses and legumes','g'),('besan','Besan','Pulses and legumes','g'),('eggs','Eggs','Eggs and meat','pieces'),('oil','Olive oil','Pantry essentials','ml'),('salt','Salt','Spices','g'),('cumin','Cumin','Spices','g'),('turmeric','Turmeric','Spices','g');
create table public.inventory_items(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles on delete cascade,ingredient_id text not null references public.ingredients,quantity numeric not null check(quantity>=0),unit text not null check(unit in ('g','kg','ml','l','pieces')),purchase_date date not null default current_date,expiry_date date,date_type text not null check(date_type in ('best-before','use-by','estimated')),storage text not null check(storage in ('Fridge','Freezer','Pantry')),minimum numeric not null default 0 check(minimum>=0),spoiled boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.inventory_transactions(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles on delete cascade,ingredient_id text not null references public.ingredients,quantity numeric not null,unit text not null,reason text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.recipes(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles on delete cascade,data jsonb not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,user_id));
create table public.recipe_ingredients(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles on delete cascade,recipe_id uuid not null,ingredient_id text not null references public.ingredients,quantity numeric not null check(quantity>0),unit text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),foreign key(recipe_id,user_id) references public.recipes(id,user_id) on delete cascade);
create table public.meal_plans(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles on delete cascade,plan_date date not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(user_id,plan_date),unique(id,user_id));
create table public.meal_plan_entries(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles on delete cascade,plan_id uuid not null,recipe_id uuid not null,slot text not null check(slot in ('Breakfast','Lunch','Dinner','Snack')),servings numeric not null check(servings>0 and servings<=8),prepared boolean not null default false,eaten boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),foreign key(plan_id,user_id) references public.meal_plans(id,user_id) on delete cascade,foreign key(recipe_id,user_id) references public.recipes(id,user_id),unique(id,user_id));
create table public.meal_logs(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles on delete cascade,entry_id uuid not null unique,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),foreign key(entry_id,user_id) references public.meal_plan_entries(id,user_id) on delete cascade);
create table public.shopping_items(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles on delete cascade,ingredient_id text not null references public.ingredients,quantity numeric not null check(quantity>0),unit text not null check(unit in ('g','kg','ml','l','pieces')),checked boolean not null default false,reason text not null default 'Added by you',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.rate_limits(user_id uuid not null references public.profiles on delete cascade,window_start timestamptz not null,count integer not null default 0,primary key(user_id,window_start));
create function public.touch_updated() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now();return new;end; $$;
do $$ declare t text; begin foreach t in array array['profiles','user_preferences','nutrition_goals','inventory_items','inventory_transactions','recipes','recipe_ingredients','meal_plans','meal_plan_entries','meal_logs','shopping_items'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy own_rows on public.%I for all to authenticated using (%I=auth.uid()) with check (%I=auth.uid())',t,case when t='profiles' then 'id' else 'user_id' end,case when t='profiles' then 'id' else 'user_id' end);
 execute format('create trigger update_timestamp before update on public.%I for each row execute function public.touch_updated()',t);
 if t<>'profiles' then execute format('create index on public.%I(user_id)',t);end if;
 end loop;end $$;
alter table public.ingredients enable row level security;
create policy catalog_read on public.ingredients for select to authenticated using(true);
alter table public.rate_limits enable row level security;
create index on public.inventory_items(user_id,ingredient_id,expiry_date);
create function public.new_profile() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.profiles(id,name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name','Friend'));return new;end; $$;
create trigger new_user after insert on auth.users for each row execute function public.new_profile();
create function public.save_preferences(p jsonb) returns void language plpgsql security invoker set search_path='' as $$ begin
 update public.profiles set name=p->>'name',onboarded=(p->>'onboarded')::boolean where id=auth.uid();
 insert into public.user_preferences(user_id,data) values(auth.uid(),p-'nutrition') on conflict(user_id) do update set data=excluded.data;
 if p->'nutrition'='null'::jsonb then delete from public.nutrition_goals where user_id=auth.uid();else insert into public.nutrition_goals(user_id,data) values(auth.uid(),p->'nutrition') on conflict(user_id) do update set data=excluded.data;end if;
 end; $$;
create function public.change_inventory(item jsonb,remove_item boolean default false) returns void language plpgsql security invoker set search_path='' as $$ declare old public.inventory_items; begin
 -- Per-user lock serializes edits, purchases, and cooking.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into old from public.inventory_items where id=(item->>'id')::uuid and user_id=auth.uid() for update;
 if old.id is not null and (old.ingredient_id<>item->>'ingredient_id' or old.unit<>item->>'unit') then raise exception 'Keep a lot ingredient and unit unchanged; remove and re-add it instead';end if;
 if remove_item then delete from public.inventory_items where id=old.id;else
 insert into public.inventory_items(id,user_id,ingredient_id,quantity,unit,purchase_date,expiry_date,date_type,storage,minimum,spoiled) values((item->>'id')::uuid,auth.uid(),item->>'ingredient_id',(item->>'quantity')::numeric,item->>'unit',(item->>'purchase_date')::date,(item->>'expiry_date')::date,item->>'date_type',item->>'storage',(item->>'minimum')::numeric,(item->>'spoiled')::boolean)
 on conflict(id) do update set ingredient_id=excluded.ingredient_id,quantity=excluded.quantity,unit=excluded.unit,purchase_date=excluded.purchase_date,expiry_date=excluded.expiry_date,date_type=excluded.date_type,storage=excluded.storage,minimum=excluded.minimum,spoiled=excluded.spoiled;
 end if;
 insert into public.inventory_transactions(user_id,ingredient_id,quantity,unit,reason) values(auth.uid(),item->>'ingredient_id',case when remove_item then -coalesce(old.quantity,0) else (item->>'quantity')::numeric-coalesce(old.quantity,0) end,item->>'unit',case when remove_item then 'Removed' when (item->>'spoiled')::boolean then 'Marked spoiled' else 'Inventory correction / addition' end);
 end; $$;
create function public.save_plan(d date,entries jsonb) returns void language plpgsql security invoker set search_path='' as $$ declare plan uuid; e jsonb;r uuid; i jsonb;begin
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 insert into public.meal_plans(user_id,plan_date) values(auth.uid(),d) on conflict(user_id,plan_date) do update set updated_at=now() returning id into plan;
 delete from public.meal_plan_entries where plan_id=plan and not prepared;
 for e in select value from jsonb_array_elements(entries) loop
 if exists(select 1 from public.meal_plan_entries where id=(e->>'id')::uuid and prepared) then continue;end if;
 insert into public.recipes(user_id,data) values(auth.uid(),e->'recipe') returning id into r;
 for i in select value from jsonb_array_elements(e->'recipe'->'ingredients') loop insert into public.recipe_ingredients(user_id,recipe_id,ingredient_id,quantity,unit) values(auth.uid(),r,i->>'ingredient_id',(i->>'quantity')::numeric,i->>'unit');end loop;
 insert into public.meal_plan_entries(id,user_id,plan_id,recipe_id,slot,servings) values((e->>'id')::uuid,auth.uid(),plan,r,e->>'slot',(e->>'servings')::numeric);
 end loop;end; $$;
create function public.confirm_cooking(entry uuid,actual jsonb) returns void language plpgsql security invoker set search_path='' as $$ declare e public.meal_plan_entries;req record;stock public.inventory_items;left_q numeric;take_q numeric;factor numeric;begin
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into e from public.meal_plan_entries where id=entry and user_id=auth.uid() for update;
 if e.id is null then raise exception 'Meal not found';end if;
 if e.prepared then return;end if;
 if jsonb_array_length(actual)=0 then raise exception 'Ingredients required';end if;
 for req in select x->>'ingredient_id' as ingredient_id, x->>'unit' as unit,sum((x->>'quantity')::numeric) as quantity from jsonb_array_elements(actual) x group by 1,2 order by 1,2 loop
 if req.quantity<=0 or req.unit not in ('g','kg','ml','l','pieces') then raise exception 'Invalid quantity';end if;
 left_q=req.quantity*case when req.unit in ('kg','l') then 1000 else 1 end;
 for stock in select * from public.inventory_items where user_id=auth.uid() and ingredient_id=req.ingredient_id and not spoiled and (expiry_date is null or expiry_date>=current_date) and (case when unit in ('g','kg') then 1 when unit in ('ml','l') then 2 else 3 end)=(case when req.unit in ('g','kg') then 1 when req.unit in ('ml','l') then 2 else 3 end) order by expiry_date nulls last,id for update loop
 factor=case when stock.unit in ('kg','l') then 1000 else 1 end;take_q=least(left_q,stock.quantity*factor);
 if take_q>0 then update public.inventory_items set quantity=quantity-take_q/factor where id=stock.id;
 insert into public.inventory_transactions(user_id,ingredient_id,quantity,unit,reason) values(auth.uid(),stock.ingredient_id,-take_q/factor,stock.unit,'Cooked meal');end if;
 left_q=left_q-take_q;exit when left_q<=0;end loop;
 if left_q>0 then raise exception 'Insufficient usable inventory';end if;end loop;
 update public.meal_plan_entries set prepared=true where id=entry;
 end; $$;
create function public.log_eaten(entry uuid) returns void language plpgsql security invoker set search_path='' as $$ begin
 if not exists(select 1 from public.meal_plan_entries where id=entry and user_id=auth.uid() and prepared) then raise exception 'Prepare this meal first';end if;
 insert into public.meal_logs(user_id,entry_id) values(auth.uid(),entry) on conflict(entry_id) do nothing;
 update public.meal_plan_entries set eaten=true where id=entry;end; $$;
create function public.purchase_item(item_id uuid) returns void language plpgsql security invoker set search_path='' as $$ declare s public.shopping_items;begin
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into s from public.shopping_items where id=item_id and user_id=auth.uid() for update;
 if s.id is null then return;end if;
 if not s.checked then raise exception 'Check purchased item first';end if;
 insert into public.inventory_items(user_id,ingredient_id,quantity,unit,date_type,storage) values(auth.uid(),s.ingredient_id,s.quantity,s.unit,'estimated','Pantry');
 insert into public.inventory_transactions(user_id,ingredient_id,quantity,unit,reason) values(auth.uid(),s.ingredient_id,s.quantity,s.unit,'Purchased');
 delete from public.shopping_items where id=s.id;end; $$;
create function public.take_ai_token() returns boolean language plpgsql security definer set search_path='' as $$ declare n integer;begin
 if auth.uid() is null then return false;end if;
 insert into public.rate_limits(user_id,window_start,count) values(auth.uid(),date_trunc('hour',now()),1) on conflict(user_id,window_start) do update set count=public.rate_limits.count+1 returning count into n;return n<=10;end; $$;
-- Explicitly limit function invocation to authenticated sessions.
revoke all on function public.save_preferences(jsonb),public.change_inventory(jsonb,boolean),public.save_plan(date,jsonb),public.confirm_cooking(uuid,jsonb),public.log_eaten(uuid),public.purchase_item(uuid),public.take_ai_token() from public,anon;
grant execute on function public.save_preferences(jsonb),public.change_inventory(jsonb,boolean),public.save_plan(date,jsonb),public.confirm_cooking(uuid,jsonb),public.log_eaten(uuid),public.purchase_item(uuid),public.take_ai_token() to authenticated;
