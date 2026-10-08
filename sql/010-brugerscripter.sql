-- Brugerscripternes versionsnumre. Userscripts opdaterer kun, naar det nye
-- nummer er STOERRE end det installerede, saa et hash af indholdet duer ikke
-- (et nyt hash kan vaere mindre). Hvert nyt indhold (hash) faar her det
-- naeste nummer, og det samme indhold beholder altid sit nummer - ogsaa
-- mens gamle og nye instanser af funktionen svarer side om side.

create table if not exists brugerscripter (
  navn    text not null,
  hash    text not null,
  version integer not null,
  at      timestamptz not null default now(),
  primary key (navn, hash)
);

alter table brugerscripter enable row level security;

create or replace function brugerscript_udgave(p_navn text, p_hash text)
returns integer language plpgsql as $$
declare v integer;
begin
  select version into v from brugerscripter where navn = p_navn and hash = p_hash;
  if v is not null then return v; end if;
  -- Laas pr. navn, saa to samtidige kald ikke tager samme nummer.
  perform pg_advisory_xact_lock(hashtext('brugerscript:' || p_navn));
  select version into v from brugerscripter where navn = p_navn and hash = p_hash;
  if v is not null then return v; end if;
  select coalesce(max(version), 0) + 1 into v from brugerscripter where navn = p_navn;
  insert into brugerscripter (navn, hash, version) values (p_navn, p_hash, v);
  return v;
end $$;

revoke execute on function brugerscript_udgave(text, text) from public, anon, authenticated;
