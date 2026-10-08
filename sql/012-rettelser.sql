-- Det, analysen tog fejl af, gemt saa den kan laere af det.
--
-- To kilder:
--   'dig'    - du rettede maerke, stoerrelse, farve, stand, materiale eller
--              kategori i udkastet, foer det blev sendt (trigger herunder).
--   'vinted' - Vinteds formular kunne ikke tage vaerdien (runneren melder de
--              felter, den maatte opgive, med »clear«).
-- De nyeste laegges ind i analysens prompt (_shared/laering.ts, hentRettelser),
-- saa samme fejl ikke laves igen.

create table if not exists public.rettelser (
  id        bigserial primary key,
  tid       timestamptz not null default now(),
  draft_id  uuid references public.drafts(id) on delete set null,
  nr        integer,
  kilde     text not null check (kilde in ('dig','vinted')),
  felt      text not null,
  fra       text,
  til       text
);
create index if not exists rettelser_tid on public.rettelser (tid desc);

alter table public.rettelser enable row level security;
drop policy if exists "authenticated can read rettelser" on public.rettelser;
create policy "authenticated can read rettelser" on public.rettelser
  for select to authenticated using (true);

-- Kun en RETTELSE: udkastet var analyseret (status 'ny' foer og efter), feltet
-- havde en vaerdi, og du gav det en anden. En analyse saetter status fra
-- 'afventer' til 'ny', og backfill fylder kun tomme felter - ingen af dem
-- taeller.
create or replace function public.noter_rettelse() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  f text;
  gl text;
  ny text;
begin
  if old.status is distinct from 'ny' or new.status is distinct from 'ny' then
    return new;
  end if;
  foreach f in array array['brand','size','color','material','condition','category_path'] loop
    gl := to_jsonb(old) ->> f;
    ny := to_jsonb(new) ->> f;
    if gl is not null and gl <> '' and gl is distinct from ny then
      insert into public.rettelser (draft_id, nr, kilde, felt, fra, til)
      values (new.id, new.nr, 'dig', f, gl, ny);
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists drafts_rettelse on public.drafts;
create trigger drafts_rettelse after update on public.drafts
  for each row execute function public.noter_rettelse();
