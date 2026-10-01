-- Vinteds egne mails som push: salg, bud og beskeder.
--
-- Serveren kan ikke se Vinted - datacenter-IP'er er blokeret, og Vinted har
-- ingen webhooks. Men Vinted sender selv en mail, naar en vare er solgt, og
-- naar en koeber skriver eller byder. Den mail sendes videre til
-- `vinted-mail`, som melder varen solgt og sender en notifikation.
--
-- HVER mail gemmes, ogsaa dem, der ikke blev forstaaet. Vinteds mailformat er
-- ikke dokumenteret nogen steder; reglerne i vinted-mail er gaettet, og det er
-- de gemte mails, de skal maales og rettes paa.

create table if not exists public.vinted_mails (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  message_id  text unique,          -- den samme mail to gange er én mail
  fra         text,
  emne        text,
  tekst       text,                 -- ren tekst, hvis der var en; ellers html uden tags
  kind        text,                 -- solgt | bud | besked | andet
  item_id     text,                 -- Vinteds annoncenummer, hvis det stod i mailen
  listing_id  uuid references public.listings(id) on delete set null,
  beloeb      integer,              -- buddet i hele kroner, naar det er et bud
  handling    text                  -- hvad serveren gjorde ved den
);
create index if not exists vinted_mails_at on public.vinted_mails (at desc);

alter table public.vinted_mails enable row level security;
drop policy if exists "authenticated can read vinted_mails" on public.vinted_mails;
create policy "authenticated can read vinted_mails" on public.vinted_mails
  for select to authenticated using (true);
