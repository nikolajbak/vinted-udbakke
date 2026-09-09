-- Prisopslaget flyttes fra cloud-funktionen ud på telefonen: Vinted blokerer
-- datacenter-IP'er, men en forespørgsel indefra en vinted.dk-side (som
-- genvejen allerede kører i) er same-origin, med brugerens egen session og
-- private IP — og bliver aldrig blokeret.

alter table public.drafts
  add column if not exists search_query text,
  add column if not exists price_grounded boolean not null default false;
