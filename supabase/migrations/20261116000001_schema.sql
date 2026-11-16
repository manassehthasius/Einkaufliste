-- Einkaufliste: Datenbankschema
-- Öffentliche Daten (Aktionen, Grundsortiment, Anfänger-Rezepte) sind für alle lesbar
-- und werden nur serverseitig (Edge Function / Claude via service role) geschrieben.
-- Private Daten (Einstellungen, eigene Rezepte, Einkaufsliste) gehören dem eingeloggten Benutzer.

-- ---------------------------------------------------------------------------
-- Öffentliche Tabellen
-- ---------------------------------------------------------------------------

create table public.aktionen (
  id              bigint primary key,            -- ID der Quelle (aktionis.ch)
  laden           text not null,
  titel           text not null,
  beschreibung    text,
  kategorie       text,
  preis           numeric(10,2),
  preis_normal    numeric(10,2),
  rabatt_prozent  integer,
  einheitspreis   text,
  gueltig_von     date,
  gueltig_bis     date,
  bild_url        text,
  quelle_url      text,
  tags            text[] not null default '{}',
  gesund          smallint not null default 1,    -- 0 = ungesund, 1 = ok, 2 = gut, 3 = sehr gut
  bio             boolean not null default false,
  zuletzt_gesehen timestamptz not null default now()
);
create index aktionen_laden_idx on public.aktionen (laden);
create index aktionen_gueltig_bis_idx on public.aktionen (gueltig_bis);
create index aktionen_tags_idx on public.aktionen using gin (tags);

create table public.grundsortiment (
  id          text primary key,
  name        text not null,
  kategorie   text not null,
  menge       text,
  preis_min   numeric(10,2),
  preis_max   numeric(10,2),
  laeden      text,                 -- wo es typischerweise am günstigsten ist
  tipp        text,
  tags        text[] not null default '{}',
  ernaehrung  text[] not null default '{alles,vegetarisch,vegan}',
  wichtig     boolean not null default true,   -- Teil der Basis-Liste
  stand       date not null default current_date,
  sortierung  integer not null default 100
);

create table public.rezepte_vorschlaege (
  id              text primary key,
  titel           text not null,
  beschreibung    text,
  kategorie       text not null,            -- Frühstück, Hauptgericht, Suppe, Salat, Snack
  portionen       integer not null default 2,
  zeit_min        integer,
  schwierigkeit   text not null default 'sehr einfach',
  kosten_portion  numeric(10,2),
  ernaehrung      text[] not null default '{alles}',
  zutaten         jsonb not null default '[]',  -- [{menge, einheit, name, key}]
  schritte        jsonb not null default '[]',  -- ["Schritt 1", ...]
  tipps           text,
  tags            text[] not null default '{}',
  quelle          text not null default 'claude',
  aktiv           boolean not null default true,
  erstellt_am     timestamptz not null default now()
);

create table public.meta (
  key         text primary key,
  value       jsonb,
  updated_at  timestamptz not null default now()
);

create table public.scrape_log (
  id          bigserial primary key,
  gestartet   timestamptz not null default now(),
  beendet     timestamptz,
  anzahl      integer,
  seiten      integer,
  fehler      text
);

-- ---------------------------------------------------------------------------
-- Private Tabellen (pro Benutzer)
-- ---------------------------------------------------------------------------

create table public.einstellungen (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  daten             jsonb not null default '{}',
  wuensche          text,
  sync_angefordert  boolean not null default false,
  aktualisiert_am   timestamptz not null default now(),
  claude_sync_am    timestamptz,
  claude_nachricht  text
);

