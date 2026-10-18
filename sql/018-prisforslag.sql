-- Prisvagten sætter ikke selv priser (bestemt af dig 18. oktober). Dens
-- nedsættelser står som forslag til godkendelse: {price, fra, note, at,
-- median, sammenlignelige}. Først når du godkender i appen, flyttes prisen
-- over i pending, og runneren sætter den.
alter table listings add column if not exists forslag jsonb;

-- De nedsættelser, prisvagten lagde direkte i pending, bliver forslag.
-- Kun rene prisændringer med prisvagtens begrundelse — en rettelse fra
-- appen hedder »Rettet i appen«.
update listings
   set forslag = jsonb_build_object('price', (pending->>'price')::numeric, 'fra', price,
                                    'note', pending_note, 'at', pending_since),
       pending = null, pending_note = null, pending_since = null
 where pending ? 'price' and (select count(*) from jsonb_object_keys(pending)) = 1
   and coalesce(pending_note, '') like '%Prisvagten sætter%';
