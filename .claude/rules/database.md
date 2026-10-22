---
paths:
  - "sql/**"
  - "supabase/*.sql"
---
# Databasen: skemaets filer

Flyttet ordret fra CLAUDE.md 2026-10-22. »Dine beslutninger → X« og »Målt, ikke gættet → X« peger på afsnittet X
i en af regelfilerne (se tabellen i CLAUDE.md). Hvert målt fund kostede en fejlsøgning; lav det ikke om uden at måle igen.

## Databasen

Supabase-Postgres. Ændringer køres med `psql -f` (se »Enkeltting uden om
udgivelsen«) og ligger som filer, så skemaet kan læses uden at spørge basen.
Nye ændringer får næste nummer i `sql/` og en linje her.

| Hvad | Fil |
|---|---|
| Grundskemaet: `drafts`, Storage, webhook | `supabase/schema.sql`, `supabase/update_webhook.sql` |
| Tidlige tilføjelser til `drafts` | `supabase/add_*.sql`, `supabase/set_draft_photo.sql` |
| RLS-låsen og push-abonnementer | `supabase/auth_lockdown.sql`, `supabase/push_subs.sql` |
| Prisvagten: `listings`, `price_events`, `pg_cron` | `sql/001-prisvagt.sql`, `sql/002-prisvagt-puls.sql` |
| Løbenumre: `drafts.nr` fra en sekvens | `sql/003-loebenummer.sql` |
| Annoncens egne ord: `listings.published` | `sql/004-udgivet.sql` |
| Ventende ændringer til annoncen: `listings.pending` | `sql/005-ventende-aendringer.sql` |
| Opslåede fakta om varen: `drafts.fakta` (ny, nypris, mål, fejl, mærkernes tekst `maerker`, farvenavnet `maerkeFarve`, køn sat af dig `koen`, varens produktside `produktside`/`produktNavn`/`produktTekst`/`produktMaerke`, opslagets tidspunkt `opslaaet`, producentens billeder af varen på en person `producentBilleder` (`[{url, pose}]`, kun links, kun til appen — aldrig i en annonce), butikkens ord om pasformen `pasform`) | `sql/006-fakta.sql` |
| Læring: `listings.sold_price`, `koeber_beskeder`, `laerdomme`, ugentligt `laering-puls` (vault: `shortcut_key`) | `sql/007-laering.sql` |
| Vinteds mails, gemt og tolket: `vinted_mails` | `sql/008-vinted-mails.sql` |
| Taget ned efter salg andetsteds: `drafts.taget_ned`; automatikkens sidste hentning: `puls` (rækkerne `vinted-runner`, `dba-runner`, `prisvagt` = sidste forespørgsel på forfaldne, `prisvagt-nu` = »Tjek priserne nu« i gang/færdig/fejl) | `sql/009-lager.sql` |
| Brugerscripternes versionsnumre: `brugerscripter`, `brugerscript_udgave(navn, hash)` | `sql/010-brugerscripter.sql` |
| Runnerens spor, gemt (30 dage): `spor` (tid, draft_id, sti, tekst); hele udfyldningens log kommer med »clear« som `sti = 'udfyldning (log)'` | `sql/011-spor.sql` |
| Hvad hvert modelkald koster: `forbrug` (trin, model, tokens, søgninger, `usd`) og visningerne `forbrug_pr_vare`, `forbrug_pr_trin`; læses også af `nikolajbak/drift` (omkostningsoversigten, via Management API'et) — omdøb ikke tabellen eller `tid`/`model`/`usd` | `sql/013-forbrug.sql` |
| Mailens læsning: `vinted_mails.laesning`; køberbeskeder fra mail: `koeber_beskeder.kilde`, `samtale`, `besvaret_at`, `vinted_mail_id` | `sql/014-mails-analyseres.sql` |
| Din tekst skal stå: `drafts.tekst_rettet`; tekstrettelser i `rettelser` (felt `title`/`beskrivelse`) | `sql/015-tekstrettelser.sql` |
| Billedernes rækkefølge: `drafts.fotos_sendt` (de billeder, der kom med op, pr. plads), `listings.fotos` (Vinteds billed-id'er parret med appens, `[{id, rod}]`) og `listings.published.fotos`; `pending.fotos` er en ventende rækkefølge | `sql/016-billedraekkefoelge.sql` |
| Appen må læse `forbrug` (til »Konto«) | `sql/017-forbrug-laeses.sql` |
| Prisvagtens forslag til godkendelse: `listings.forslag` | `sql/018-prisforslag.sql` |
| Ét billede lagt sidst i et klar-udkast i én sætning, kun når varen er færdiganalyseret og ikke sendt (`append_draft_photo`, kun service-nøglen) | `sql/019-tilfoej-billede.sql` |
| Billeder lagt til og fjernet: `append_draft_photo` løsnet til færdiganalyseret (`ny`/`afsendt`), ikke solgt og under 20 billeder; `remove_draft_photo` (på roden, aldrig det sidste), `restore_draft_photo` (Fortryd), `set_draft_photo_paa_sti` (optimeringen skriver på stien, ikke pladsen) | `sql/020-billeder-til-og-fra.sql` |
| Runnerens uploads gemt før Gem: `listings.fotos_op` (`[{rod, id}]`); `replace_draft_photo` (beskæringen); låsen i `set_draft_photo_paa_sti`; Fortryd ikke i en solgt vare | `sql/021-billeder-lagt-op.sql` |
| Hvilken model hvert trin bruger: `modelvalg` (`claude`/`skygge`/`gemini`, opslag trin → delen før kolon → `*`); hvert Gemini-forsøg og skyggens to svar: `modelkald` (30 dage) | `sql/022-gemini.sql` |
| Betalt annoncering: `annoncering_ordrer` (én faktura, `vinted_mail_id` unik), `annoncering` (én vares del; `kilde` `mail`/`dig`, `tal` og `dom` fra Vinted, unik på ordre+annonce), `annoncering_maal` (Vinteds tal, én pr. dag) | `sql/023-annoncering.sql` |
| Forsendelsen af en solgt vare: `listings.forsendelse` (status, transportør, sporingskode, fragtkode, frist, pakke, transaktion, samtale, levering, `maerkat`, hændelser); den private Storage-mappe `maerkater` (kun logget ind læser, kun service-nøglen skriver) | `sql/024-forsendelse.sql` |
| Mærkatet lagt ind fra appen: logget ind må lægge filer i `maerkater` | `sql/025-maerkat-fra-appen.sql` |
| Det, analysen tog fejl af: `rettelser` (kilde `dig` via triggeren `drafts_rettelse`, kilde `vinted` fra »clear«s `afvist`) | `sql/012-rettelser.sql` |

**Udkastet og annoncen er to forskellige ting.** Udkastet (`drafts`) er det, vi
sendte afsted; `listings.published` er annoncens egne ord, læst af annoncen
selv. De skilles ad med vilje: retter du en titel i Vinteds formular, eller
sætter prisvagten prisen ned, skal appen kunne vise BEGGE dele — ellers ved du
ikke, om tallet i appen er det, køberen ser. Udkastet overskrives aldrig af en
synkronisering.