create table public.meine_rezepte (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titel           text not null,
  beschreibung    text,
  kategorie       text,
  portionen       integer,
  zeit_min        integer,
  zutaten         jsonb not null default '[]',
  schritte        jsonb not null default '[]',
  notizen         text,
  quelle_url      text,
  bild_url        text,
  favorit         boolean not null default false,
  tags            text[] not null default '{}',
  erstellt_am     timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create index meine_rezepte_user_idx on public.meine_rezepte (user_id);

create table public.einkaufsliste (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  menge       text,
  laden       text,
  kategorie   text,
  preis       numeric(10,2),
  aktion_id   bigint,
  quelle      text,            -- z.B. "Aktion", "Rezept: Chili", "Grundsortiment", "eigene"
  erledigt    boolean not null default false,
  erstellt_am timestamptz not null default now()
);
create index einkaufsliste_user_idx on public.einkaufsliste (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.aktionen            enable row level security;
alter table public.grundsortiment      enable row level security;
alter table public.rezepte_vorschlaege enable row level security;
alter table public.meta                enable row level security;
alter table public.scrape_log          enable row level security;
alter table public.einstellungen       enable row level security;
alter table public.meine_rezepte       enable row level security;
alter table public.einkaufsliste       enable row level security;

create policy "Aktionen sind öffentlich lesbar" on public.aktionen
  for select to anon, authenticated using (true);
create policy "Grundsortiment ist öffentlich lesbar" on public.grundsortiment
  for select to anon, authenticated using (true);
create policy "Rezeptvorschläge sind öffentlich lesbar" on public.rezepte_vorschlaege
  for select to anon, authenticated using (aktiv);
create policy "Meta ist öffentlich lesbar" on public.meta
  for select to anon, authenticated using (true);
-- scrape_log: kein Zugriff für Clients (nur service role)

create policy "Eigene Einstellungen lesen" on public.einstellungen
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Eigene Einstellungen anlegen" on public.einstellungen
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Eigene Einstellungen ändern" on public.einstellungen
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Eigene Rezepte lesen" on public.meine_rezepte
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Eigene Rezepte anlegen" on public.meine_rezepte
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Eigene Rezepte ändern" on public.meine_rezepte
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Eigene Rezepte löschen" on public.meine_rezepte
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Eigene Liste lesen" on public.einkaufsliste
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Eigene Liste anlegen" on public.einkaufsliste
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Eigene Liste ändern" on public.einkaufsliste
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Eigene Liste löschen" on public.einkaufsliste
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Benutzer dürfen claude_* Felder nicht selbst setzen (nur erlaubte Spalten freigeben)
revoke insert, update on public.einstellungen from anon, authenticated;
grant insert (user_id, daten, wuensche, sync_angefordert) on public.einstellungen to authenticated;
grant update (daten, wuensche, sync_angefordert) on public.einstellungen to authenticated;

-- ---------------------------------------------------------------------------
-- Trigger: Zeitstempel
-- ---------------------------------------------------------------------------

create or replace function public.setze_aktualisiert_am()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.aktualisiert_am := now();
  return new;
end;
$$;

create trigger meine_rezepte_aktualisiert
  before update on public.meine_rezepte
  for each row execute function public.setze_aktualisiert_am();

-- Einstellungen: nur Änderungen durch den Benutzer zählen als "geändert",
-- nicht wenn Claude claude_sync_am / claude_nachricht setzt.
create or replace function public.einstellungen_aktualisiert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.daten is distinct from old.daten
     or new.wuensche is distinct from old.wuensche
     or (new.sync_angefordert and not old.sync_angefordert) then
    new.aktualisiert_am := now();
  else
    new.aktualisiert_am := old.aktualisiert_am;
  end if;
  return new;
end;
$$;

create trigger einstellungen_aktualisiert
  before insert or update on public.einstellungen
  for each row execute function public.einstellungen_aktualisiert();

-- ---------------------------------------------------------------------------
-- Status-Abfrage für den täglichen Claude-Lauf (nur service role / postgres)
-- ---------------------------------------------------------------------------

create or replace function public.claude_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'aktionen_gueltig', (select count(*) from public.aktionen
                          where gueltig_bis is null or gueltig_bis >= current_date),
    'letzter_scrape_ok', (select max(beendet) from public.scrape_log where fehler is null and anzahl > 0),
    'letzter_fehler', (select jsonb_build_object('zeit', gestartet, 'fehler', fehler)
                         from public.scrape_log where fehler is not null
                         order by gestartet desc limit 1),
    'scrape_veraltet', coalesce((select max(beendet) from public.scrape_log
                                   where fehler is null and anzahl > 0) < now() - interval '30 hours', true),
    'zu_synchronisieren', coalesce((select jsonb_agg(user_id) from public.einstellungen
                                     where sync_angefordert
                                        or claude_sync_am is null
                                        or aktualisiert_am > claude_sync_am), '[]'::jsonb)
  );
$$;

revoke execute on function public.claude_status() from public, anon, authenticated;
