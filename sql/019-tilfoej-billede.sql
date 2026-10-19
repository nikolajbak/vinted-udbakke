-- »Tag dit eget som dette«: ét billede lægges sidst i et klar-udkast, i én
-- sætning. Appen PATCHede før hele photos-listen ud fra sin egen kopi - så
-- kunne en optimering (set_draft_photo) eller et andet billede gå tabt, og
-- billedet blev skrevet, før serveren kunne sige, at varen var sendt afsted.
-- Nu tjekker samme sætning, at varen er færdiganalyseret (status ny), ikke
-- sendt nogen steder hen og uden annonce, og giver pladsen tilbage - eller
-- null, når den ikke er klar. Kun Edge-funktionen (service-nøglen) må kalde.
create or replace function public.append_draft_photo(p_id uuid, p_photo jsonb)
returns int language sql security definer set search_path = public as $$
  update public.drafts d
     set photos = coalesce(d.photos, '[]'::jsonb) || jsonb_build_array(p_photo)
   where d.id = p_id
     and d.status = 'ny'
     and not exists (
       select 1 from jsonb_each(coalesce(d.posted_to, '{}'::jsonb)) e
        where e.value not in ('null'::jsonb, 'false'::jsonb, '""'::jsonb))
     and not exists (select 1 from public.listings l where l.draft_id = p_id)
  returning jsonb_array_length(d.photos) - 1;
$$;

revoke all on function public.append_draft_photo(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.append_draft_photo(uuid, jsonb) to service_role;
