-- Din rettelse af titel og beskrivelse i appen.
--
-- drafts.tekst_rettet: sat af appen, naar du gemmer en titel/beskrivelse, du
-- selv har rettet. Saa lader Vinteds markedsrunde teksten staa og saetter kun
-- prisen - ellers skrev den dine rettelser over ved udfyldningen.
--
-- Selve laeringen ligger i rettelser (sql/012) med felt 'title' (fra/til: hele
-- titlen) og 'beskrivelse' (fra: de saetninger, du fjernede; til: dem, du
-- tilfoejede - en pr. linje). Skrevet af vinted-fill-script mode:'omskriv',
-- ikke af triggeren: serveren skriver ogsaa i beskrivelsen (markedsrunden),
-- og dét er ikke en rettelse.

alter table public.drafts add column if not exists tekst_rettet timestamptz;
