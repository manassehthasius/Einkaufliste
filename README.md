# Einkaufsliste – gesund & günstig in der Schweiz

Eine Web-App für deine Einkaufsliste mit **aktuellen Aktionen** von Migros, Coop, Lidl, Denner, Spar und Volg,
gesunden **Anfänger-Rezepten**, deinen **eigenen Rezepten** und **Einstellungen**, nach denen sich die Seite richtet.

## Funktionen

| Seite | Was sie kann |
|---|---|
| 🛒 **Liste** | Einkaufsliste mit Abhaken, Gruppierung nach Laden oder Kategorie, Budget-Balken, Ersparnis durch Aktionen, Teilen (z.B. WhatsApp). Vorschläge: Top-Aktionen für dich, Grundsortiment mit Richtpreisen und passenden Aktionen, Rezept-Ideen. |
| 🏷️ **Aktionen** | Alle aktuellen Lebensmittel-Aktionen deiner Läden mit Preis, Normalpreis, Rabatt, Gültigkeit und Gesundheits-Bewertung (🟢🟢🟢). Filter nach Laden, Kategorie, Suche, «nur gesunde». |
| 🍲 **Rezepte** | 16 einfache, gesunde und günstige Anfänger-Rezepte mit Schritt-für-Schritt-Anleitung, Portionen-Rechner, Kochmodus, «Zutaten auf die Liste» und Hinweis, welche Zutaten gerade in Aktion sind. Dazu «Küchen-Basics» für Anfänger. |
| 📖 **Meine** | Deine eigenen Rezepte: selbst schreiben, **Text einfügen** (wird automatisch erkannt) oder **per Link importieren** (Fooby, Betty Bossi, Migusto, Swissmilk u.v.m.). Favoriten, Suche, Bearbeiten. |
| ⚙️ **Einstellungen** | Läden, Ernährung, Unverträglichkeiten, «mag ich nicht», Ziele, Haushalt & Budget, Kochniveau, Lieblingsküchen, Design – und **«Wünsche an Claude»**. Login für Sync zwischen Handy und PC, Export/Import. |

## So bleibt alles aktuell

```
aktionis.ch ──(2× täglich, 04:30 & 16:30)──▶ Edge Function «aktionen-update» ──▶ Tabelle «aktionen»
                                                    (pg_cron, ohne Claude-Nutzung)

Deine Einstellungen & Wünsche ──▶ Tabelle «einstellungen»
                                        │
              täglich ca. 06:47 ◀───────┘  Claude prüft mit EINER Abfrage, ob sich etwas geändert hat.
                                           Nur dann: neue passende Rezepte, Grundsortiment, Nachricht an dich.
```

- **Aktionen**: werden automatisch von [aktionis.ch](https://www.aktionis.ch) übernommen (sammelt die Prospekte der
  Schweizer Detailhändler), kategorisiert, mit Zutaten verknüpft und auf Gesundheit bewertet.
- **Personalisierung** (Ernährung, Allergien, Läden, Ziele …) wirkt **sofort** im Browser.
- **Claude** baut einmal täglich neue Inhalte, wenn du Einstellungen oder Wünsche geändert hast. Ohne Änderung
  endet der Lauf nach einer einzigen Datenbankabfrage – das spart Nutzung. Details: [`docs/CLAUDE_SYNC.md`](docs/CLAUDE_SYNC.md)

## Einrichtung (einmalig, ca. 5 Minuten)

1. **GitHub Pages aktivieren**: Im Repository *Settings → Pages → Build and deployment → Source: Deploy from a branch*,
   Branch wählen (z.B. `main` oder den Entwicklungs-Branch), Ordner `/ (root)`, *Save*.
   Die Seite ist danach unter `https://manassehthasius.github.io/Einkaufliste/` erreichbar.
2. **Login-Links erlauben** (Supabase Dashboard → Projekt *einkaufliste* → *Authentication → URL Configuration*):
   - *Site URL*: `https://manassehthasius.github.io/Einkaufliste/`
   - *Redirect URLs*: `https://manassehthasius.github.io/Einkaufliste/**`
3. Seite öffnen → *Einstellungen* → E-Mail eingeben → Login-Link öffnen. Fertig.
4. Empfohlen, sobald du angemeldet bist: *Authentication → Sign In / Providers → «Allow new users to sign up»*
   ausschalten, damit sich niemand sonst registrieren kann.

Ohne Login funktioniert alles auch – Liste und Rezepte bleiben dann nur in diesem Browser.
Zum Handy: Seite im Browser öffnen → *Zum Home-Bildschirm hinzufügen*.

## Grenzen & Hinweise

- **Aldi Suisse** bietet keine automatisch abrufbare Quelle. Die Seite verlinkt auf aldi-suisse.ch; Aldi-Angebote
  kannst du mit Laden «Aldi» und Preis selbst auf die Liste setzen.
- **Richtpreise im Grundsortiment** sind gerundete Spannen für die günstigen Eigenmarken (Stand siehe
  `data/grundsortiment.json`), keine Ladenpreise. Aktuelle Aktionen werden live daneben angezeigt.
- Die **Gesundheits-Bewertung** der Aktionen ist eine einfache Heuristik (Kategorie + Stichworte).
- Rezept-Import per Link funktioniert bei Seiten mit strukturierten Rezeptdaten. Einige Seiten (z.B. Chefkoch)
  blockieren automatische Abrufe – dann den Text kopieren und «Text einfügen» nutzen.
- Kosten: GitHub Pages und Supabase Free Tier sind gratis. Supabase pausiert Gratis-Projekte nach einer Woche ohne
  Aktivität – die täglichen Abrufe halten das Projekt aktiv.

## Technik

- Statische Single-Page-App ohne Build-Schritt: `index.html`, `assets/app.js`, `assets/parser.js`, `assets/style.css`
- Supabase (Region Zürich): Postgres mit Row Level Security, Auth per Magic Link, Edge Functions, pg_cron
- Datenbankschema: `supabase/migrations/` · Edge Functions: `supabase/functions/`
- Lokal testen: `python3 -m http.server 8000` im Repository und `http://localhost:8000` öffnen
