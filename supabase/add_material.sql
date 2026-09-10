-- Vinted har sit eget materialefelt, og det saelger: koeberne filtrerer paa
-- uld, laeder, bomuld. AI'en laeser det i forvejen af vaskemaerket.
alter table public.drafts add column if not exists material text;
