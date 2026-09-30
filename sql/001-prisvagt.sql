-- Prisvagt: hold øje med det, der er lagt op, og sæt prisen ned indtil det er solgt.
--
-- To tabeller, fordi de svarer paa hvert sit spoergsmaal:
--   listings     - hvad ligger der ude lige nu, til hvilken pris, og hvornaar
--                  skal der kigges paa det igen.
--   price_events - hvad er der sket med den vare. Det er historikken, baade
--                  modellen og mennesket doemmer ud fra: en nedsaettelse, der
--                  ikke rykkede noget, er et argument for at stoppe med at
--                  saenke, ikke for at saenke igen.

create table if not exists public.listings (
  id            uuid primary key default gen_random_uuid(),
  draft_id      uuid references public.drafts(id) on delete set null,
  platform      text not null check (platform in ('vinted','dba','reshopper')),
  external_id   text,
  url           text,
  title         text,
  search_query  text,

  price         integer not null,
  start_price   integer not null,
  floor_price   integer,

  status        text not null default 'aktiv'
                check (status in ('aktiv','solgt','afsluttet','pause')),
  auto          boolean not null default true,

  listed_at     timestamptz not null default now(),
  last_check_at timestamptz,
  next_check_at timestamptz not null default (now() + interval '7 days'),
  last_change_at timestamptz,
  sold_at       timestamptz,

  checks        integer not null default 0,
  favourites    integer not null default 0,
  favourites_prev integer not null default 0,
  views         integer not null default 0,

  -- Besluttet, men endnu ikke sat paa markedspladsen. Serveren kan regne;
  -- kun telefonen kan skrive det ind i Vinteds egen formular.
  pending_price integer,
  pending_note  text,
  pending_since timestamptz,

  note          text,
  created_at    timestamptz not null default now()
);

-- En annonce findes én gang pr. markedsplads. Uden det ville et genbesoeg paa
-- annoncens side kunne oprette den forfra og nulstille historikken.
create unique index if not exists listings_platform_external
  on public.listings (platform, external_id) where external_id is not null;
create index if not exists listings_due
  on public.listings (next_check_at) where status = 'aktiv';

create table if not exists public.price_events (
  id          bigserial primary key,
  listing_id  uuid not null references public.listings(id) on delete cascade,
  at          timestamptz not null default now(),
  kind        text not null,   -- oprettet | maalt | forslag | aendret | solgt | bund | pause
  price       integer,
  from_price  integer,
  favourites  integer,
  comparables integer,
  median      integer,
  note        text
);
create index if not exists price_events_listing on public.price_events (listing_id, at desc);

alter table public.listings enable row level security;
alter table public.price_events enable row level security;

-- Samme adgang som drafts: appen laeser og skriver som den indloggede bruger,
-- edge-funktionerne gaar uden om med service-role.
drop policy if exists "authenticated can read listings" on public.listings;
create policy "authenticated can read listings" on public.listings
  for select to authenticated using (true);
drop policy if exists "authenticated can update listings" on public.listings;
create policy "authenticated can update listings" on public.listings
  for update to authenticated using (true) with check (true);
drop policy if exists "authenticated can insert listings" on public.listings;
create policy "authenticated can insert listings" on public.listings
  for insert to authenticated with check (true);
drop policy if exists "authenticated can delete listings" on public.listings;
create policy "authenticated can delete listings" on public.listings
  for delete to authenticated using (true);

drop policy if exists "authenticated can read price_events" on public.price_events;
create policy "authenticated can read price_events" on public.price_events
  for select to authenticated using (true);

alter publication supabase_realtime add table public.listings;
