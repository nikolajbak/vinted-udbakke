-- Bud fra Vinteds indbakke (3. november: Vinted sender ikke laengere en mail
-- om et bud, saa runneren laeser indbakken, og buddene skal med i appen).
--   koeber_beskeder.vinted_bud  - Vinteds offer_request_id; ét bud, én raekke
--   koeber_beskeder.bud_udbudt  - annoncens pris, da buddet kom (Vinteds
--                                 original_price)
-- kilde er 'vinted' for disse raekker.

alter table public.koeber_beskeder add column if not exists vinted_bud bigint;
alter table public.koeber_beskeder add column if not exists bud_udbudt integer;
create unique index if not exists koeber_beskeder_vinted_bud on public.koeber_beskeder (vinted_bud);
