-- Forsendelsen af en solgt vare (bestemt af dig 19. oktober: ved salg hentes
-- fragtmaerkatet og det andet, forsendelsen kraever, ind paa varen i appen).
--
-- listings.forsendelse: det, Vinteds mails har sagt om forsendelsen, flettet
--   af vinted-mail (_shared/forsendelse.ts): status (mangler/klar/paa_vej/
--   afhentes/modtaget/fuldfoert), transportoer, sporingskode, fragtkode,
--   frist, pakke, transaktion, samtale, levering, maerkat (sti), haendelser.
-- Storage-mappen »maerkater«: det vedhaeftede fragtmaerkat. PRIVAT - et
--   maerkat kan baere koeberens navn og adresse. Appen aabner det med et
--   tidsbegraenset link; kun service-noeglen skriver.

alter table public.listings add column if not exists forsendelse jsonb;

insert into storage.buckets (id, name, public)
values ('maerkater', 'maerkater', false)
on conflict (id) do update set public = false;

drop policy if exists "authenticated read maerkater" on storage.objects;
create policy "authenticated read maerkater" on storage.objects
  for select to authenticated using (bucket_id = 'maerkater');
