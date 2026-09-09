-- Laaser drafts-tabellen og photos-bucket'en til kun at kunne laeses/skrives
-- af en logget-ind (authenticated) session, ikke ren anon-adgang.

drop policy if exists "anon can read drafts" on public.drafts;
create policy "authenticated can read drafts" on public.drafts
  for select to authenticated using (true);

drop policy if exists "anon can insert drafts" on public.drafts;
create policy "authenticated can insert drafts" on public.drafts
  for insert to authenticated with check (status = 'afventer');

drop policy if exists "anon can update drafts" on public.drafts;
create policy "authenticated can update drafts" on public.drafts
  for update to authenticated using (true) with check (status in ('afsendt', 'kasseret'));

drop policy if exists "public read photos" on storage.objects;
create policy "authenticated read photos" on storage.objects
  for select to authenticated using (bucket_id = 'photos');

drop policy if exists "anon can upload photos" on storage.objects;
create policy "authenticated can upload photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos');
