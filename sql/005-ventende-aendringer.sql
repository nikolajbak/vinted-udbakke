-- Fra "ventende pris" til "ventende ændringer".
--
-- Prisvagten var den foerste, der ville aendre noget ude paa markedspladsen,
-- saa mekanismen kom til at hedde pending_price. Nu kan du ogsaa rette titel
-- og beskrivelse i appen, og de skal samme vej ud. To naesten ens mekanismer
-- ved siden af hinanden ville uvaegerligt komme til at sige noget forskelligt
-- om den samme annonce, saa der er én: `pending` er de felter, der venter paa
-- at blive skrevet ind i annoncen.
--
-- Tabellen er tom, saa der er intet at flytte med over.

alter table public.listings add column if not exists pending jsonb;
alter table public.listings drop column if exists pending_price;

-- Appen skal kunne notere sine egne aendringer i historikken, praecis som
-- prisvagten goer. Uden det ville en haandrettet pris vaere den eneste
-- begivenhed, der ikke stod nogen steder.
drop policy if exists "authenticated can insert price_events" on public.price_events;
create policy "authenticated can insert price_events" on public.price_events
  for insert to authenticated with check (true);
