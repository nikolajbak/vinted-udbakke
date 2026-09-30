-- Loebenummer paa hvert produkt.
--
-- Nummeret er varens navn i den fysiske verden: det staar paa etiketten paa
-- pakken, og det er dét, QR-koden peger paa. Derfor skal det vaere UNIKT for
-- altid og aldrig genbruges - ogsaa naar et udkast kasseres. En sekvens goer
-- praecis det; en "max(nr)+1" ville give to pakker det samme nummer, den dag
-- to udkast bliver oprettet samtidig.

create sequence if not exists public.drafts_nr_seq;
alter table public.drafts add column if not exists nr integer;

-- De udkast, der allerede findes, nummereres i den raekkefoelge de blev til.
with r as (
  select id, row_number() over (order by created_at, id) as n
    from public.drafts where nr is null
)
update public.drafts d set nr = r.n from r where d.id = r.id;

select setval('public.drafts_nr_seq',
              coalesce((select max(nr) from public.drafts), 0) + 1, false);

alter table public.drafts alter column nr set default nextval('public.drafts_nr_seq');
alter table public.drafts alter column nr set not null;

create unique index if not exists drafts_nr_uniq on public.drafts (nr);
