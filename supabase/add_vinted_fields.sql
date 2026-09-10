-- Vinteds formular har egne felter til kategori, maerke, stoerrelse, stand og
-- farve. De dukker foerst op, naar en kategori er valgt, saa raekkefoelgen i
-- bogmaerket er: kategori -> resten. Her gemmer vi det, AI'en laeser af
-- billederne, i praecis den form Vinted selv bruger.
alter table public.drafts
  add column if not exists category_path jsonb,   -- ["Kvinder","Toej","Kjoler","Midikjoler"]
  add column if not exists size_scale text,       -- S/M/L | EU | UK | FR | IT | US
  add column if not exists color text;
