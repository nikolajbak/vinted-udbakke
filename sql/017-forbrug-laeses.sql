-- Kontooversigten i appen viser, hvad modelkaldene har kostet. forbrug havde
-- RLS uden nogen politik, saa appen (authenticated) kunne ikke laese den.
drop policy if exists "authenticated can read forbrug" on public.forbrug;
create policy "authenticated can read forbrug" on public.forbrug
  for select to authenticated using (true);
