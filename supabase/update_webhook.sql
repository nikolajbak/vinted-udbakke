-- Køres ÉN gang, efter Edge Function "analyze-draft" er deployet.
-- Erstatter placeholder-triggerfunktionen med den rigtige, der reelt
-- kalder funktionen. FUNCTION_URL og WEBHOOK_SECRET indsættes af
-- deploy-scriptet ud fra .env.secrets — rediger ikke manuelt.

create or replace function public.notify_new_draft()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'afventer' then
    perform net.http_post(
      url := '__FUNCTION_URL__',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', '__WEBHOOK_SECRET__'
      ),
      body := jsonb_build_object('id', new.id, 'image_url', new.image_url)
    );
  end if;
  return new;
end;
$$;
