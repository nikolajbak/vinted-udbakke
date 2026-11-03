-- Klientnoeglen til funktionerne (SHORTCUT_KEY) stod i app.js, og repoet og
-- siden er offentlige (3. november). Nu henter appen den efter login. Vault's
-- 'shortcut_key' er den samme noegle, som SQL'en selv kalder funktionerne med;
-- tools/skift-noegle.sh holder de to ens.

create or replace function public.klientnoegle()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'shortcut_key' limit 1;
$$;

revoke execute on function public.klientnoegle() from public, anon;
grant execute on function public.klientnoegle() to authenticated;
