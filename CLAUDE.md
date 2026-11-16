# Einkaufsliste – Projektnotizen für Claude

Statische Web-App (GitHub Pages, kein Build-Schritt) für gesundes, günstiges Einkaufen in der Schweiz.
Backend: Supabase-Projekt `bjuutzhkmyaunamdojpm` (Region Zürich).

- `index.html`, `assets/app.js` (gesamte App, Hash-Router), `assets/parser.js` (Rezept-Parser), `assets/style.css`
- `data/rezepte.json`, `data/grundsortiment.json`: statische Basis-Inhalte (versioniert)
- `supabase/migrations/`: Datenbankschema · `supabase/functions/`: Edge Functions
  - `aktionen-update`: holt Aktionen von aktionis.ch (pg_cron 2× täglich, keine Claude-Nutzung)
  - `rezept-import`: Rezept-Import per Link (schema.org JSON-LD / Microdata), nur für angemeldete Benutzer
- Der Parser `supabase/functions/aktionen-update/parse.ts` lässt sich lokal testen:
  `node --experimental-strip-types` und `parseKarten(html, kategorie, jetzt)` importieren.
- Edge Functions werden über das Supabase-MCP deployt – Repo-Datei und deployte Version synchron halten.

Täglicher automatischer Lauf: siehe `docs/CLAUDE_SYNC.md` (nur lesen, wenn der Lauf Arbeit hat).

Sprache der App und aller Texte: Deutsch (Schweiz, «ss» statt «ß», Du-Form).
