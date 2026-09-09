-- "Udfyld i Vinted"-knappen markerer, hvilket udkast genvejen skal hente,
-- så to personer med hver sin Vinted-konto ikke rammer hinandens udkast.

alter table public.drafts
  add column if not exists selected_at timestamptz;

-- Klienten skal kunne saette selected_at uden at aendre status, saa 'ny'
-- maa nu ogsaa passere update-policyens check.
drop policy if exists "authenticated can update drafts" on public.drafts;
create policy "authenticated can update drafts" on public.drafts
  for update to authenticated
  using (true)
  with check (status in ('ny', 'afsendt', 'kasseret'));
