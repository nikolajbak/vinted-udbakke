-- Mærkatet lagt ind fra appen (19. oktober: al administration af
-- forsendelsen skal kunne ske i appen). Kom mærkatet ikke med Vinteds mail,
-- lægger du selv PDF'en eller et skærmbillede af QR-koden ind på varens
-- side. Kun logget ind; stien er <listing>/dig-<tid>.<ext>, og appen
-- skriver selv listings.forsendelse.maerkat.

drop policy if exists "authenticated insert maerkater" on storage.objects;
create policy "authenticated insert maerkater" on storage.objects
  for insert to authenticated with check (bucket_id = 'maerkater');
