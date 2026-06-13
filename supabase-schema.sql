create extension if not exists pgcrypto;

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title text not null,
  body text not null default '',
  tag text not null default '',
  snippets jsonb not null default '[]'::jsonb,
  image_data text not null default '',
  image_name text not null default '',
  updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.notes enable row level security;

create policy "Users can view their own notes"
on public.notes
for select
using (auth.uid() = user_id);

create policy "Users can insert their own notes"
on public.notes
for insert
with check (auth.uid() = user_id);

create policy "Users can update their own notes"
on public.notes
for update
using (auth.uid() = user_id);

create policy "Users can delete their own notes"
on public.notes
for delete
using (auth.uid() = user_id);
