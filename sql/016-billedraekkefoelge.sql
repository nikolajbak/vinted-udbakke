-- Billedernes raekkefoelge, synkroniseret mellem appen og Vinted.
--
-- drafts.fotos_sendt: de billeder (stier), der FAKTISK kom med op ved
-- udfyldningen, i den raekkefoelge de blev lagt i formularen - pr. plads,
-- {"vinted": [...], "dba": [...]}. Et billede, telefonen ikke kunne hente,
-- kommer ikke med (nr. 57: 12 i appen, 11 paa Vinted), og saa kan Vinteds
-- billeder ikke parres med appens paa pladsen alene.
--
-- listings.fotos: Vinteds billeder parret med appens, [{id, path}] i
-- upload-raekkefoelge. Vinteds billed-id'er stiger i den raekkefoelge, de
-- blev lagt op (maalt 17. oktober paa seks annoncer), saa sorteret id
-- svarer til fotos_sendt. Parret foerste gang telefonen laeser annoncens
-- billeder (/api/v2/item_upload/items/{id}). {"udskiftet": tid} betyder,
-- at Vinted har lagt alle billeder op paa ny (nye id'er og adresser), og
-- at annoncen ikke kan parres igen.

alter table public.drafts add column if not exists fotos_sendt jsonb;
alter table public.listings add column if not exists fotos jsonb;
