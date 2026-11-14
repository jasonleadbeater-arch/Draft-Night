-- Run in Supabase: SQL Editor > New query
create table rooms (code text primary key, set_code text not null, status text not null default 'lobby', round int not null default 0, created_at timestamptz default now());
create table players (id uuid primary key default gen_random_uuid(), room_code text references rooms(code), name text, seat int);
create table packs (id uuid primary key default gen_random_uuid(), room_code text references rooms(code), round int, holder_seat int, cards jsonb);
create table picks (id uuid primary key default gen_random_uuid(), room_code text references rooms(code), player_id uuid references players(id), card jsonb, in_deck boolean default false, created_at timestamptz default now());
create table boards (room_code text, player_id uuid, state jsonb, primary key (room_code, player_id));

-- Friends-only game: open access with the anon key. Tighten before going public.
do $$ declare t text; begin
  foreach t in array array['rooms','players','packs','picks','boards'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "open" on %I for all using (true) with check (true)', t);
    execute format('alter publication supabase_realtime add table %I', t);
  end loop;
end $$;

-- Saved player names (added later; safe to run on its own if you already ran the rest)
create table if not exists profiles (name text primary key, created_at timestamptz default now());
alter table profiles enable row level security;
create policy "open" on profiles for all using (true) with check (true);
