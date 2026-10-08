-- Hvad hvert modelkald koster.
--
-- Koden smed svarets `usage` vaek, og der er ingen Admin-noegle til
-- Anthropics forbrugsrapport, saa appens pris var et skoen (8. oktober:
-- ~$0,45 pr. vare). Hver kald til Anthropic noteres nu her af
-- `_shared/forbrug.ts` (service role). `usd` er regnet efter prislisten ved
-- kaldet; tokens staar raa, saa den kan regnes om.

create table if not exists public.forbrug (
  id             bigserial primary key,
  tid            timestamptz not null default now(),
  draft_id       uuid,
  trin           text not null,
  model          text,
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,
  cache_skriv    integer not null default 0,
  cache_laes     integer not null default 0,
  soegninger     integer not null default 0,
  usd            numeric(10, 6)
);
create index if not exists forbrug_tid on public.forbrug (tid desc);
create index if not exists forbrug_draft on public.forbrug (draft_id);

alter table public.forbrug enable row level security;

-- Pr. vare og pr. trin, til at se hvor pengene gaar hen.
create or replace view public.forbrug_pr_vare as
  select f.draft_id, d.nr, count(*) as kald, sum(f.input_tokens) as input_tokens,
         sum(f.output_tokens) as output_tokens, sum(f.soegninger) as soegninger,
         round(sum(f.usd), 4) as usd, min(f.tid) as foerste, max(f.tid) as sidste
  from public.forbrug f left join public.drafts d on d.id = f.draft_id
  group by f.draft_id, d.nr;

create or replace view public.forbrug_pr_trin as
  select trin, model, count(*) as kald, round(avg(input_tokens)) as input_snit,
         round(avg(output_tokens)) as output_snit, round(sum(usd), 4) as usd
  from public.forbrug
  group by trin, model;

-- Visningerne maa ikke kunne laeses uden om RLS.
alter view public.forbrug_pr_vare set (security_invoker = true);
alter view public.forbrug_pr_trin set (security_invoker = true);
