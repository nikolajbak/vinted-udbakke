-- Tilføj og fjern billeder i en eksisterende annonce (19. oktober).
--
-- 1. Et billede kan lægges til, så længe varen er færdiganalyseret (ny eller
--    afsendt) og ikke solgt - før kun, mens den var klar og ikke sendt.
-- 2. Et billede fjernes i én sætning på sin rod (org || path); det sidste
--    billede kan ikke fjernes. Svaret er det fjernede billede og dets plads,
--    så appen kan fortryde.
-- 3. Fortryd lægger det tilbage på pladsen.
-- 4. Optimeringens delkald skriver på originalens sti, ikke på en plads: et
--    billede fjernet imens ville ellers flytte det optimerede til den
--    forkerte plads. Findes stien ikke længere, skrives intet.
-- Kun Edge-funktionerne (service-nøglen) må kalde dem.

create or replace function public.append_draft_photo(p_id uuid, p_photo jsonb)
returns int language sql security definer set search_path = public as $$
  update public.drafts d
     set photos = coalesce(d.photos, '[]'::jsonb) || jsonb_build_array(p_photo)
   where d.id = p_id
     and d.status in ('ny', 'afsendt')
     and coalesce(jsonb_array_length(d.photos), 0) < 20
     and not exists (select 1 from public.listings l where l.draft_id = p_id and l.status = 'solgt')
  returning jsonb_array_length(d.photos) - 1;
$$;

create or replace function public.remove_draft_photo(p_id uuid, p_rod text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_photos jsonb;
  v_i int;
  v_foto jsonb;
begin
  select photos into v_photos from public.drafts
   where id = p_id and status in ('ny', 'afsendt')
     and not exists (select 1 from public.listings l where l.draft_id = p_id and l.status = 'solgt')
   for update;
  if v_photos is null or jsonb_array_length(v_photos) < 2 then return null; end if;
  select (e.i - 1)::int, e.v into v_i, v_foto
    from jsonb_array_elements(v_photos) with ordinality e(v, i)
   where coalesce(e.v->>'org', e.v->>'path') = p_rod
   limit 1;
  if v_i is null then return null; end if;
  v_photos := v_photos - v_i;
  update public.drafts
     set photos = v_photos,
         image_path = v_photos->0->>'path',
         image_url = v_photos->0->>'url'
   where id = p_id;
  return jsonb_build_object('plads', v_i, 'foto', v_foto, 'photos', v_photos);
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

create or replace function public.set_draft_photo_paa_sti(p_id uuid, p_path text, p_photo jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_i int;
begin
  select (e.i - 1)::int into v_i
    from public.drafts d, jsonb_array_elements(d.photos) with ordinality e(v, i)
   where d.id = p_id and e.v->>'path' = p_path
   limit 1;
  if v_i is null then return false; end if;
  update public.drafts
     set photos = jsonb_set(photos, array[v_i::text], p_photo, false)
   where id = p_id;
  return true;
end;
$$;

revoke all on function public.append_draft_photo(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.remove_draft_photo(uuid, text) from public, anon, authenticated;
revoke all on function public.restore_draft_photo(uuid, jsonb, int) from public, anon, authenticated;
revoke all on function public.set_draft_photo_paa_sti(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.append_draft_photo(uuid, jsonb) to service_role;
grant execute on function public.remove_draft_photo(uuid, text) to service_role;
grant execute on function public.restore_draft_photo(uuid, jsonb, int) to service_role;
grant execute on function public.set_draft_photo_paa_sti(uuid, text, jsonb) to service_role;
