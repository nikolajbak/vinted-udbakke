-- Modbud fra appen (3. november: et bud skal kunne besvares med et modbud i
-- appen, og runneren saetter det paa Vinted).
--   koeber_beskeder.modbud     - modbuddet i hele kroner, som Vinted tog imod
--   koeber_beskeder.modbud_at  - hvornaar runneren fik det sat

alter table public.koeber_beskeder add column if not exists modbud integer;
alter table public.koeber_beskeder add column if not exists modbud_at timestamptz;
