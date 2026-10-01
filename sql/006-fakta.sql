-- Det, der er slaaet op om en vare: om den er ny, nyprisen og maalene.
--
-- Beskrivelsen skrives op til fire gange - af analysen, af Vinteds
-- markedsrunde, til DBA og til Reshopper - og hver gang forfra. Levede
-- nyprisen kun i teksten, kunne den naeste skrive den ud igen uden at vide,
-- at den var slaaet op. Her staar den, og alle fire faar den med.
--
-- Form: {ny, nypris, nyprisKilde, maal, maalKilde, fejl} - se
-- supabase/functions/_shared/beskrivelse.ts.

alter table public.drafts add column if not exists fakta jsonb;
