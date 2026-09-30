-- Hvad staar der FAKTISK i annoncen ude paa markedspladsen?
--
-- Udkastet er det, vi sendte afsted. Annoncen er det, der blev lagt op - og de
-- to er ikke det samme, saa snart du retter en titel i Vinteds formular, eller
-- prisvagten saetter prisen ned. `published` er annoncens egne ord, laest af
-- annoncen selv; udkastet bliver staaende uroert, saa forskellen kan ses.

alter table public.listings add column if not exists published jsonb;
alter table public.listings add column if not exists synced_at timestamptz;
