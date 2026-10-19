-- Gemini foerst, Claude som reserve (`_shared/model.ts`).
--
-- modelvalg: hvilken model hvert trin bruger. Opslaget er trinnet selv
-- (»analyse:registrer_vare«), saa delen foer kolon (»analyse«), saa »*«.
--   claude — kun Claude; skygge — Claude bruges, Gemini koerer ved siden af
--   og begge svar gemmes; gemini — Gemini bruges, Claude ved fejl.
-- modelkald: hvert Gemini-forsoeg (og i skygge begge svar), 30 dage.

create table if not exists modelvalg (
  trin text primary key,
  valg text not null check (valg in ('claude', 'skygge', 'gemini')),
  note text,
  rettet timestamptz not null default now()
);
alter table modelvalg enable row level security;

insert into modelvalg (trin, valg, note) values
  ('*', 'skygge', 'alt maales mod Claude, foer det skiftes'),
  ('mail', 'claude', 'koebernavne sendes ikke til gratisniveauet; koster <0,01 $/md')
on conflict (trin) do nothing;

create table if not exists modelkald (
  id bigserial primary key,
  tid timestamptz not null default now(),
  trin text not null,
  draft_id uuid,
  model text,
  ok boolean not null,
  ms integer,
  fejl text,
  skygge boolean not null default false,
  gemini_svar jsonb,
  claude_svar jsonb
);
alter table modelkald enable row level security;
create index if not exists modelkald_tid on modelkald (tid desc);
create index if not exists modelkald_trin on modelkald (trin, tid desc);

-- Ryddes som `spor`: efter 30 dage.
select cron.schedule('modelkald-ryd', '17 3 * * *', $$delete from modelkald where tid < now() - interval '30 days'$$)
where not exists (select 1 from cron.job where jobname = 'modelkald-ryd');
