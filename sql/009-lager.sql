-- Lageret: hvor er varen, og hvad venter paa dig?
--
-- 1) `drafts.taget_ned` - {dba: tidspunkt, reshopper: tidspunkt}. Er en vare
--    solgt paa én plads, skal den ned de andre steder, ellers kan den saelges
--    to gange. DBA og Reshopper kan appen ikke selv tage ned, saa forsiden
--    beder dig om det, til du har trykket "Taget ned" for hver plads.
--
-- 2) `puls` - hvornaar blev automatikken sidst hentet? Brugerscriptet og
--    bogmaerket henter runneren fra serveren ved hver sideindlaesning, saa
--    tidspunktet siger, om opsaetningen paa telefonen virker. Skrives kun af
--    funktionerne (service role); appen laeser.

alter table public.drafts add column if not exists taget_ned jsonb;

create table if not exists public.puls (
  navn     text primary key,        -- vinted-runner | dba-runner
  sidst    timestamptz not null default now(),
  detalje  text                     -- browserens korte navn
);

alter table public.puls enable row level security;
drop policy if exists "authenticated can read puls" on public.puls;
create policy "authenticated can read puls" on public.puls
  for select to authenticated using (true);
