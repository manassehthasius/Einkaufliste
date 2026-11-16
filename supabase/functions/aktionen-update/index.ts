// Edge Function: holt die aktuellen Aktionen (Lebensmittel) von aktionis.ch,
// ordnet sie Kategorien/Zutaten zu, bewertet sie (gesund 0–3) und speichert sie
// in der Tabelle public.aktionen. Läuft per pg_cron 2x täglich – ohne Claude-Nutzung.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { type Aktion, BASIS, KATEGORIEN, parseKarten } from "./parse.ts";

const UA = "Mozilla/5.0 (compatible; Einkaufsliste-Privat/1.0)";
const MAX_SEITEN_PRO_KATEGORIE = 8;
const MIN_ABSTAND_MIN = 15; // Schutz gegen zu häufige Aufrufe

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

async function holen(pfad: string): Promise<string> {
  const r = await fetch(BASIS + pfad, {
    headers: { "User-Agent": UA, "Accept-Language": "de-CH,de;q=0.9" },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} für ${pfad}`);
  return await r.text();
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const antwort = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  // Zu häufige Aufrufe abfangen
  const { data: letzter } = await sb.from("scrape_log").select("gestartet").order("gestartet", { ascending: false }).limit(1);
  if (letzter?.[0] && Date.now() - new Date(letzter[0].gestartet).getTime() < MIN_ABSTAND_MIN * 60_000) {
    return antwort({ uebersprungen: true, grund: `Letzter Lauf vor weniger als ${MIN_ABSTAND_MIN} Minuten` });
  }

  const jetzt = new Date().toISOString();
  const { data: log } = await sb.from("scrape_log").insert({ gestartet: jetzt }).select("id").single();
  const alle = new Map<number, Aktion>();
  let seiten = 0;
  const fehler: string[] = [];

  try {
    for (const [slug, name] of KATEGORIEN) {
      const pfad = `/q/${encodeURIComponent(slug)}`;
      let maxSeite = 1;
      for (let s = 1; s <= Math.min(maxSeite, MAX_SEITEN_PRO_KATEGORIE); s++) {
        try {
          const html = await holen(s === 1 ? pfad : `${pfad}/${s}`);
          seiten++;
          if (s === 1) {
            const m = html.match(/name="max_page" value="(\d+)"/);
            maxSeite = m ? parseInt(m[1], 10) : 1;
          }
          for (const a of parseKarten(html, name, jetzt)) {
            const vorher = alle.get(a.id);
            if (!vorher) alle.set(a.id, a);
            else if (name === "Bio") { vorher.bio = true; if (!vorher.tags.includes("bio")) vorher.tags.push("bio"); }
          }
        } catch (e) {
          fehler.push(String(e));
        }
        await pause(400); // höflich bleiben
      }
    }

    const liste = [...alle.values()];
    if (liste.length < 30) throw new Error(`Zu wenige Aktionen gefunden (${liste.length}). ${fehler.join("; ")}`);

    for (let i = 0; i < liste.length; i += 200) {
      const { error } = await sb.from("aktionen").upsert(liste.slice(i, i + 200));
      if (error) throw error;
    }
    // Nicht mehr gelistete Aktionen nur entfernen, wenn alle Seiten geladen wurden
    if (fehler.length === 0) await sb.from("aktionen").delete().lt("zuletzt_gesehen", jetzt);
    // Abgelaufene Aktionen immer entfernen
    const heute = new Date().toISOString().slice(0, 10);
    await sb.from("aktionen").delete().lt("gueltig_bis", heute);

    const laeden: Record<string, number> = {};
    for (const a of liste) laeden[a.laden] = (laeden[a.laden] ?? 0) + 1;
    await sb.from("meta").upsert({
      key: "aktionen_stand",
      value: { zeit: new Date().toISOString(), anzahl: liste.length, laeden, quelle: "aktionis.ch", warnungen: fehler.slice(0, 5) },
      updated_at: new Date().toISOString(),
    });
    await sb.from("scrape_log").update({ beendet: new Date().toISOString(), anzahl: liste.length, seiten, fehler: null }).eq("id", log!.id);
    return antwort({ ok: true, anzahl: liste.length, seiten, laeden, warnungen: fehler.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    await sb.from("scrape_log").update({ beendet: new Date().toISOString(), anzahl: alle.size, seiten, fehler: msg.slice(0, 2000) }).eq("id", log!.id);
    return antwort({ ok: false, fehler: msg }, 500);
  }
});
