-- Nixer Browser · Supabase setup
-- Ejecuta este SQL en el SQL Editor de tu proyecto Supabase (gratis).
-- Crea la tabla de sincronización con RLS para que cada usuario solo
-- lea/escriba sus propias filas (auth.uid()).

create table if not exists public.sync_data (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.sync_data enable row level security;

create policy "sync_data_select_own" on public.sync_data
  for select using (auth.uid() = user_id);
create policy "sync_data_insert_own" on public.sync_data
  for insert with check (auth.uid() = user_id);
create policy "sync_data_update_own" on public.sync_data
  for update using (auth.uid() = user_id);
create policy "sync_data_delete_own" on public.sync_data
  for delete using (auth.uid() = user_id);
