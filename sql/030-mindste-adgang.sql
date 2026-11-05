-- Mindste adgang i public-skemaet (5. november 2026). RLS holdt allerede: anon
-- fik tomme svar og kunne ikke skrive. Men Supabases standard gav anon og
-- authenticated ALLE rettigheder paa hver tabel, ogsaa TRUNCATE, som RLS ikke
-- daekker. Nu svarer rettighederne praecis til politikkerne, og anon har ingen.
-- Service-noeglen og SECURITY DEFINER-funktionerne roeres ikke.

begin;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on
  public.annoncering, public.annoncering_maal, public.annoncering_ordrer,
  public.drafts, public.forbrug, public.forbrug_pr_trin, public.forbrug_pr_vare,
  public.koeber_beskeder, public.laerdomme, public.listings, public.price_events,
  public.puls, public.rettelser, public.vinted_mails
  to authenticated;
grant insert on public.annoncering, public.drafts, public.listings, public.price_events to authenticated;
grant update on public.drafts, public.koeber_beskeder, public.laerdomme, public.listings to authenticated;
grant delete on public.annoncering to authenticated;
grant usage on sequence public.annoncering_id_seq, public.drafts_nr_seq, public.price_events_id_seq to authenticated;

-- Appen sletter aldrig en annonce.
drop policy if exists "authenticated can delete listings" on public.listings;

-- Nye tabeller, sekvenser og funktioner i public faar ikke laengere anon af sig selv.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;

-- Den offentlige billedmappe tager kun billeder; begge mapper faar et loft.
update storage.buckets set file_size_limit = 26214400,
  allowed_mime_types = array['image/jpeg','image/png','image/webp']
  where id = 'photos';
update storage.buckets set file_size_limit = 20971520 where id = 'maerkater';

commit;
