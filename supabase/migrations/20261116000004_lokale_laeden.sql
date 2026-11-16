-- Lokale Metzgereien/Hofläden pro PLZ (von Claude recherchiert) + claude_status() erweitert
create table public.lokale_laeden (
  id bigserial primary key, such_plz text not null, name text not null, typ text not null default 'Metzgerei',
  adresse text, plz text, ort text, distanz_km numeric(5,1), website text, telefon text, oeffnungszeiten text,
  angebot text, preisniveau text, hinweise text, quelle text, geprueft_am timestamptz not null default now()
);
create index lokale_laeden_plz_idx on public.lokale_laeden (such_plz);
alter table public.lokale_laeden enable row level security;
create policy "Lokale Läden für Angemeldete lesbar" on public.lokale_laeden for select to authenticated using (true);
-- claude_status(): zusätzlich 'laeden_recherche' (PLZ ohne aktuelle Einträge) – siehe Supabase-Migration «lokale_laeden»
