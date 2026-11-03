-- Kun service-noeglen og triggerne kalder dem (3. november: anon kunne kalde
-- set_draft_photo med den offentlige noegle og skrive i et udkasts billeder).
-- Samme dag: Auth-tilmelding slaaet fra i projektet (disable_signup); den
-- eneste bruger er adgang@udbakke.local.
revoke execute on function public.set_draft_photo(uuid, integer, jsonb), public.notify_new_draft(), public.noter_rettelse()
  from public, anon, authenticated;
