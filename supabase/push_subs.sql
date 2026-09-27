-- Push-abonnementer. Én pr. enhed (endpoint er unik). Kun serveren (service
-- role) roerer den; klienten sender sit abonnement via en Edge Function.
create table if not exists public.push_subs (
  endpoint    text primary key,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);
alter table public.push_subs enable row level security;
-- Ingen policies = ingen adgang for anon/authenticated. Kun service role
-- (som omgaar RLS) laeser og skriver. Abonnementer er ikke noget, en klient
-- skal kunne liste.
