// Edge Function: importiert ein Rezept von einer Webseite (schema.org/Recipe als JSON-LD).
// Nur für angemeldete Benutzer (JWT mit Rolle "authenticated").
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_BYTES = 3_000_000;

function antwort(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function rolleAusJwt(auth: string | null): string | null {
  try {
    const token = (auth ?? "").replace(/^Bearer\s+/i, "");
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role ?? null;
  } catch {
    return null;
  }
}

function erlaubteUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return null;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":")) return null; // keine IP-Adressen
    if (h.endsWith(".supabase.co") || h.endsWith(".supabase.in")) return null;
    return u;
  } catch {
    return null;
  }
}

function text(s: unknown): string {
  if (typeof s !== "string") return "";
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

function minuten(iso: unknown): number | null {
  if (typeof iso !== "string") return null;
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return null;
  const min = (Number(m[1] ?? 0) * 1440) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
  return min || null;
}

// deno-lint-ignore no-explicit-any
function findeRezept(node: any): any {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) { const r = findeRezept(n); if (r) return r; }
    return null;
  }
  const typ = node["@type"];
  if (typ === "Recipe" || (Array.isArray(typ) && typ.includes("Recipe"))) return node;
  if (node["@graph"]) return findeRezept(node["@graph"]);
  if (node.mainEntity) return findeRezept(node.mainEntity);
  return null;
}

// deno-lint-ignore no-explicit-any
function schritte(instr: any): string[] {
  if (!instr) return [];
  if (typeof instr === "string") {
    const teile = instr.split(/\n+|<br\s*\/?>|<\/p>|<\/li>/i).map(text).filter(Boolean);
    // Ein einziger sehr langer Block: in Sätze aufteilen
    if (teile.length === 1 && teile[0].length > 400) return teile[0].split(/(?<=\.)\s+(?=[A-ZÄÖÜ])/).filter(Boolean);
    return teile;
  }
  if (Array.isArray(instr)) return instr.flatMap(schritte);
  if (instr["@type"] === "HowToSection") return schritte(instr.itemListElement);
  if (instr.text) return [text(instr.text)].filter(Boolean);
  if (instr.name) return [text(instr.name)].filter(Boolean);
  return [];
}

