-- Udbakke: Vinted annonce-udkast
-- Kør denne fil én gang mod projektets database.

create extension if not exists pg_net;

create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'afventer' check (status in ('afventer', 'ny', 'afsendt', 'kasseret')),
  title text,
  description text,
  category text,
  condition text,
  price text,
  price_note text,
  image_path text not null,
  image_url text not null,
  source_file text,
  created_at timestamptz not null default now(),
  posted_at timestamptz
);

alter table public.drafts enable row level security;

drop policy if exists "anon can read drafts" on public.drafts;
create policy "anon can read drafts" on public.drafts
  for select using (true);

drop policy if exists "anon can insert drafts" on public.drafts;
create policy "anon can insert drafts" on public.drafts
  for insert with check (status = 'afventer');

drop policy if exists "anon can update drafts" on public.drafts;
create policy "anon can update drafts" on public.drafts
  for update using (true) with check (status in ('afsendt', 'kasseret'));

alter publication supabase_realtime add table public.drafts;

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "public read photos" on storage.objects;
create policy "public read photos" on storage.objects
  for select using (bucket_id = 'photos');

drop policy if exists "anon can upload photos" on storage.objects;
create policy "anon can upload photos" on storage.objects
  for insert with check (bucket_id = 'photos');

-- Webhook: kaldes af databasen selv, hver gang en ny raekke med status
-- 'afventer' indsaettes. Denne funktion bliver erstattet (CREATE OR REPLACE)
-- af update_webhook.sql med den rigtige URL og hemmelighed, naar Edge
-- Functionen er deployet. Placeholder-versionen her gor ingenting.
create or replace function public.notify_new_draft()
returns trigger
language plpgsql
security definer
as $$
begin
  return new;
end;
$$;

drop trigger if exists on_draft_pending on public.drafts;
create trigger on_draft_pending
  after insert on public.drafts
  for each row
  execute function public.notify_new_draft();
