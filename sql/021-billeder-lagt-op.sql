-- Rettelser efter gennemgangen af 020 (19. oktober).
--
-- 1. listings.fotos_op: de billeder, runneren har lagt op paa Vinted
--    ({rod, id}), gemt saa snart Vinted har svaret paa uploaden - foer Gem.
--    Gik kvitteringen efter Gem tabt, ved serveren alligevel, hvilket id
--    billedet fik, og det lægges ikke op to gange. Et par flyttes over i
--    listings.fotos, naar id'et staar paa annoncen.
-- 2. set_draft_photo_paa_sti laaser raekken, foer den finder pladsen - et
--    billede fjernet mellem opslaget og skrivningen ville ellers flytte
--    pladsen.
-- 3. restore_draft_photo (Fortryd) lægger ikke et billede tilbage i en solgt vare.
-- 4. replace_draft_photo: en beskaering erstatter billedet paa dets sti i én
--    saetning (appen PATCHede hele listen ud fra en gammel kopi).

alter table public.listings add column if not exists fotos_op jsonb;

create or replace function public.set_draft_photo_paa_sti(p_id uuid, p_path text, p_photo jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_photos jsonb;
  v_i int;
begin
  select photos into v_photos from public.drafts where id = p_id for update;
  if v_photos is null then return false; end if;
  select (e.i - 1)::int into v_i
    from jsonb_array_elements(v_photos) with ordinality e(v, i)
   where e.v->>'path' = p_path
   limit 1;
  if v_i is null then return false; end if;
  update public.drafts
     set photos = jsonb_set(photos, array[v_i::text], p_photo, false)
   where id = p_id;
  return true;
end;
$$;

-- Som set_draft_photo_paa_sti, men forsidebilledet foelger med.
create or replace function public.replace_draft_photo(p_id uuid, p_path text, p_photo jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_photos jsonb;
  v_i int;
begin
  select photos into v_photos from public.drafts where id = p_id for update;
  if v_photos is null then return null; end if;
  select (e.i - 1)::int into v_i
    from jsonb_array_elements(v_photos) with ordinality e(v, i)
   where e.v->>'path' = p_path
   limit 1;
  if v_i is null then return null; end if;
  v_photos := jsonb_set(v_photos, array[v_i::text], p_photo, false);
  update public.drafts
     set photos = v_photos,
         image_path = v_photos->0->>'path',
         image_url = v_photos->0->>'url'
   where id = p_id;
  return v_photos;
end;
$$;

create or replace function public.restore_draft_photo(p_id uuid, p_photo jsonb, p_plads int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_photos jsonb;
  v_rod text := coalesce(p_photo->>'org', p_photo->>'path');
begin
  select photos into v_photos from public.drafts
   where id = p_id and status in ('ny', 'afsendt')
     and not exists (select 1 from public.listings l where l.draft_id = p_id and l.status = 'solgt')
   for update;
  if v_photos is null or v_rod is null or jsonb_array_length(v_photos) >= 20 then return null; end if;
  -- Allerede der (dobbelttryk): intet at gøre.
  if exists (select 1 from jsonb_array_elements(v_photos) e(v)
              where coalesce(e.v->>'org', e.v->>'path') = v_rod) then
    return v_photos;
  end if;
  v_photos := jsonb_insert(v_photos, array[least(greatest(p_plads, 0), jsonb_array_length(v_photos))::text], p_photo);
  update public.drafts
     set photos = v_photos,
         image_path = v_photos->0->>'path',
         image_url = v_photos->0->>'url'
   where id = p_id;
  return v_photos;
end;
$$;

revoke all on function public.replace_draft_photo(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_draft_photo(uuid, text, jsonb) to service_role;