// Microdata (itemprop="…") als Fallback, z.B. für Swissmilk
function mdWerte(html: string, prop: string): string[] {
  const out: string[] = [];
  const reEl = new RegExp(`<(\\w+)\\b[^>]*itemprop=["']${prop}["'][^>]*>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = reEl.exec(html)) && out.length < 100) {
    const tag = m[0];
    const content = tag.match(/\scontent=["']([^"']*)["']/i);
    if (content) { out.push(content[1]); continue; }
    if (/^<(meta|link|img)\b/i.test(tag)) {
      const src = tag.match(/\s(?:src|href)=["']([^"']*)["']/i);
      if (src) out.push(src[1]);
      continue;
    }
    const name = m[1];
    const start = m.index + tag.length;
    const re = new RegExp(`<(/?)${name}\\b[^>]*>`, "gi");
    re.lastIndex = start;
    let tiefe = 1, mm: RegExpExecArray | null, ende = -1;
    while ((mm = re.exec(html))) {
      if (mm[1]) { if (--tiefe === 0) { ende = mm.index; break; } }
      else if (!mm[0].endsWith("/>")) tiefe++;
    }
    if (ende > 0) out.push(html.slice(start, ende));
  }
  return out;
}

function ausMicrodata(html: string) {
  if (!/itemtype=["']https?:\/\/(www\.)?schema\.org\/Recipe["']/i.test(html)) return null;
  const eins = (p: string) => mdWerte(html, p)[0];
  return {
    name: eins("name"),
    description: eins("description"),
    recipeIngredient: [...mdWerte(html, "recipeIngredient"), ...mdWerte(html, "ingredients")],
    recipeInstructions: mdWerte(html, "recipeInstructions"),
    recipeYield: eins("recipeYield"),
    totalTime: eins("totalTime"),
    prepTime: eins("prepTime"),
    cookTime: eins("cookTime"),
    recipeCategory: eins("recipeCategory"),
    image: eins("image"),
  };
}

// deno-lint-ignore no-explicit-any
function bild(b: any): string | null {
  if (!b) return null;
  if (typeof b === "string") return b;
  if (Array.isArray(b)) return bild(b[0]);
  return b.url ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (rolleAusJwt(req.headers.get("Authorization")) !== "authenticated") {
    return antwort({ ok: false, fehler: "Bitte zuerst anmelden." }, 401);
  }
  let url: URL | null = null;
  try {
    const body = await req.json();
    url = erlaubteUrl(String(body?.url ?? ""));
  } catch { /* unten behandelt */ }
  if (!url) return antwort({ ok: false, fehler: "Ungültiger Link." }, 400);

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    // Weiterleitungen selbst folgen und jedes Ziel prüfen
    let r: Response | null = null;
    let ziel: URL | null = url;
    for (let i = 0; i < 4 && ziel; i++) {
      r = await fetch(ziel.href, {
        signal: ctrl.signal,
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Einkaufsliste-Rezeptimport/1.0)",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "de-CH,de;q=0.9",
        },
      });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
        await r.body?.cancel();
        ziel = erlaubteUrl(new URL(r.headers.get("location")!, ziel).href);
        if (!ziel) { clearTimeout(timer); return antwort({ ok: false, fehler: "Weiterleitung auf eine nicht erlaubte Adresse." }, 400); }
        continue;
      }
      break;
    }
    if (!r || !r.ok) { clearTimeout(timer); return antwort({ ok: false, fehler: `Die Seite antwortet mit Fehler ${r?.status ?? "?"}.` }); }
    const buf = new Uint8Array(await r.arrayBuffer());
    clearTimeout(timer);
    const html = new TextDecoder().decode(buf.slice(0, MAX_BYTES));

    const skripte = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
    let rezept = null;
    for (const s of skripte) {
      try { rezept = findeRezept(JSON.parse(s.trim())); } catch { /* ungültiges JSON überspringen */ }
      if (rezept) break;
    }
    if (!rezept) rezept = ausMicrodata(html);
    if (!rezept) {
      const titel = text(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
      return antwort({ ok: false, fehler: `Auf dieser Seite wurde kein strukturiertes Rezept gefunden${titel ? ` («${titel.slice(0, 60)}»)` : ""}. Kopiere den Text und nutze «Text einfügen».` });
    }

    const zutaten = (Array.isArray(rezept.recipeIngredient) ? rezept.recipeIngredient : [rezept.recipeIngredient])
      .map(text).filter(Boolean);
    const yieldRoh = Array.isArray(rezept.recipeYield) ? rezept.recipeYield[0] : rezept.recipeYield;
    const portionen = parseInt(String(yieldRoh ?? "").match(/\d+/)?.[0] ?? "", 10) || null;
    const zeit = minuten(rezept.totalTime) ?? (((minuten(rezept.prepTime) ?? 0) + (minuten(rezept.cookTime) ?? 0)) || null);
    const kategorieRoh = text(Array.isArray(rezept.recipeCategory) ? rezept.recipeCategory[0] : rezept.recipeCategory).toLowerCase();
    const kategorie = /frühstück|breakfast|brunch/.test(kategorieRoh) ? "Frühstück"
      : /suppe|soup/.test(kategorieRoh) ? "Suppe"
      : /salat|salad/.test(kategorieRoh) ? "Salat"
      : /dessert|kuchen|gebäck|süss/.test(kategorieRoh) ? "Dessert"
      : /snack|apéro|vorspeise/.test(kategorieRoh) ? "Snack" : "Hauptgericht";

    return antwort({
      ok: true,
      rezept: {
        titel: text(rezept.name).slice(0, 200),
        beschreibung: text(rezept.description).slice(0, 500),
        kategorie,
        portionen,
        zeit_min: zeit,
        zutaten: zutaten.slice(0, 80),
        schritte: schritte(rezept.recipeInstructions).slice(0, 60),
        bild_url: bild(rezept.image),
      },
    });
  } catch (e) {
    const msg = e instanceof Error && e.name === "AbortError" ? "Die Seite hat zu lange gebraucht." : "Die Seite konnte nicht geladen werden.";
    return antwort({ ok: false, fehler: msg });
  }
});
