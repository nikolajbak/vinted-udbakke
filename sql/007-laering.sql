-- Laer af det, der er solgt - og af det, der ikke er.
--
-- Indtil nu vidste appen, hvad den SENDTE afsted, men ikke hvordan det gik.
-- Tre ting mangler for at kunne laere noget:
--
--   listings.sold_price  - hvad varen faktisk gik for. Udbudsprisen er ikke
--                          svaret: et bud, der blev taget imod, ligger under.
--   koeber_beskeder      - hvad koeberne spoerger om. Spoerger tre om maalene,
--                          manglede de i teksten.
--   laerdomme            - det, en gennemgang af udfaldene har fundet, som en
--                          kort instruks, der kan laegges ind i de prompter,
--                          der skriver annoncerne.
--
-- Lærdommene er IKKE regler. Reglerne for annoncetekst er bestemt af dig og
-- staar i _shared/beskrivelse.ts; en laerdom maa aldrig gaa imod dem.

alter table public.listings add column if not exists sold_price integer;

create table if not exists public.koeber_beskeder (
  id            bigserial primary key,
  at            timestamptz not null default now(),
  listing_id    uuid references public.listings(id) on delete set null,
  platform      text,
  item_title    text,
  buyer_message text,
  offer         integer,
  intent        text,     -- answer | counter | accept | defer
  emne          text,     -- maal | pasform | stand | materiale | pris | levering | andet
  reply         text,
  counter_price integer
);
create index if not exists koeber_beskeder_listing on public.koeber_beskeder (listing_id, at desc);

create table if not exists public.laerdomme (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  omraade     text not null check (omraade in ('tekst','pris','billeder','kommunikation')),
  tekst       text not null,          -- instruksen, som den laegges ind i prompten
  grundlag    text,                   -- hvad den bygger paa, til dig
  varer       integer[] not null default '{}',   -- loebenumrene bag den
  aktiv       boolean not null default true,
  slaaet_fra  timestamptz             -- sat af dig; saa foreslaas den ikke igen
);

alter table public.koeber_beskeder enable row level security;
alter table public.laerdomme enable row level security;

drop policy if exists "authenticated can read koeber_beskeder" on public.koeber_beskeder;
create policy "authenticated can read koeber_beskeder" on public.koeber_beskeder
  for select to authenticated using (true);

drop policy if exists "authenticated can read laerdomme" on public.laerdomme;
create policy "authenticated can read laerdomme" on public.laerdomme
  for select to authenticated using (true);
-- Du maa slaa en laerdom til og fra, men ikke skrive dem - det goer gennemgangen.
drop policy if exists "authenticated can update laerdomme" on public.laerdomme;
create policy "authenticated can update laerdomme" on public.laerdomme
  for update to authenticated using (true) with check (true);

-- prisvagt_puls talte stadig paa pending_price, som 005 fjernede. Det fejler
-- foerst, naar jobbet koerer, ikke naar kolonnen droppes - saa det stod ikke
-- nogen steder, foer det blev kaldt i en rullet-tilbage transaktion.
create or replace function public.prisvagt_puls()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  antal   integer;
  venter  integer;
  n_url   text := 'https://gjycsqshkvkcupdnvgvf.supabase.co/functions/v1/push-send';
  n_sec   text;
  tekst   text;
begin
  select count(*) filter (where auto and next_check_at <= now()),
         count(*) filter (where pending ? 'price')
    into antal, venter
    from public.listings
   where status = 'aktiv';

  if coalesce(antal,0) = 0 and coalesce(venter,0) = 0 then
    return;
  end if;

  if coalesce(venter,0) > 0 then
    tekst := venter || case when venter = 1 then ' vare venter på en ny pris'
                            else ' varer venter på en ny pris' end;
  else
    tekst := antal || case when antal = 1 then ' vare er klar til et pristjek'
                           else ' varer er klar til et pristjek' end;
  end if;

  select decrypted_secret into n_sec
    from vault.decrypted_secrets where name = 'webhook_secret';
  if n_sec is null then
    raise notice 'prisvagt_puls: ingen webhook_secret i vault';
    return;
  end if;

  perform net.http_post(
    url     := n_url,
    headers := jsonb_build_object('content-type','application/json','x-webhook-secret', n_sec),
    body    := jsonb_build_object('title','Prisvagt','body',tekst,'url','/vinted-udbakke/')
  );
end;
$$;

revoke all on function public.prisvagt_puls() from public, anon, authenticated;

-- Ugentlig gennemgang. Et salg udloeser ogsaa en (se vinted-fill-script), men
-- en vare, der IKKE saelger, er ogsaa et svar - og det sker ikke paa en dag.
-- Noeglen ligger i vault som 'shortcut_key', ikke i jobbets tekst.
create or replace function public.laering_puls()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  k text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'shortcut_key';
  if k is null then
    raise notice 'laering_puls: ingen shortcut_key i vault';
    return;
  end if;
  perform net.http_post(
    url     := 'https://gjycsqshkvkcupdnvgvf.supabase.co/functions/v1/vinted-fill-script?key=' || k,
    headers := jsonb_build_object('content-type','application/json'),
    body    := jsonb_build_object('mode','laer')
  );
end;
$$;

revoke all on function public.laering_puls() from public, anon, authenticated;

select cron.unschedule('laering-puls') where exists (select 1 from cron.job where jobname = 'laering-puls');
select cron.schedule('laering-puls', '30 5 * * 1', 'select public.laering_puls()');
