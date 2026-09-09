-- Flere billeder pr. udkast + en "kladde"-tilstand, mens billedserien tages.
-- Analysen skal foerst koere naar serien er faerdig, ikke pr. billede.

alter table public.drafts
  add column if not exists photos jsonb not null default '[]'::jsonb;

-- Raekken oprettes nu FOER der findes et billede, saa cover-felterne
-- kan ikke laengere vaere obligatoriske. De holdes stadig opdateret med
-- foerste billede, saa liste, historik og udfyldnings-scriptet er uaendret.
alter table public.drafts alter column image_path drop not null;
alter table public.drafts alter column image_url drop not null;

alter table public.drafts drop constraint if exists drafts_status_check;
alter table public.drafts add constraint drafts_status_check
  check (status in ('kladde', 'afventer', 'ny', 'afsendt', 'kasseret'));

-- Klienten opretter kladder og afslutter dem selv.
drop policy if exists "authenticated can insert drafts" on public.drafts;
create policy "authenticated can insert drafts" on public.drafts
  for insert to authenticated with check (status in ('kladde', 'afventer'));

drop policy if exists "authenticated can update drafts" on public.drafts;
create policy "authenticated can update drafts" on public.drafts
  for update to authenticated
  using (true)
  with check (status in ('kladde', 'afventer', 'ny', 'afsendt', 'kasseret'));

-- Webhooken skal nu ogsaa fyre naar en kladde afsluttes (UPDATE til
-- 'afventer'), ikke kun ved INSERT.
create or replace function public.notify_new_draft()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'afventer'
     and (tg_op = 'INSERT' or old.status is distinct from 'afventer') then
    perform net.http_post(
      url := '__FUNCTION_URL__',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', '__WEBHOOK_SECRET__'
      ),
      body := jsonb_build_object('id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_draft_pending on public.drafts;
create trigger on_draft_pending
  after insert or update on public.drafts
  for each row
  execute function public.notify_new_draft();
