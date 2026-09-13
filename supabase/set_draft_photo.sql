-- Delkaldene koerer nu samtidig, og de maa ikke skrive oven i hinanden. Et
-- almindeligt update ville skrive HELE photos-listen tilbage, saa den
-- langsomste vinder og de oevriges arbejde forsvinder. jsonb_set roerer kun
-- den ene plads, i én saetning.
create or replace function public.set_draft_photo(p_id uuid, p_index int, p_photo jsonb)
returns void language sql security definer as $$
  update public.drafts
     set photos = jsonb_set(coalesce(photos, '[]'::jsonb), array[p_index::text], p_photo, true)
   where id = p_id;
$$;
