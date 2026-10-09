-- Hver mail fra Vinted analyseres og bruges til det, den kan (bestemt af dig
-- 9. oktober).
--
--   vinted_mails.laesning    - modellens laesning af mailen: slags, titel,
--                              pris, beloeb, koeberens ord, resume, og hvad
--                              appen kunne bruge en ukendt slags til.
--   koeber_beskeder.kilde    - 'mail', naar raekken kom fra en mail; ellers
--                              tom (Svar en koeber i appen).
--   koeber_beskeder.samtale  - Vinteds adresse til samtalen (fra mailens link).
--   koeber_beskeder.besvaret_at - sat, naar du trykker Klaret i appen; indtil
--                              da staar beskeden som opgave paa forsiden.
--   koeber_beskeder.vinted_mail_id - mailen, raekken kom fra.

alter table public.vinted_mails add column if not exists laesning jsonb;

alter table public.koeber_beskeder add column if not exists kilde text;
alter table public.koeber_beskeder add column if not exists samtale text;
alter table public.koeber_beskeder add column if not exists besvaret_at timestamptz;
alter table public.koeber_beskeder add column if not exists vinted_mail_id bigint
  references public.vinted_mails(id) on delete set null;

drop policy if exists "authenticated can update koeber_beskeder" on public.koeber_beskeder;
create policy "authenticated can update koeber_beskeder" on public.koeber_beskeder
  for update to authenticated using (true) with check (true);
