-- Prisvagtens ur.
--
-- Serveren kan ikke selv se Vinted, saa den kan heller ikke selv gennemfoere
-- tilsynet. Det eneste, den kan, er at sige til: "der er tre varer, der har
-- ligget laenge nok". Resten sker, naar du aabner appen og trykker.
--
-- Hemmeligheden ligger i Supabases vault, ikke i jobbets tekst: et cron-job
-- er almindelig, laesbar SQL i databasen.

create extension if not exists pg_net with schema extensions;

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
         count(*) filter (where pending_price is not null)
    into antal, venter
    from public.listings
   where status = 'aktiv';

  if coalesce(antal,0) = 0 and coalesce(venter,0) = 0 then
    return;
  end if;

  -- Ligger der en besluttet pris og venter, er DET beskeden. Et tjek, der
  -- ikke er kørt, er en opfordring; en pris, der ikke er sat, er en opgave.
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

-- Én gang om dagen, kl. 08:00 UTC. Oftere giver ingenting: tilsynet kigger
-- tidligst paa en vare igen efter tre dage.
select cron.unschedule('prisvagt-puls')
  where exists (select 1 from cron.job where jobname = 'prisvagt-puls');
select cron.schedule('prisvagt-puls', '0 8 * * *', 'select public.prisvagt_puls()');
