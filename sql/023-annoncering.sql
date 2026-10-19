-- Betalt annoncering: boost paa Vinted og andre markedspladsers betalte
-- synlighed (bestemt af dig 19. oktober). Spec:
-- docs/superpowers/specs/2026-10-19-betalt-annoncering-design.md
--
-- annoncering_ordrer: én betaling (Vinteds faktura-mail). Den naevner ikke
--   varerne; runneren finder dem i garderoben (promoted) og knytter dem til.
-- annoncering: én vares del af en betaling - eller en, du selv har
--   registreret (kilde 'dig', fx en topannonce paa DBA).
-- annoncering_maal: Vinteds tal for et boost (bumps/stats), hoejst én pr. dag.

create table if not exists public.annoncering_ordrer (
  id bigserial primary key,
  at timestamptz not null default now(),
  plads text not null check (plads in ('vinted', 'dba', 'reshopper')),
  slags text not null default 'boost',
  kr_i_alt numeric(10,2),
  antal int not null default 1 check (antal > 0),
  dage int not null check (dage > 0),
  start timestamptz not null,
  slut timestamptz not null,
  vinted_mail_id bigint unique references public.vinted_mails(id) on delete set null,
  tekst text
);

create table if not exists public.annoncering (
  id bigserial primary key,
  at timestamptz not null default now(),
  ordre_id bigint references public.annoncering_ordrer(id) on delete cascade,
  draft_id uuid not null references public.drafts(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  plads text not null check (plads in ('vinted', 'dba', 'reshopper')),
  slags text not null default 'boost' check (slags in ('boost', 'garderobe', 'dba-top', 'andet')),
  kr numeric(10,2) check (kr is null or kr >= 0),
  start timestamptz not null,
  slut timestamptz not null check (slut > start),
  kilde text not null check (kilde in ('mail', 'dig')),
  tal jsonb,
  dom text,
  maalt_at timestamptz
);
create index if not exists annoncering_listing on public.annoncering (listing_id);
create index if not exists annoncering_draft on public.annoncering (draft_id);
create index if not exists annoncering_ordre on public.annoncering (ordre_id);

create table if not exists public.annoncering_maal (
  id bigserial primary key,
  annoncering_id bigint not null references public.annoncering(id) on delete cascade,
  at timestamptz not null default now(),
  impressions int,
  views int,
  favorites int,
  conversations int,
  forskel numeric,
  chart jsonb
);
create index if not exists annoncering_maal_a on public.annoncering_maal (annoncering_id, at desc);

alter table public.annoncering_ordrer enable row level security;
alter table public.annoncering enable row level security;
alter table public.annoncering_maal enable row level security;

drop policy if exists "authenticated can read annoncering_ordrer" on public.annoncering_ordrer;
create policy "authenticated can read annoncering_ordrer" on public.annoncering_ordrer
  for select to authenticated using (true);
drop policy if exists "authenticated can read annoncering" on public.annoncering;
create policy "authenticated can read annoncering" on public.annoncering
  for select to authenticated using (true);
drop policy if exists "authenticated can read annoncering_maal" on public.annoncering_maal;
create policy "authenticated can read annoncering_maal" on public.annoncering_maal
  for select to authenticated using (true);
-- Appen skriver kun sine egne (manuelle) raekker.
drop policy if exists "authenticated can insert own annoncering" on public.annoncering;
create policy "authenticated can insert own annoncering" on public.annoncering
  for insert to authenticated with check (kilde = 'dig' and ordre_id is null and tal is null);
drop policy if exists "authenticated can delete own annoncering" on public.annoncering;
create policy "authenticated can delete own annoncering" on public.annoncering
  for delete to authenticated using (kilde = 'dig');

-- Gennemgangen: to faner paa én gang maa ikke knytte samme vare til samme
-- ordre to gange (boost.ts tager 23505 som »allerede knyttet«).
create unique index if not exists annoncering_ordre_vare on public.annoncering (ordre_id, listing_id)
  where ordre_id is not null;
