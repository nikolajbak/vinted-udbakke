-- Runnerens spor, gemt i basen.
--
-- `spor` gik kun til funktionens log, og 8. oktober viste den log sig at tabe
-- linjer: en hel udfyldning (nr. 49) stod uden hentningen af scriptet og
-- udkastet, som beviseligt skete. Et spor, der mangler i loggen, siger derfor
-- intet. Her kan det ikke tabes. Rækker over 30 dage slettes ved hver ny.
-- Skrives kun af vinted-fill-script (service role).

create table if not exists public.spor (
  id        bigserial primary key,
  tid       timestamptz not null default now(),
  draft_id  uuid,
  sti       text,
  tekst     text not null
);
create index if not exists spor_tid on public.spor (tid desc);

alter table public.spor enable row level security;
