// Einkaufsliste – gesund & günstig einkaufen in der Schweiz
// Statische Single-Page-App (ohne Build-Schritt) mit Supabase als Backend.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_KEY, CLAUDE_SYNC_ZEIT } from "./config.js";
import { parseRezeptText, zutatenAusText, schritteAusText, zutatAlsText, formatMenge, keyFuer, istBasis } from "./parser.js";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/* ------------------------------------------------------------------ */
/* Hilfsfunktionen                                                     */
/* ------------------------------------------------------------------ */

const $ = (sel, root = document) => root.querySelector(sel);
const app = $("#app");

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function sichereUrl(u) {
  try { const x = new URL(u, location.href); return ["http:", "https:"].includes(x.protocol) ? x.href : ""; } catch { return ""; }
}
function chf(n) {
  if (n == null || !Number.isFinite(Number(n))) return "";
  return "Fr. " + Number(n).toFixed(2);
}
const heuteISO = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });
function datumKurz(iso) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return d.toLocaleDateString("de-CH", { weekday: "short", day: "2-digit", month: "2-digit" });
}
function zeitpunkt(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("de-CH", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
let toastTimer;
function toast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.classList.add("zeigen");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("zeigen"), 2600);
}
function entprellt(fn, ms = 200) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
const lokal = {
  get(k, std) { try { const v = localStorage.getItem("ek_" + k); return v ? JSON.parse(v) : std; } catch { return std; } },
  set(k, v) { try { localStorage.setItem("ek_" + k, JSON.stringify(v)); } catch { /* privat-Modus */ } },
  weg(k) { try { localStorage.removeItem("ek_" + k); } catch { /* egal */ } },
};

/* ------------------------------------------------------------------ */
/* Konstanten                                                          */
/* ------------------------------------------------------------------ */

const ALLE_LAEDEN = ["Migros", "Coop", "Lidl", "Denner", "Aldi", "Spar", "Volg", "Otto's"];
const LADEN_FARBEN = {
  Migros: "#e05a00", Coop: "#d4321c", "Coop Megastore": "#d4321c", Lidl: "#1f5fbf", Denner: "#c8102e",
  Aldi: "#1b3a6b", Spar: "#1e7f3c", Volg: "#b5121b", "Otto's": "#7a4fc9",
};
const LADEN_LINKS = { Aldi: "https://www.aldi-suisse.ch" };
const OHNE_AUTO_AKTIONEN = ["Aldi"]; // keine automatisch abrufbare Quelle

const ERNAEHRUNG = [
  ["alles", "Allesesser"], ["flexitarisch", "Flexitarisch"], ["pescetarisch", "Pescetarisch"],
  ["vegetarisch", "Vegetarisch"], ["vegan", "Vegan"],
];
const ZIELE = [
  ["gesund", "Gesund & ausgewogen"], ["protein", "Viel Protein"], ["abnehmen", "Abnehmen"],
  ["muskel", "Muskelaufbau"], ["zucker", "Wenig Zucker"], ["guenstig", "Möglichst günstig"],
  ["bio", "Bio bevorzugt"], ["saisonal", "Regional & saisonal"], ["schnell", "Schnell (≤ 20 Min.)"],
  ["mealprep", "Meal Prep / Vorkochen"],
];
const KUECHEN = [
  ["schweizer", "Schweizer"], ["italienisch", "Italienisch"], ["asiatisch", "Asiatisch"],
  ["mexikanisch", "Mexikanisch"], ["indisch", "Indisch"], ["orientalisch", "Orientalisch"],
  ["mediterran", "Mediterran"], ["amerikanisch", "Amerikanisch"],
];
const ALLERGIEN = [["laktose", "Laktose"], ["gluten", "Gluten"], ["nuesse", "Nüsse"], ["eier", "Eier"], ["fisch", "Fisch"]];
const NIVEAUS = [["anfaenger", "Anfänger"], ["etwas", "Etwas Erfahrung"], ["fortgeschritten", "Fortgeschritten"]];

const FLEISCH = ["poulet", "hackfleisch", "rind", "schwein", "lamm", "kalb", "wurst"];
const FISCH = ["lachs", "thunfisch", "crevetten", "fisch"];
const TIERISCH = ["eier", "milch", "joghurt", "quark", "huettenkaese", "mozzarella", "kaese", "butter", "rahm"];
const PROTEIN = ["poulet", "hackfleisch", "rind", "lachs", "thunfisch", "fisch", "eier", "quark", "huettenkaese", "joghurt", "linsen", "kichererbsen", "bohnen", "tofu"];
const ALLERGIE_KEYS = {
  laktose: ["milch", "joghurt", "quark", "huettenkaese", "mozzarella", "kaese", "butter", "rahm"],
  gluten: ["pasta", "brot", "haferflocken", "muesli"],
  nuesse: ["nuesse", "erdnussbutter"],
  eier: ["eier"],
  fisch: FISCH,
};
// Aktionen aus diesen Kategorien werden nicht als Zutat/Grundnahrungsmittel vorgeschlagen
const KEINE_ZUTATEN_KATEGORIEN = ["Säfte", "Fertiggerichte", "Süsses & Snacks", "Kaffee & Tee"];
// Produkte, die zwar eine Zutat im Namen tragen, aber keine sind (z.B. «Würzmischung Knoblauch»)
const KEINE_ZUTAT = /würzmischung|gewürz|bouillon|fond\b|aroma|flavour|sauce|dressing|pesto|chips|snack|riegel|drink|saft|sirup|konfi/i;
const REZEPT_KATEGORIEN = ["Frühstück", "Hauptgericht", "Suppe", "Salat", "Snack", "Dessert"];

const STANDARD = {
  laeden: ["Migros", "Coop", "Lidl", "Denner", "Aldi"],
  ernaehrung: "alles",
  personen: 1,
  budget: 70,
  ziele: ["gesund", "guenstig"],
  niveau: "anfaenger",
  max_zeit: 45,
  kuechen: [],
  allergien: [],
  mag_nicht: "",
  nur_gesund: true,
  bilder: true,
  design: "auto",
  gruppierung: "laden",
  plz: "",
  umkreis: 15,
};

/* ------------------------------------------------------------------ */
/* Zustand                                                             */
/* ------------------------------------------------------------------ */

const S = {
  user: null,
  einst: { ...STANDARD, ...lokal.get("einstellungen", {}) },
  meta: { wuensche: lokal.get("wuensche", ""), claude_nachricht: null, claude_sync_am: null, sync_angefordert: false, aktualisiert_am: null },
  aktionen: [],
  aktionenStand: null,
  grund: [],
  grundStand: null,
  rezepte: [],
  meine: [],
  liste: [],
  lokaleLaeden: [],
  geladen: false,
  index: new Map(),
  ui: {
    vorschlagTab: "fuerdich",
    akt: { laden: "alle", kat: "alle", q: "", gesund: null, sort: "rabatt", limit: 60 },
    rez: { kat: "alle", q: "", alleZeiten: false },
    meine: { q: "", nurFav: false },
    portionen: {},
    habe: {},
    schritte: {},
    editor: null,
    plan: null,
    nachrichtGesehen: lokal.get("nachricht_gesehen", ""),
  },
};

/* ------------------------------------------------------------------ */
/* Datenzugriff: Supabase wenn angemeldet, sonst lokal im Browser      */
/* ------------------------------------------------------------------ */

// Offline-Unterstützung: Änderungen ohne Netz werden gemerkt und später synchronisiert
const istNetzfehler = (e) => !navigator.onLine || e instanceof TypeError || /failed to fetch|network|load failed|fetch/i.test(e?.message || "");
const cacheKey = (t) => `cache_${t}_${S.user?.id}`;
function inWarteschlange(op) {
  lokal.set("warteschlange", [...lokal.get("warteschlange", []), { ...op, user: S.user.id }]);
}
function lokalesObjekt(tabelle, id) {
  return (tabelle === "einkaufsliste" ? S.liste : S.meine).find((z) => z.id === id) || { id };
}
async function warteschlangeAbarbeiten() {
  if (!S.user || !navigator.onLine) return;
  const q = lokal.get("warteschlange", []);
  if (!q.length) return;
  const rest = [];
  let erledigt = 0;
  for (const op of q) {
    if (op.user !== S.user.id) continue;
    const res = op.typ === "neu" ? await sb.from(op.t).upsert(op.zeilen)
      : op.typ === "aendern" ? await sb.from(op.t).update(op.patch).eq("id", op.id)
      : await sb.from(op.t).delete().in("id", op.ids);
    if (res.error && istNetzfehler(res.error)) rest.push(op);
    else { erledigt++; if (res.error) console.error(res.error); }
  }
  lokal.set("warteschlange", rest);
  if (erledigt) toast("Offline-Änderungen synchronisiert ✓");
}

const db = {
  async liste(tabelle) {
    if (!S.user) return lokal.get(tabelle, []);
    const { data, error } = await sb.from(tabelle).select("*").order("erstellt_am", { ascending: true });
    if (error) {
      if (istNetzfehler(error)) return lokal.get(cacheKey(tabelle), []);
      throw error;
    }
    lokal.set(cacheKey(tabelle), data);
    return data;
  },
  async neu(tabelle, zeilen) {
    zeilen = Array.isArray(zeilen) ? zeilen : [zeilen];
    if (!S.user) {
      const alle = lokal.get(tabelle, []);
      const neu = zeilen.map((z) => ({ id: uuid(), erstellt_am: new Date().toISOString(), ...z }));
      lokal.set(tabelle, [...alle, ...neu]);
      return neu;
    }
    zeilen = zeilen.map((z) => ({ id: uuid(), ...z }));
    const { data, error } = await sb.from(tabelle).insert(zeilen).select();
    if (error) {
      if (!istNetzfehler(error)) throw error;
      inWarteschlange({ typ: "neu", t: tabelle, zeilen });
      return zeilen.map((z) => ({ erstellt_am: new Date().toISOString(), ...z }));
    }
    return data;
  },
  async aendern(tabelle, id, patch) {
    if (!S.user) {
      const alle = lokal.get(tabelle, []).map((z) => (z.id === id ? { ...z, ...patch } : z));
      lokal.set(tabelle, alle);
      return alle.find((z) => z.id === id);
    }
    const { data, error } = await sb.from(tabelle).update(patch).eq("id", id).select().single();
    if (error) {
      if (!istNetzfehler(error)) throw error;
      inWarteschlange({ typ: "aendern", t: tabelle, id, patch });
      return { ...lokalesObjekt(tabelle, id), ...patch };
    }
    return data;
  },
  async loeschen(tabelle, ids) {
    ids = Array.isArray(ids) ? ids : [ids];
    if (!ids.length) return;
    if (!S.user) {
      lokal.set(tabelle, lokal.get(tabelle, []).filter((z) => !ids.includes(z.id)));
      return;
    }
    const { error } = await sb.from(tabelle).delete().in("id", ids);
    if (error) {
      if (!istNetzfehler(error)) throw error;
      inWarteschlange({ typ: "loeschen", t: tabelle, ids });
    }
  },
};

async function fehlerZeigen(e, text = "Das hat nicht geklappt") {
  console.error(e);
  toast(`${text}: ${e?.message || e}`);
}

/* ------------------------------------------------------------------ */
/* Laden der Daten                                                     */
/* ------------------------------------------------------------------ */

async function ladeAktionen() {
  const spalten = "id,laden,titel,beschreibung,kategorie,preis,preis_normal,rabatt_prozent,einheitspreis,gueltig_von,gueltig_bis,bild_url,quelle_url,tags,gesund,bio";
  const alle = [];
  for (let von = 0; von < 5000; von += 1000) {
    const { data, error } = await sb.from("aktionen").select(spalten)
      .or(`gueltig_bis.is.null,gueltig_bis.gte.${heuteISO()}`)
      .order("id").range(von, von + 999);
    if (error) throw error;
    alle.push(...data);
    if (data.length < 1000) break;
  }
  S.aktionen = alle;
  const { data: meta } = await sb.from("meta").select("value").eq("key", "aktionen_stand").maybeSingle();
  S.aktionenStand = meta?.value ?? null;
  lokal.set("cache_aktionen", { aktionen: alle, stand: S.aktionenStand });
}
function aktionenAusCache() {
  const c = lokal.get("cache_aktionen", null);
  if (!c) return false;
  S.aktionen = c.aktionen.filter((a) => !a.gueltig_bis || a.gueltig_bis >= heuteISO());
  S.aktionenStand = c.stand;
  return true;
}

async function ladeOeffentlich() {
  const [rez, grund, claudeRez, claudeGrund] = await Promise.all([
    fetch("data/rezepte.json").then((r) => r.json()).catch(() => ({ rezepte: [] })),
    fetch("data/grundsortiment.json").then((r) => r.json()).catch(() => ({ artikel: [] })),
    sb.from("rezepte_vorschlaege").select("*").then((r) => r.data ?? []),
    sb.from("grundsortiment").select("*").then((r) => r.data ?? []),
    ladeAktionen().catch((e) => {
      console.error(e);
      toast(aktionenAusCache() ? "Offline – Aktionen vom letzten Abruf" : "Aktionen konnten nicht geladen werden");
    }),
  ]);
  const claudeIds = new Set(claudeRez.map((r) => r.id));
  S.rezepte = [
    ...rez.rezepte.filter((r) => !claudeIds.has(r.id)).map((r) => ({ ...r, quelle: "basis" })),
    ...claudeRez.map((r) => ({ ...r, quelle: "claude" })),
  ];
  const grundIds = new Set(claudeGrund.map((g) => g.id));
  S.grund = [...grund.artikel.filter((g) => !grundIds.has(g.id)), ...claudeGrund].sort((a, b) => (a.sortierung ?? 100) - (b.sortierung ?? 100));
  S.grundStand = grund.stand;
}

async function ladePrivat() {
  try {
    [S.liste, S.meine] = await Promise.all([db.liste("einkaufsliste"), db.liste("meine_rezepte")]);
  } catch (e) { fehlerZeigen(e, "Deine Daten konnten nicht geladen werden"); }
  if (S.user) {
    const { data, error } = await sb.from("einstellungen").select("*").eq("user_id", S.user.id).maybeSingle();
    if (error) console.error(error);
    else if (data) {
      S.einst = { ...STANDARD, ...data.daten };
      S.meta = { wuensche: data.wuensche ?? "", claude_nachricht: data.claude_nachricht, claude_sync_am: data.claude_sync_am, sync_angefordert: data.sync_angefordert, aktualisiert_am: data.aktualisiert_am };
      lokal.set("einstellungen", S.einst);
    } else {
      await speichereEinstellungen(false).catch(console.error);
    }
  }
  await ladeLokaleLaeden();
  wendeDesignAn();
  baueIndex();
}

async function ladeLokaleLaeden() {
  S.lokaleLaeden = [];
  if (!S.user || !/^\d{4}$/.test(S.einst.plz || "")) return;
  const { data } = await sb.from("lokale_laeden").select("*").eq("such_plz", S.einst.plz).order("distanz_km", { nullsFirst: false });
  S.lokaleLaeden = (data || []).filter((l) => l.distanz_km == null || l.distanz_km <= (S.einst.umkreis || 999));
}

// Lokale Daten nach dem ersten Login in die Cloud übernehmen
async function lokaleDatenHochladen() {
  for (const tabelle of ["einkaufsliste", "meine_rezepte"]) {
    const zeilen = lokal.get(tabelle, []);
    if (!zeilen.length) continue;
    const sauber = zeilen.map(({ id, user_id, erstellt_am, aktualisiert_am, ...rest }) => rest);
    const { error } = await sb.from(tabelle).insert(sauber);
    if (!error) lokal.weg(tabelle);
    else console.error(error);
  }
}

async function speichereEinstellungen(syncAnfordern) {
  lokal.set("einstellungen", S.einst);
  lokal.set("wuensche", S.meta.wuensche);
  wendeDesignAn();
  baueIndex();
  if (!S.user) return;
  const zeile = { user_id: S.user.id, daten: S.einst, wuensche: S.meta.wuensche || null };
  if (syncAnfordern) zeile.sync_angefordert = true;
  const { data, error } = await sb.from("einstellungen").upsert(zeile).select().single();
  if (error) throw error;
  S.meta = { ...S.meta, claude_nachricht: data.claude_nachricht, claude_sync_am: data.claude_sync_am, sync_angefordert: data.sync_angefordert, aktualisiert_am: data.aktualisiert_am };
}

function wendeDesignAn() {
  const d = S.einst.design;
  if (d === "hell") document.documentElement.dataset.theme = "light";
  else if (d === "dunkel") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
}

/* ------------------------------------------------------------------ */
/* Personalisierung                                                    */
/* ------------------------------------------------------------------ */

function laedenAktiv() {
  const l = new Set(S.einst.laeden);
  if (l.has("Coop")) l.add("Coop Megastore");
  return l;
}
function verboteneKeys() {
  const e = S.einst, v = new Set();
  if (["vegetarisch", "vegan"].includes(e.ernaehrung)) [...FLEISCH, ...FISCH].forEach((k) => v.add(k));
  if (e.ernaehrung === "pescetarisch") FLEISCH.forEach((k) => v.add(k));
  if (e.ernaehrung === "vegan") TIERISCH.forEach((k) => v.add(k));
  for (const a of e.allergien) (ALLERGIE_KEYS[a] || []).forEach((k) => v.add(k));
  return v;
}
function magNicht() {
  return (S.einst.mag_nicht || "").split(/[,;\n]/).map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 3);
}

function aktionPasst(a, { gesundMin = 0 } = {}) {
  if (!laedenAktiv().has(a.laden)) return false;
  if (a.gesund < gesundMin) return false;
  const v = verboteneKeys();
  const verboten = (a.tags || []).filter((t) => v.has(t));
  const laktosefreiOk = /laktosefrei/i.test(a.titel) && S.einst.ernaehrung !== "vegan" && verboten.every((t) => ALLERGIE_KEYS.laktose.includes(t));
  if (verboten.length && !laktosefreiOk) return false;
  if (["vegetarisch", "vegan"].includes(S.einst.ernaehrung) && ["Fleisch", "Fisch"].includes(a.kategorie)) return false;
  if (S.einst.ernaehrung === "pescetarisch" && a.kategorie === "Fleisch") return false;
  if (S.einst.ernaehrung === "vegan" && a.kategorie === "Milchprodukte & Eier" && !/vegan|hafer|soja|mandel|pflanz/i.test(a.titel)) return false;
  if (S.einst.ziele.includes("zucker") && a.kategorie === "Süsses & Snacks") return false;
  const woerter = magNicht();
  if (woerter.length && woerter.some((w) => a.titel.toLowerCase().includes(w))) return false;
  return true;
}
const istGueltigJetzt = (a) => !a.gueltig_von || a.gueltig_von <= heuteISO();

// Beste passende Aktion je Zutaten-Schlüssel
function baueIndex() {
  S.index = new Map();
  for (const a of S.aktionen) {
    if (!a.tags?.length || KEINE_ZUTATEN_KATEGORIEN.includes(a.kategorie) || KEINE_ZUTAT.test(a.titel) || !aktionPasst(a, { gesundMin: 2 })) continue;
    for (const t of a.tags) {
      if (t === "bio") continue;
      const bisher = S.index.get(t);
      if (!bisher || besser(a, bisher)) S.index.set(t, a);
    }
  }
}
function besser(a, b) {
  const ja = istGueltigJetzt(a), jb = istGueltigJetzt(b);
  if (ja !== jb) return ja;
  if (S.einst.ziele.includes("bio") && a.bio !== b.bio) return a.bio;
  return (a.rabatt_prozent ?? 0) > (b.rabatt_prozent ?? 0) || ((a.rabatt_prozent ?? 0) === (b.rabatt_prozent ?? 0) && (a.preis ?? 999) < (b.preis ?? 999));
}
const dealFuer = (key) => (key ? S.index.get(key) : null);

function aktionScore(a) {
  const g = [0.1, 0.6, 1, 1.3][a.gesund] ?? 1;
  let s = (a.rabatt_prozent ?? 10) * g;
  const z = S.einst.ziele;
  if (z.includes("bio") && a.bio) s += 10;
  if ((z.includes("protein") || z.includes("muskel")) && a.tags?.some((t) => PROTEIN.includes(t))) s += 10;
  if (a.tags?.some((t) => grundKeys().has(t))) s += 8;
  if (!istGueltigJetzt(a)) s -= 5;
  return s;
}
let _grundKeys;
function grundKeys() {
  if (!_grundKeys) _grundKeys = new Set([...S.grund.flatMap((g) => g.tags || []), ...S.rezepte.flatMap((r) => r.zutaten.map((z) => z.key).filter(Boolean))]);
  return _grundKeys;
}

function topAktionen(n = 12) {
  return S.aktionen
    .filter((a) => aktionPasst(a, { gesundMin: S.einst.nur_gesund ? 2 : 1 }))
    .sort((a, b) => aktionScore(b) - aktionScore(a))
    .slice(0, n);
}

function grundPasst(g) {
  const v = verboteneKeys();
  if (g.tags?.length && g.tags.every((t) => v.has(t))) return false;
  if (S.einst.ernaehrung === "vegan" && !g.ernaehrung?.includes("vegan")) return false;
  if (S.einst.ernaehrung === "vegetarisch" && !g.ernaehrung?.includes("vegetarisch")) return false;
  const woerter = magNicht();
  if (woerter.some((w) => g.name.toLowerCase().includes(w))) return false;
  return true;
}
function grundDeal(g) {
  let best = null;
  for (const t of g.tags || []) { const d = dealFuer(t); if (d && (!best || besser(d, best))) best = d; }
  return best;
}

const zutatOptional = (z) => /optional|weglassen/i.test(z.name);
function rezeptPasst(r) {
  const e = S.einst;
  const v = verboteneKeys();
  const diaet = e.ernaehrung === "flexitarisch" ? "alles" : e.ernaehrung;
  const keys = r.zutaten.filter((z) => !z.basis && !zutatOptional(z)).map((z) => z.key);
  const explizit = r.ernaehrung?.includes(diaet) && diaet !== "alles";
  const allergieV = new Set(e.allergien.flatMap((a) => ALLERGIE_KEYS[a] || []));
  if (keys.some((k) => allergieV.has(k))) return false;
  if (!explizit && keys.some((k) => v.has(k))) return false;
  const woerter = magNicht();
  if (woerter.some((w) => r.titel.toLowerCase().includes(w) || r.zutaten.some((z) => z.name.toLowerCase().includes(w)))) return false;
  if (e.niveau === "anfaenger" && /anspruchsvoll|schwer/i.test(r.schwierigkeit || "")) return false;
  return true;
}
function rezeptAktionen(r) {
  const gesehen = new Set(), out = [];
  for (const z of r.zutaten) {
    if (z.basis || !z.key || gesehen.has(z.key)) continue;
    const d = dealFuer(z.key);
    if (d) { gesehen.add(z.key); out.push({ zutat: z, deal: d }); }
  }
  return out;
}
function istNeu(r) {
  return r.quelle === "claude" && r.erstellt_am && Date.now() - new Date(r.erstellt_am).getTime() < 14 * 864e5;
}
function rezeptScore(r) {
  const z = S.einst.ziele, tags = r.tags || [];
  let s = rezeptAktionen(r).length * 10;
  if ((z.includes("protein") || z.includes("muskel")) && tags.includes("proteinreich")) s += 8;
  if (z.includes("mealprep") && tags.includes("meal-prep")) s += 8;
  if (z.includes("schnell") && (r.zeit_min ?? 99) <= 20) s += 8;
  if (z.includes("guenstig") && r.kosten_portion) s += Math.max(0, 4 - r.kosten_portion) * 3;
  if (z.includes("saisonal") && tags.includes("saisonal")) s += 6;
  if (z.includes("abnehmen") && (tags.includes("proteinreich") || ["Suppe", "Salat"].includes(r.kategorie))) s += 4;
  if (S.einst.kuechen.some((k) => tags.includes(k))) s += 10;
  if (istNeu(r)) s += 5;
  return s;
}
function maxZeit() {
  return S.einst.ziele.includes("schnell") ? Math.min(20, S.einst.max_zeit || 20) : (S.einst.max_zeit || 999);
}

/* ------------------------------------------------------------------ */
/* Bausteine                                                           */
/* ------------------------------------------------------------------ */

function ladenBadge(laden) {
  if (!laden) return "";
  return `<span class="laden-badge" style="--laden-farbe:${LADEN_FARBEN[laden] || "var(--text-2)"}">${esc(laden)}</span>`;
}
function gueltigText(a) {
  if (a.gueltig_von && a.gueltig_von > heuteISO()) return `ab ${datumKurz(a.gueltig_von)}`;
  if (a.gueltig_bis) return `bis ${datumKurz(a.gueltig_bis)}`;
  return "";
}
function gesundPunkte(g) {
  const txt = ["eher ungesund", "ok", "gesund", "sehr gesund"][g] ?? "";
  return `<span class="gesund-punkte" title="${txt}" aria-label="Gesundheit: ${txt}">${"🟢".repeat(g)}${"⚪".repeat(3 - g)}</span>`;
}
function dealKurz(d) {
  if (!d) return "";
  const preis = d.preis != null ? ` ${chf(d.preis)}` : "";
  const rabatt = d.rabatt_prozent ? ` −${d.rabatt_prozent}%` : "";
  return `<span class="badge rabatt" title="${esc(d.titel)} · ${esc(gueltigText(d))}">🏷️ ${esc(d.laden)}${rabatt}${preis}</span>`;
}
function leer(emoji, titel, text, knopf = "") {
  return `<div class="leer"><div class="gross" aria-hidden="true">${emoji}</div><h3>${esc(titel)}</h3><p>${text}</p>${knopf}</div>`;
}
function standText() {
  const s = S.aktionenStand;
  if (!s) return "Aktionen werden geladen …";
  return `Stand ${zeitpunkt(s.zeit)} · ${S.aktionen.length} Aktionen · Quelle: aktionis.ch`;
}

/* ------------------------------------------------------------------ */
/* Seite: Einkaufsliste                                                */
/* ------------------------------------------------------------------ */

function viewListe() {
  const e = S.einst;
  const offen = S.liste.filter((i) => !i.erledigt);
  const summe = offen.reduce((s, i) => s + (Number(i.preis) || 0), 0);
  const aktById = new Map(S.aktionen.map((a) => [a.id, a]));
  const ersparnis = offen.reduce((s, i) => {
    const a = i.quelle === "Aktion" ? aktById.get(i.aktion_id) : null;
    return s + (a && a.preis_normal && a.preis ? a.preis_normal - a.preis : 0);
  }, 0);
  const budget = Number(e.budget) || 0;
  const anteil = budget ? Math.min(100, (summe / budget) * 100) : 0;

  const nachricht = S.meta.claude_nachricht && S.meta.claude_nachricht !== S.ui.nachrichtGesehen
    ? `<div class="hinweis gruen"><div class="kopfzeile" style="margin-bottom:6px"><strong>✨ Nachricht von Claude</strong><button class="btn text klein" data-aktion="nachricht-weg">Ausblenden</button></div><p>${esc(S.meta.claude_nachricht)}</p></div>` : "";

  const ladenOptionen = ["", ...e.laeden.filter((l) => ALLE_LAEDEN.includes(l))]
    .map((l) => `<option value="${esc(l)}">${l ? esc(l) : "Egal wo"}</option>`).join("");

  return `
    ${nachricht}
    <div class="kopfzeile">
      <h1>Meine Einkaufsliste</h1>
      <div class="zeile">
        <button class="btn klein" data-aktion="liste-teilen" ${S.liste.length ? "" : "disabled"}>📤 Teilen</button>
        <button class="btn klein" data-aktion="erledigte-weg" ${S.liste.some((i) => i.erledigt) ? "" : "disabled"}>🧹 Erledigte löschen</button>
      </div>
    </div>

    <div class="karte">
      <div class="kennzahlen">
        <div class="kennzahl"><div class="wert">${offen.length}</div><div class="label">offene Artikel</div></div>
        <div class="kennzahl"><div class="wert">${chf(summe) || "Fr. 0.00"}</div><div class="label">geschätzt</div></div>
        <div class="kennzahl"><div class="wert" style="color:var(--gruen)">${chf(ersparnis) || "Fr. 0.00"}</div><div class="label">gespart mit Aktionen</div></div>
      </div>
      ${budget ? `<div class="balken ${summe > budget ? "ueber" : ""}" role="progressbar" aria-valuenow="${Math.round(anteil)}" aria-valuemin="0" aria-valuemax="100" aria-label="Wochenbudget"><span style="width:${anteil}%"></span></div>
      <small>${summe > budget ? "⚠️ Über" : "Im"} Wochenbudget von ${chf(budget)} ${summe > budget ? `(+${chf(summe - budget)})` : `(noch ${chf(budget - summe)})`}</small>` : ""}
    </div>

    <form class="karte" data-form="artikel-neu" autocomplete="off">
      <label for="neu-name">Artikel hinzufügen</label>
      <div class="zeile">
        <input id="neu-name" name="name" type="text" placeholder="z.B. Bananen" required style="flex:2;min-width:160px">
        <input name="menge" type="text" placeholder="Menge" style="flex:1;min-width:90px">
        <select name="laden" aria-label="Laden" style="flex:1;min-width:110px">${ladenOptionen}</select>
        <input name="preis" type="number" step="0.05" min="0" placeholder="Fr." aria-label="Preis (optional)" style="flex:0 0 90px">
        <button class="btn primaer" type="submit">＋</button>
      </div>
      <small>Tipp: Für Aldi-Angebote einfach Laden «Aldi» und den Preis aus dem Prospekt eintragen.</small>
    </form>

    <section aria-label="Liste">${listeGruppen()}</section>

    <section class="karte vorschlaege" aria-label="Vorschläge">
      <h2>Vorschläge für dich</h2>
      <p class="klein">${esc(standText())}</p>
      <div class="tabs" role="tablist">
        ${[["fuerdich", "🏷️ Top-Aktionen"], ["basics", "🧺 Grundsortiment"], ["rezepte", "🍲 Rezept-Ideen"]]
          .map(([id, t]) => `<button role="tab" aria-selected="${S.ui.vorschlagTab === id}" class="${S.ui.vorschlagTab === id ? "aktiv" : ""}" data-aktion="vorschlag-tab" data-tab="${id}">${t}</button>`).join("")}
      </div>
      <div id="vorschlag-inhalt">${vorschlagInhalt()}</div>
    </section>`;
}

function listeGruppen() {
  if (!S.liste.length) {
    return `<div class="karte">${leer("🛒", "Deine Liste ist noch leer", "Füge unten Artikel aus den Aktionen, dem Grundsortiment oder aus Rezepten hinzu – oder tippe oben selbst etwas ein.")}</div>`;
  }
  const aktById = new Map(S.aktionen.map((a) => [a.id, a]));
  const gruppen = new Map();
  const nachLaden = S.einst.gruppierung !== "kategorie";
  for (const i of S.liste) {
    const g = nachLaden ? (i.laden || "") : (i.kategorie || "Sonstiges");
    if (!gruppen.has(g)) gruppen.set(g, []);
    gruppen.get(g).push(i);
  }
  const reihenfolge = nachLaden ? [...S.einst.laeden, ...[...gruppen.keys()].filter((g) => g && !S.einst.laeden.includes(g)), ""] : [...gruppen.keys()].sort();
  return reihenfolge.filter((g) => gruppen.has(g)).map((g) => {
    const items = gruppen.get(g).sort((a, b) => Number(a.erledigt) - Number(b.erledigt));
    const titel = nachLaden ? (g ? ladenBadge(g) : "Egal wo / überall") : esc(g);
    const summe = items.filter((i) => !i.erledigt).reduce((s, i) => s + (Number(i.preis) || 0), 0);
    return `<div class="liste-gruppe">
      <h3>${titel} <span class="gedaempft" style="margin-left:auto;font-weight:600;text-transform:none">${summe ? chf(summe) : ""}</span></h3>
      ${items.map((i) => eintragHtml(i, aktById.get(i.aktion_id))).join("")}
    </div>`;
  }).join("");
}

function eintragHtml(i, a) {
  let aktionInfo = "";
  const direkt = i.quelle === "Aktion";
  const tipp = (d) => `<span class="badge rabatt" title="${esc(d.titel)} · ${esc(gueltigText(d))}">💡 ${esc(d.laden)}${d.rabatt_prozent ? " −" + d.rabatt_prozent + "%" : ""}: ${esc(d.titel)}</span>`;
  if (i.aktion_id && a) {
    aktionInfo = direkt ? `<span class="badge rabatt">🏷️ ${a.rabatt_prozent ? "−" + a.rabatt_prozent + "%" : "Aktion"}</span><span>${esc(gueltigText(a))}</span>` : tipp(a);
  } else if (i.aktion_id && direkt && S.aktionen.length) {
    aktionInfo = `<span class="badge gelb">Aktion abgelaufen</span>`;
  } else if (!i.erledigt && !i.aktion_id) {
    const d = dealFuer(keyFuer(i.name));
    if (d) aktionInfo = tipp(d);
  }
  return `<div class="eintrag ${i.erledigt ? "erledigt" : ""}">
    <label class="check"><input type="checkbox" ${i.erledigt ? "checked" : ""} data-aktion="abhaken" data-id="${esc(i.id)}"><span class="sr-only">${esc(i.name)} erledigt</span></label>
    <div class="mitte">
      <div class="name">${esc(i.name)}</div>
      <div class="details">${i.menge ? `<span>${esc(i.menge)}</span>` : ""}${!S.einst.gruppierung || S.einst.gruppierung === "kategorie" ? ladenBadge(i.laden) : ""}${aktionInfo}${i.quelle && i.quelle !== "eigene" ? `<span>· ${esc(i.quelle)}</span>` : ""}</div>
    </div>
    <div class="rechts">${i.preis != null && i.preis !== "" ? esc(chf(i.preis)) : ""}</div>
    <button class="btn rund text" data-aktion="artikel-weg" data-id="${esc(i.id)}" aria-label="${esc(i.name)} entfernen">✕</button>
  </div>`;
}

function aufListe(name) {
  const n = name.trim().toLowerCase();
  return S.liste.some((i) => !i.erledigt && i.name.trim().toLowerCase() === n);
}

function vorschlagInhalt() {
  const tab = S.ui.vorschlagTab;
  if (tab === "fuerdich") {
    const top = topAktionen(12);
    if (!top.length) return leer("🔍", "Keine passenden Aktionen", "Prüfe in den Einstellungen deine Läden und Filter.");
    return top.map((a) => `<div class="vorschlag">
      <div class="mitte">
        <div class="zeile" style="gap:6px">${ladenBadge(a.laden)} ${gesundPunkte(a.gesund)} ${a.bio ? '<span class="badge gruen">Bio</span>' : ""}</div>
        <div class="name">${esc(a.titel)}</div>
        <div class="klein">${a.preis != null ? `<strong style="color:var(--text)">${chf(a.preis)}</strong>` : ""} ${a.preis_normal ? `<span class="preis-alt">${chf(a.preis_normal)}</span>` : ""} ${a.rabatt_prozent ? `<span class="badge rabatt">−${a.rabatt_prozent}%</span>` : ""} ${esc(gueltigText(a))}</div>
      </div>
      <button class="btn klein" data-aktion="aktion-dazu" data-id="${a.id}" ${aufListe(a.titel) ? "disabled" : ""}>${aufListe(a.titel) ? "✓" : "＋"}</button>
    </div>`).join("") + `<p style="margin-top:12px"><a class="btn voll" href="#/aktionen">Alle Aktionen ansehen →</a></p>`;
  }
  if (tab === "basics") {
    const items = S.grund.filter(grundPasst);
    const wichtigeFehlend = items.filter((g) => g.wichtig && !aufListe(g.name));
    return `<p class="klein">Gesunde Basis-Lebensmittel mit Richtpreisen der günstigen Eigenmarken (Stand ${esc(S.grundStand || "")}). Ist etwas davon diese Woche in Aktion, siehst du es direkt.</p>
      <button class="btn primaer voll" data-aktion="basics-alle" ${wichtigeFehlend.length ? "" : "disabled"}>＋ Alle wichtigen Basics hinzufügen (${wichtigeFehlend.length})</button>
      ${items.map((g) => {
        const d = grundDeal(g);
        return `<div class="vorschlag">
          <div class="mitte">
            <div class="name">${esc(g.name)} ${g.wichtig ? "" : '<span class="badge">optional</span>'}</div>
            <div class="klein">${esc(g.menge || "")} · ca. ${chf(g.preis_min)}–${Number(g.preis_max).toFixed(2)} · ${esc(g.laeden || "")}</div>
            ${d ? `<div style="margin-top:4px">${dealKurz(d)} <span class="klein">${esc(d.titel)}${d.einheitspreis ? ` (${esc(d.einheitspreis)})` : ""}</span></div>` : ""}
            ${g.tipp ? `<div class="klein">💡 ${esc(g.tipp)}</div>` : ""}
          </div>
          <div class="spalte" style="gap:6px">
            <button class="btn klein" data-aktion="basic-dazu" data-id="${esc(g.id)}" ${aufListe(g.name) ? "disabled" : ""} title="Mit Richtpreis hinzufügen">${aufListe(g.name) ? "✓" : "＋"}</button>
            ${d ? `<button class="btn klein primaer" data-aktion="aktion-dazu" data-id="${d.id}" ${aufListe(d.titel) ? "disabled" : ""} title="Das Aktionsprodukt hinzufügen">${aufListe(d.titel) ? "✓" : "＋ Aktion"}</button>` : ""}
          </div>
        </div>`;
      }).join("")}`;
  }
  const ideen = S.rezepte.filter(rezeptPasst).filter((r) => (r.zeit_min ?? 0) <= maxZeit())
    .sort((a, b) => rezeptScore(b) - rezeptScore(a)).slice(0, 4);
  return `<p class="klein">Diese Rezepte passen zu dir und nutzen möglichst viele aktuelle Aktionen.</p>` +
    ideen.map((r) => {
      const akt = rezeptAktionen(r);
      return `<div class="vorschlag">
        <div class="mitte">
          <a class="name" href="#/rezept/${encodeURIComponent(r.id)}">${esc(r.titel)}</a>
          <div class="klein">⏱ ${r.zeit_min ?? "?"} Min. · ${r.portionen} Port. ${r.kosten_portion ? `· ca. ${chf(r.kosten_portion)}/Port.` : ""} ${akt.length ? `· <span style="color:var(--rot);font-weight:700">🏷️ ${akt.length} Zutat${akt.length > 1 ? "en" : ""} in Aktion</span>` : ""}</div>
        </div>
        <button class="btn klein" data-aktion="rezept-zutaten" data-id="${esc(r.id)}">＋ Zutaten</button>
      </div>`;
    }).join("");
}

async function artikelHinzufuegen(zeilen, meldung) {
  try {
    const neu = await db.neu("einkaufsliste", zeilen.map((z) => ({ erledigt: false, ...z })));
    S.liste.push(...neu);
    if (meldung !== false) toast(meldung || (neu.length === 1 ? `«${neu[0].name}» hinzugefügt` : `${neu.length} Artikel hinzugefügt`));
    render();
  } catch (e) { fehlerZeigen(e); }
}

function artikelAusAktion(a) {
  return {
    name: a.titel, menge: null, laden: a.laden === "Coop Megastore" ? "Coop" : a.laden,
    kategorie: a.kategorie, preis: a.preis, aktion_id: a.id, quelle: "Aktion",
  };
}
function artikelAusGrund(g) {
  return {
    name: g.name, menge: g.menge, laden: "", kategorie: g.kategorie,
    preis: Math.round(((Number(g.preis_min) + Number(g.preis_max)) / 2) * 20) / 20,
    aktion_id: null, quelle: "Grundsortiment (Richtpreis)",
  };
}

async function rezeptZutatenAufListe(r, faktor = 1, habe = new Set()) {
  const zeilen = [];
  r.zutaten.forEach((z, idx) => {
    if (z.basis || habe.has(idx)) return;
    if (aufListe(z.name)) return;
    const d = dealFuer(z.key);
    const menge = zutatAlsText({ ...z, name: "" }, faktor).trim();
    zeilen.push({
      name: z.name, menge, laden: d ? (d.laden === "Coop Megastore" ? "Coop" : d.laden) : "",
      kategorie: d?.kategorie || null, preis: null, aktion_id: d?.id ?? null, quelle: `Rezept: ${r.titel}`,
    });
  });
  if (!zeilen.length) return toast("Alle Zutaten sind schon auf der Liste");
  await artikelHinzufuegen(zeilen, `${zeilen.length} Zutaten für «${r.titel}» hinzugefügt`);
}

function listeAlsText() {
  const gruppen = new Map();
  for (const i of S.liste.filter((x) => !x.erledigt)) {
    const g = i.laden || "Egal wo";
    if (!gruppen.has(g)) gruppen.set(g, []);
    gruppen.get(g).push(i);
  }
  let t = "🛒 Einkaufsliste\n";
  for (const [g, items] of gruppen) {
    t += `\n${g}:\n`;
    for (const i of items) t += `☐ ${i.name}${i.menge ? ` (${i.menge})` : ""}${i.preis ? ` – ${chf(i.preis)}` : ""}\n`;
  }
  return t;
}

/* ------------------------------------------------------------------ */
/* Seite: Aktionen                                                     */
/* ------------------------------------------------------------------ */

function viewAktionen() {
  const f = S.ui.akt;
  if (f.gesund == null) f.gesund = S.einst.nur_gesund;
  const kategorien = [...new Set(S.aktionen.map((a) => a.kategorie).filter(Boolean))].sort();
  const laeden = S.einst.laeden;
  const ohneAuto = laeden.filter((l) => OHNE_AUTO_AKTIONEN.includes(l));
  return `
    <div class="kopfzeile"><h1>Aktuelle Aktionen</h1><a class="btn klein" href="#/fleisch">🥩 Fleisch lokal</a></div>
    <p class="klein">${esc(standText())}. Wird automatisch 2× täglich aktualisiert.</p>
    ${ohneAuto.length ? `<div class="hinweis">ℹ️ Für <strong>${ohneAuto.map(esc).join(", ")}</strong> gibt es keine automatisch abrufbare Quelle. Die Wochenangebote findest du direkt bei ${ohneAuto.map((l) => `<a href="${LADEN_LINKS[l]}" target="_blank" rel="noopener">${esc(l)} ↗</a>`).join(", ")} – du kannst sie dann auf der Einkaufsliste mit Laden und Preis eintragen.</div>` : ""}
    <div class="karte">
      <div class="chips chips-scroll" role="group" aria-label="Laden">
        ${["alle", ...laeden.filter((l) => !OHNE_AUTO_AKTIONEN.includes(l))].map((l) => `<button class="chip ${f.laden === l ? "an" : ""}" data-aktion="akt-laden" data-wert="${esc(l)}">${l === "alle" ? "Alle Läden" : esc(l)}</button>`).join("")}
      </div>
      <div class="feldgruppe" style="margin-top:12px">
        <div><label for="akt-q">Suche</label><input id="akt-q" type="search" value="${esc(f.q)}" placeholder="z.B. Poulet, Äpfel …" data-eingabe="akt-q"></div>
        <div><label for="akt-kat">Kategorie</label><select id="akt-kat" data-aktion="akt-kat">
          <option value="alle">Alle Kategorien</option>${kategorien.map((k) => `<option ${f.kat === k ? "selected" : ""}>${esc(k)}</option>`).join("")}
        </select></div>
        <div><label for="akt-sort">Sortieren</label><select id="akt-sort" data-aktion="akt-sort">
          ${[["rabatt", "Grösster Rabatt"], ["fuermich", "Passt am besten zu mir"], ["preis", "Günstigster Preis"], ["gesund", "Gesündeste zuerst"]].map(([v, t]) => `<option value="${v}" ${f.sort === v ? "selected" : ""}>${t}</option>`).join("")}
        </select></div>
      </div>
      <label class="check" style="margin-top:12px"><input type="checkbox" ${f.gesund ? "checked" : ""} data-aktion="akt-gesund"> Nur gesunde Aktionen (🟢🟢 und mehr)</label>
    </div>
    <div id="ergebnisse">${aktionenErgebnisse()}</div>`;
}

function aktionenErgebnisse() {
  const f = S.ui.akt;
  const q = f.q.trim().toLowerCase();
  let liste = S.aktionen.filter((a) =>
    aktionPasst(a, { gesundMin: f.gesund ? 2 : 0 }) &&
    (f.laden === "alle" || a.laden === f.laden || (f.laden === "Coop" && a.laden === "Coop Megastore")) &&
    (f.kat === "alle" || a.kategorie === f.kat) &&
    (!q || `${a.titel} ${a.beschreibung ?? ""}`.toLowerCase().includes(q)));
  const sort = {
    rabatt: (a, b) => (b.rabatt_prozent ?? 0) - (a.rabatt_prozent ?? 0),
    preis: (a, b) => (a.preis ?? 999) - (b.preis ?? 999),
    gesund: (a, b) => b.gesund - a.gesund || (b.rabatt_prozent ?? 0) - (a.rabatt_prozent ?? 0),
    fuermich: (a, b) => aktionScore(b) - aktionScore(a),
  }[f.sort];
  liste.sort(sort);
  const gesamt = liste.length;
  liste = liste.slice(0, f.limit);
  if (!gesamt) return leer("🔍", "Keine Aktionen gefunden", S.aktionen.length ? "Ändere die Filter oder die Suche." : "Die Aktionen werden gerade geladen oder sind noch nicht verfügbar.");
  return `<p class="klein">${gesamt} Aktionen</p>
    <div class="raster aktionen-raster">${liste.map(aktionKarte).join("")}</div>
    ${gesamt > f.limit ? `<p style="margin-top:16px"><button class="btn voll" data-aktion="akt-mehr">Mehr anzeigen (${gesamt - f.limit} weitere)</button></p>` : ""}`;
}

function aktionKarte(a) {
  const bild = S.einst.bilder && sichereUrl(a.bild_url)
    ? `<div class="bild"><img src="${esc(sichereUrl(a.bild_url))}" alt="" loading="lazy" referrerpolicy="no-referrer" width="220" height="132"></div>` : "";
  const drauf = aufListe(a.titel);
  return `<article class="karte aktion">
    ${bild}
    <div class="inhalt">
      <div class="zeile" style="justify-content:space-between">${ladenBadge(a.laden)} ${gesundPunkte(a.gesund)}</div>
      <div class="titel">${esc(a.titel)}</div>
      ${a.beschreibung ? `<div class="beschr">${esc(a.beschreibung)}</div>` : ""}
      <div class="zeile" style="gap:8px;align-items:baseline">
        ${a.preis != null ? `<span class="preis">${chf(a.preis)}</span>` : ""}
        ${a.preis_normal ? `<span class="preis-alt">${chf(a.preis_normal)}</span>` : ""}
        ${a.rabatt_prozent ? `<span class="badge rabatt">−${a.rabatt_prozent}%</span>` : ""}
      </div>
      <div class="zeile klein" style="gap:6px">${esc(gueltigText(a))}${a.einheitspreis ? ` · ${esc(a.einheitspreis)}` : ""}${a.bio ? ' <span class="badge gruen">Bio</span>' : ""}</div>
      <div class="fuss">
        <a class="klein" href="${esc(sichereUrl(a.quelle_url))}" target="_blank" rel="noopener">Details ↗</a>
        <button class="btn klein ${drauf ? "" : "primaer"}" data-aktion="aktion-dazu" data-id="${a.id}" ${drauf ? "disabled" : ""}>${drauf ? "✓ Auf der Liste" : "＋ Liste"}</button>
      </div>
    </div>
  </article>`;
}

/* ------------------------------------------------------------------ */
/* Seite: Rezepte (Anfänger)                                           */
/* ------------------------------------------------------------------ */

function viewRezepte() {
  const f = S.ui.rez;
  const kats = ["alle", ...REZEPT_KATEGORIEN.filter((k) => S.rezepte.some((r) => r.kategorie === k))];
  return `
    <div class="kopfzeile"><h1>Rezepte für Anfänger</h1><div class="zeile"><a class="btn klein primaer" href="#/einkauf">📸 Rezept → Einkauf</a><a class="btn klein" href="#/basics">👩‍🍳 Küchen-Basics</a></div></div>
    <p class="gedaempft">Einfach, gesund und günstig – sortiert danach, was zu dir passt und welche Zutaten gerade in Aktion sind.</p>
    <div class="karte">
      <div class="chips chips-scroll" role="group" aria-label="Kategorie">
        ${kats.map((k) => `<button class="chip ${f.kat === k ? "an" : ""}" data-aktion="rez-kat" data-wert="${esc(k)}">${k === "alle" ? "Alle" : esc(k)}</button>`).join("")}
      </div>
      <div class="feldgruppe" style="margin-top:12px">
        <div><label for="rez-q">Suche</label><input id="rez-q" type="search" value="${esc(f.q)}" placeholder="z.B. Poulet, Suppe …" data-eingabe="rez-q"></div>
      </div>
      <label class="check" style="margin-top:12px"><input type="checkbox" ${f.alleZeiten ? "checked" : ""} data-aktion="rez-zeiten"> Auch Rezepte über ${maxZeit()} Minuten zeigen</label>
    </div>
    <div id="ergebnisse">${rezeptErgebnisse()}</div>`;
}

function rezeptErgebnisse() {
  const f = S.ui.rez;
  const q = f.q.trim().toLowerCase();
  const liste = S.rezepte.filter((r) => rezeptPasst(r) &&
    (f.kat === "alle" || r.kategorie === f.kat) &&
    (f.alleZeiten || (r.zeit_min ?? 0) <= maxZeit()) &&
    (!q || `${r.titel} ${r.beschreibung ?? ""} ${r.zutaten.map((z) => z.name).join(" ")}`.toLowerCase().includes(q)))
    .sort((a, b) => rezeptScore(b) - rezeptScore(a));
  if (!liste.length) return leer("🍳", "Keine passenden Rezepte", "Ändere die Filter oder passe deine Einstellungen an. Unter «Wünsche an Claude» kannst du dir auch neue Rezepte wünschen.");
  return `<div class="raster">${liste.map((r) => rezeptKarte(r, `#/rezept/${encodeURIComponent(r.id)}`)).join("")}</div>`;
}

function rezeptKarte(r, href) {
  const akt = rezeptAktionen(r);
  return `<a class="karte rezept-karte" href="${href}">
    <div class="meta">
      <span class="badge">${esc(r.kategorie || "Rezept")}</span>
      ${istNeu(r) ? '<span class="badge blau">✨ Neu von Claude</span>' : ""}
      ${r.favorit ? '<span class="badge gelb">★ Favorit</span>' : ""}
    </div>
    <h3>${esc(r.titel)}</h3>
    ${r.beschreibung ? `<p>${esc(r.beschreibung)}</p>` : ""}
    <div class="meta">
      ${r.zeit_min ? `<span class="badge">⏱ ${r.zeit_min} Min.</span>` : ""}
      ${r.portionen ? `<span class="badge">🍽 ${r.portionen} Port.</span>` : ""}
      ${r.kosten_portion ? `<span class="badge gruen">ca. ${chf(r.kosten_portion)}/Port.</span>` : ""}
      ${r.schwierigkeit ? `<span class="badge">${esc(r.schwierigkeit)}</span>` : ""}
      ${akt.length ? `<span class="badge rabatt">🏷️ ${akt.length} in Aktion</span>` : ""}
    </div>
  </a>`;
}

function findeRezept(id, eigene) {
  return eigene ? S.meine.find((r) => r.id === id) : S.rezepte.find((r) => r.id === id);
}

function viewRezeptDetail(id, eigene) {
  const r = findeRezept(id, eigene);
  if (!r) return leer("🤷", "Rezept nicht gefunden", "Vielleicht wurde es gelöscht.", `<a class="btn" href="#/${eigene ? "meine" : "rezepte"}">Zurück</a>`);
  const basisPortionen = r.portionen || 2;
  const portionen = S.ui.portionen[r.id] ?? basisPortionen;
  const faktor = portionen / basisPortionen;
  const habe = S.ui.habe[r.id] ?? new Set();
  const fertig = S.ui.schritte[r.id] ?? new Set();
  const fehlend = r.zutaten.filter((z, i) => !z.basis && !habe.has(i)).length;
  const zurueck = eigene ? "#/meine" : "#/rezepte";

  return `
    <p><a href="${zurueck}">← ${eigene ? "Meine Rezepte" : "Alle Rezepte"}</a></p>
    <div class="karte rezept-kopf">
      <div class="zeile"><span class="badge">${esc(r.kategorie || "Rezept")}</span>${istNeu(r) ? '<span class="badge blau">✨ Neu von Claude</span>' : ""}</div>
      <h1 style="margin-top:8px">${esc(r.titel)}</h1>
      ${r.beschreibung ? `<p class="gedaempft">${esc(r.beschreibung)}</p>` : ""}
      <div class="meta">
        ${r.zeit_min ? `<span class="badge">⏱ ${r.zeit_min} Min.</span>` : ""}
        ${r.kosten_portion ? `<span class="badge gruen">ca. ${chf(r.kosten_portion)} pro Portion</span>` : ""}
        ${r.schwierigkeit ? `<span class="badge">${esc(r.schwierigkeit)}</span>` : ""}
        ${(r.tags || []).filter((t) => t !== "bio").slice(0, 5).map((t) => `<span class="badge">#${esc(t)}</span>`).join("")}
      </div>
      <div class="zeile">
        ${eigene ? `
          <a class="btn klein" href="#/bearbeiten/${encodeURIComponent(r.id)}">✏️ Bearbeiten</a>
          <button class="btn klein" data-aktion="favorit" data-id="${esc(r.id)}">${r.favorit ? "★ Favorit" : "☆ Favorit"}</button>
          <button class="btn klein gefahr" data-aktion="rezept-loeschen" data-id="${esc(r.id)}">🗑 Löschen</button>` : `
          <button class="btn klein" data-aktion="rezept-kopieren" data-id="${esc(r.id)}">📖 In meine Rezepte kopieren</button>`}
        ${sichereUrl(r.quelle_url) ? `<a class="btn klein" href="${esc(sichereUrl(r.quelle_url))}" target="_blank" rel="noopener">Quelle ↗</a>` : ""}
        <button class="btn klein" data-aktion="kochmodus">🔆 Kochmodus</button>
      </div>
    </div>

    <div class="zwei-spalten">
      <section class="karte">
        <div class="kopfzeile">
          <h2>Zutaten</h2>
          <div class="portionen" aria-label="Portionen">
            <button class="btn rund" data-aktion="portionen" data-id="${esc(r.id)}" data-delta="-1" aria-label="Weniger Portionen">−</button>
            <strong>${portionen}</strong><span class="klein">Port.</span>
            <button class="btn rund" data-aktion="portionen" data-id="${esc(r.id)}" data-delta="1" aria-label="Mehr Portionen">＋</button>
          </div>
        </div>
        <p class="klein">Hake ab, was du schon zu Hause hast.</p>
        ${r.zutaten.map((z, i) => {
          const d = z.basis ? null : dealFuer(z.key);
          return `<div class="zutat ${z.basis ? "basis" : ""}">
            <input type="checkbox" ${habe.has(i) || z.basis ? "checked" : ""} ${z.basis ? "disabled" : ""} data-aktion="habe" data-id="${esc(r.id)}" data-i="${i}" aria-label="${esc(z.name)} habe ich" style="width:20px;height:20px;accent-color:var(--gruen);margin-top:2px">
            <span class="menge">${esc([z.menge != null ? formatMenge(z.menge * faktor) : "", z.einheit].filter(Boolean).join(" "))}</span>
            <span class="name">${esc(z.name)}${d ? `<br>${dealKurz(d)}` : ""}</span>
          </div>`;
        }).join("")}
        <button class="btn primaer voll" style="margin-top:12px" data-aktion="rezept-zutaten" data-id="${esc(r.id)}" data-eigene="${eigene ? 1 : ""}" ${fehlend ? "" : "disabled"}>🛒 ${fehlend} Zutaten auf die Einkaufsliste</button>
      </section>

      <section class="karte">
        <h2>Zubereitung</h2>
        <p class="klein">Tippe auf einen Schritt, wenn er erledigt ist.</p>
        ${(r.schritte || []).map((s, i) => `<div class="schritt ${fertig.has(i) ? "fertig" : ""}">
          <span class="nr">${fertig.has(i) ? "✓" : i + 1}</span>
          <div class="schritt-text" data-aktion="schritt" data-id="${esc(r.id)}" data-i="${i}" role="button" tabindex="0">${esc(s)}</div>
        </div>`).join("")}
        ${r.tipps ? `<div class="tipp" style="margin-top:12px"><strong>💡 Tipp:</strong> ${esc(r.tipps)}</div>` : ""}
        ${r.notizen ? `<div class="tipp" style="margin-top:12px"><strong>📝 Notizen:</strong> ${esc(r.notizen)}</div>` : ""}
      </section>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Seite: Meine Rezepte                                                */
/* ------------------------------------------------------------------ */

function viewMeine() {
  const f = S.ui.meine;
  return `
    <div class="kopfzeile"><h1>Meine Rezepte</h1><div class="zeile"><a class="btn" href="#/einkauf">📸 Rezept → Einkauf</a><a class="btn primaer" href="#/neu">＋ Neues Rezept</a></div></div>
    ${S.user ? "" : `<div class="hinweis">💾 Du bist nicht angemeldet – deine Rezepte werden nur auf diesem Gerät gespeichert. <a href="#/einstellungen">Jetzt anmelden</a>, um sie auf Handy und PC zu synchronisieren.</div>`}
    ${S.meine.length ? `<div class="karte">
      <div class="feldgruppe"><div><label for="meine-q">Suche</label><input id="meine-q" type="search" value="${esc(f.q)}" placeholder="Titel oder Zutat" data-eingabe="meine-q"></div></div>
      <label class="check" style="margin-top:12px"><input type="checkbox" ${f.nurFav ? "checked" : ""} data-aktion="meine-fav"> Nur Favoriten</label>
    </div>` : ""}
    <div id="ergebnisse">${meineErgebnisse()}</div>`;
}
function meineErgebnisse() {
  const f = S.ui.meine;
  if (!S.meine.length) return `<div class="karte">${leer("📖", "Noch keine eigenen Rezepte", "Schreib dein erstes Rezept auf, füge einen Text ein oder importiere es direkt von einer Rezept-Webseite.", '<a class="btn primaer" href="#/neu">＋ Erstes Rezept hinzufügen</a>')}</div>`;
  const q = f.q.trim().toLowerCase();
  const liste = S.meine.filter((r) => (!f.nurFav || r.favorit) &&
    (!q || `${r.titel} ${(r.zutaten || []).map((z) => z.name).join(" ")}`.toLowerCase().includes(q)))
    .sort((a, b) => Number(b.favorit) - Number(a.favorit) || (b.aktualisiert_am || b.erstellt_am || "").localeCompare(a.aktualisiert_am || a.erstellt_am || ""));
  if (!liste.length) return leer("🔍", "Nichts gefunden", "Versuche einen anderen Suchbegriff.");
  return `<div class="raster">${liste.map((r) => rezeptKarte(r, `#/meine/${encodeURIComponent(r.id)}`)).join("")}</div>`;
}

/* ------------------------------------------------------------------ */
/* Seite: Rezept hinzufügen / bearbeiten                               */
/* ------------------------------------------------------------------ */

function leererEntwurf() {
  return { titel: "", beschreibung: "", kategorie: "Hauptgericht", portionen: 2, zeit_min: "", zutatenText: "", schritteText: "", notizen: "", quelle_url: "", bild_url: "", tags: "" };
}
function entwurfAusRezept(r) {
  return {
    titel: r.titel || "", beschreibung: r.beschreibung || "", kategorie: r.kategorie || "Hauptgericht",
    portionen: r.portionen || 2, zeit_min: r.zeit_min || "",
    zutatenText: (r.zutaten || []).map((z) => zutatAlsText(z)).join("\n"),
    schritteText: (r.schritte || []).join("\n"),
    notizen: r.notizen || r.tipps || "", quelle_url: r.quelle_url || "", bild_url: r.bild_url || "",
    tags: (r.tags || []).join(", "),
  };
}

function viewEditor(id) {
  const bearbeiten = id ? S.meine.find((r) => r.id === id) : null;
  if (id && !bearbeiten) return leer("🤷", "Rezept nicht gefunden", "", '<a class="btn" href="#/meine">Zurück</a>');
  const schluessel = id || "neu";
  if (!S.ui.editor || S.ui.editor.schluessel !== schluessel) {
    S.ui.editor = { schluessel, tab: "formular", entwurf: bearbeiten ? entwurfAusRezept(bearbeiten) : leererEntwurf(), text: "", url: "", laeuft: false };
  }
  const ed = S.ui.editor;
  const tabs = bearbeiten ? [["formular", "✍️ Rezept"]] : [["formular", "✍️ Selbst schreiben"], ["text", "📋 Text einfügen"], ["link", "🔗 Von Link"]];
  return `
    <p><a href="${bearbeiten ? `#/meine/${encodeURIComponent(id)}` : "#/meine"}">← Zurück</a></p>
    <h1>${bearbeiten ? "Rezept bearbeiten" : "Neues Rezept"}</h1>
    <div class="tabs" role="tablist">${tabs.map(([t, l]) => `<button role="tab" aria-selected="${ed.tab === t}" class="${ed.tab === t ? "aktiv" : ""}" data-aktion="editor-tab" data-tab="${t}">${l}</button>`).join("")}</div>
    ${ed.tab === "text" ? editorText(ed) : ed.tab === "link" ? editorLink(ed) : editorFormular(ed, bearbeiten)}`;
}

function editorText(ed) {
  return `<div class="karte">
    <p>Kopiere ein Rezept von irgendwo (Webseite, WhatsApp, Notizen, Kochbuch) und füge es hier ein. Titel, Zutaten und Schritte werden automatisch erkannt – du kannst danach alles prüfen und anpassen.</p>
    <div class="feld"><label for="ed-text">Rezepttext</label>
      <textarea id="ed-text" style="min-height:260px" placeholder="Spaghetti Bolognese&#10;&#10;Zutaten:&#10;400 g Spaghetti&#10;300 g Hackfleisch&#10;1 Zwiebel&#10;&#10;Zubereitung:&#10;1. Zwiebel hacken …">${esc(ed.text)}</textarea></div>
    <button class="btn primaer voll" data-aktion="text-erkennen">✨ Rezept erkennen</button>
  </div>`;
}
function editorLink(ed) {
  return `<div class="karte">
    <p>Füge den Link zu einem Rezept ein, zum Beispiel von Betty Bossi, Fooby, Migusto, Swissmilk oder Chefkoch. Die meisten Rezeptseiten werden automatisch erkannt.</p>
    ${S.user ? "" : `<div class="hinweis gelb">Der Import per Link funktioniert nur, wenn du angemeldet bist. <a href="#/einstellungen">Zur Anmeldung</a> – oder kopiere den Rezepttext und nutze «Text einfügen».</div>`}
    <div class="feld"><label for="ed-url">Link zum Rezept</label><input id="ed-url" type="url" value="${esc(ed.url)}" placeholder="https://…"></div>
    <button class="btn primaer voll" data-aktion="link-import" ${S.user && !ed.laeuft ? "" : "disabled"}>${ed.laeuft ? "⏳ Wird geladen …" : "🔗 Rezept importieren"}</button>
  </div>`;
}
function editorFormular(ed, bearbeiten) {
  const e = ed.entwurf;
  return `<form class="karte" data-form="rezept-speichern" autocomplete="off">
    <div class="feld"><label for="f-titel">Titel *</label><input id="f-titel" name="titel" type="text" required value="${esc(e.titel)}" placeholder="z.B. Omas Gemüsesuppe"></div>
    <div class="feldgruppe">
      <div class="feld"><label for="f-kat">Kategorie</label><select id="f-kat" name="kategorie">${REZEPT_KATEGORIEN.map((k) => `<option ${e.kategorie === k ? "selected" : ""}>${k}</option>`).join("")}</select></div>
      <div class="feld"><label for="f-port">Portionen</label><input id="f-port" name="portionen" type="number" min="1" max="50" value="${esc(e.portionen)}"></div>
      <div class="feld"><label for="f-zeit">Zeit (Minuten)</label><input id="f-zeit" name="zeit_min" type="number" min="0" max="1440" value="${esc(e.zeit_min)}"></div>
    </div>
    <div class="feld"><label for="f-beschr">Kurzbeschreibung</label><input id="f-beschr" name="beschreibung" type="text" value="${esc(e.beschreibung)}" placeholder="Worum geht's? (optional)"></div>
    <div class="feld"><label for="f-zut">Zutaten</label>
      <textarea id="f-zut" name="zutatenText" placeholder="Eine Zutat pro Zeile, z.B.&#10;200 g Vollkornpasta&#10;1 Dose gehackte Tomaten&#10;1 Zwiebel">${esc(e.zutatenText)}</textarea>
      <small>Eine Zutat pro Zeile, Menge zuerst. Salz, Öl und Gewürze werden als Vorrat erkannt und nicht auf die Einkaufsliste gesetzt.</small></div>
    <div class="feld"><label for="f-schr">Zubereitung</label>
      <textarea id="f-schr" name="schritteText" style="min-height:180px" placeholder="Ein Schritt pro Zeile">${esc(e.schritteText)}</textarea></div>
    <div class="feld"><label for="f-not">Notizen & Tipps</label><textarea id="f-not" name="notizen" style="min-height:80px">${esc(e.notizen)}</textarea></div>
    <div class="feldgruppe">
      <div class="feld"><label for="f-quelle">Quelle (Link)</label><input id="f-quelle" name="quelle_url" type="url" value="${esc(e.quelle_url)}" placeholder="https://…"></div>
      <div class="feld"><label for="f-tags">Stichworte</label><input id="f-tags" name="tags" type="text" value="${esc(e.tags)}" placeholder="z.B. schnell, asiatisch"></div>
    </div>
    <button class="btn primaer voll" type="submit">💾 ${bearbeiten ? "Änderungen speichern" : "Rezept speichern"}</button>
  </form>`;
}

function leseEditorFormular() {
  const form = $('form[data-form="rezept-speichern"]');
  if (!form || !S.ui.editor) return;
  const fd = new FormData(form);
  for (const [k, v] of fd.entries()) S.ui.editor.entwurf[k] = v;
}

async function rezeptSpeichern() {
  leseEditorFormular();
  const e = S.ui.editor.entwurf;
  if (!e.titel.trim()) return toast("Bitte einen Titel eingeben");
  const zeile = {
    titel: e.titel.trim(),
    beschreibung: e.beschreibung.trim() || null,
    kategorie: e.kategorie,
    portionen: Number(e.portionen) || null,
    zeit_min: Number(e.zeit_min) || null,
    zutaten: zutatenAusText(e.zutatenText),
    schritte: schritteAusText(e.schritteText),
    notizen: e.notizen.trim() || null,
    quelle_url: sichereUrl(e.quelle_url) || null,
    bild_url: sichereUrl(e.bild_url) || null,
    tags: e.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
  };
  try {
    const id = S.ui.editor.schluessel !== "neu" ? S.ui.editor.schluessel : null;
    let gespeichert;
    if (id) {
      gespeichert = await db.aendern("meine_rezepte", id, { ...zeile, aktualisiert_am: new Date().toISOString() });
      S.meine = S.meine.map((r) => (r.id === id ? gespeichert : r));
    } else {
      [gespeichert] = await db.neu("meine_rezepte", { ...zeile, favorit: false });
      S.meine.push(gespeichert);
    }
    S.ui.editor = null;
    toast("Rezept gespeichert");
    location.hash = `#/meine/${encodeURIComponent(gespeichert.id)}`;
  } catch (err) { fehlerZeigen(err, "Speichern fehlgeschlagen"); }
}

function entwurfAusErkannt(r) {
  return {
    ...leererEntwurf(),
    titel: r.titel || "",
    beschreibung: r.beschreibung || "",
    kategorie: REZEPT_KATEGORIEN.includes(r.kategorie) ? r.kategorie : "Hauptgericht",
    portionen: r.portionen || 2,
    zeit_min: r.zeit_min || "",
    zutatenText: (r.zutaten || []).map((z) => (typeof z === "string" ? z : zutatAlsText(z))).join("\n"),
    schritteText: (r.schritte || []).join("\n"),
    notizen: r.notizen || "",
    quelle_url: r.quelle_url || "",
    bild_url: r.bild_url || "",
  };
}

/* ------------------------------------------------------------------ */
/* Seite: Einstellungen                                                */
/* ------------------------------------------------------------------ */

function chipGruppe(name, optionen, gewaehlt, typ = "checkbox") {
  return `<div class="chips">${optionen.map(([wert, label]) => `<label class="chip"><input type="${typ}" name="${name}" value="${esc(wert)}" ${(Array.isArray(gewaehlt) ? gewaehlt.includes(wert) : gewaehlt === wert) ? "checked" : ""}>${esc(label)}</label>`).join("")}</div>`;
}

function viewEinstellungen() {
  const e = S.einst, m = S.meta;
  const offenSeit = m.aktualisiert_am && (!m.claude_sync_am || m.aktualisiert_am > m.claude_sync_am);
  return `
    <h1>Einstellungen</h1>
    <p class="gedaempft">Passe die Seite an deine Interessen an. Die meisten Änderungen wirken sofort. Claude liest deine Einstellungen und Wünsche täglich (ca. ${CLAUDE_SYNC_ZEIT} Uhr) und baut passende Inhalte wie neue Rezepte für dich auf.</p>

    <section class="karte">
      <h2>👤 Konto & Synchronisation</h2>
      ${S.user ? `
        <p>Angemeldet als <strong>${esc(S.user.email)}</strong>. Liste, Rezepte und Einstellungen sind auf allen Geräten synchron.</p>
        <button class="btn" data-aktion="abmelden">Abmelden</button>` : `
        <p>Melde dich mit deiner E-Mail an, damit deine Liste, Rezepte und Einstellungen auf Handy und PC gleich sind. Du bekommst einen Login-Link per E-Mail – kein Passwort nötig.</p>
        <form class="zeile" data-form="login">
          <input type="email" name="email" required placeholder="deine@email.ch" autocomplete="email" style="flex:1;min-width:200px" aria-label="E-Mail-Adresse">
          <button class="btn primaer" type="submit">Login-Link senden</button>
        </form>
        <small>Ohne Anmeldung funktioniert alles auch – die Daten bleiben dann nur in diesem Browser.</small>`}
    </section>

    <form data-form="einstellungen">
      <section class="karte">
        <h2>🏪 Meine Läden</h2>
        <p class="klein">Nur Aktionen aus diesen Läden werden angezeigt.</p>
        ${chipGruppe("laeden", ALLE_LAEDEN.map((l) => [l, l + (OHNE_AUTO_AKTIONEN.includes(l) ? " (manuell)" : "")]), e.laeden)}
      </section>

      <section class="karte">
        <h2>🥗 Ernährung</h2>
        <div class="feld">${chipGruppe("ernaehrung", ERNAEHRUNG, e.ernaehrung, "radio")}</div>
        <div class="feld"><label>Unverträglichkeiten</label>${chipGruppe("allergien", ALLERGIEN, e.allergien)}</div>
        <div class="feld"><label for="e-magnicht">Mag ich nicht</label><input id="e-magnicht" name="mag_nicht" type="text" value="${esc(e.mag_nicht)}" placeholder="z.B. Pilze, Fenchel, Kokos"><small>Mit Komma trennen. Aktionen und Rezepte damit werden ausgeblendet.</small></div>
      </section>

      <section class="karte">
        <h2>🎯 Ziele</h2>
        ${chipGruppe("ziele", ZIELE, e.ziele)}
      </section>

      <section class="karte">
        <h2>📍 Lokal einkaufen (Fleisch)</h2>
        <p class="klein">Claude sucht für deine Region Metzgereien, Hofläden und Bauernhöfe mit gutem, fairem Fleisch – inklusive Preisniveau und Angebot – und prüft sie alle 30 Tage neu. Gespeichert wird nur die Postleitzahl.</p>
        <div class="feldgruppe">
          <div class="feld"><label for="e-plz">Postleitzahl</label><input id="e-plz" name="plz" type="text" inputmode="numeric" pattern="\\d{4}" maxlength="4" value="${esc(e.plz)}" placeholder="z.B. 8004"></div>
          <div class="feld"><label for="e-umkreis">Umkreis (km)</label><input id="e-umkreis" name="umkreis" type="number" min="1" max="100" value="${esc(e.umkreis)}"></div>
        </div>
      </section>

      <section class="karte">
        <h2>🏠 Haushalt & Budget</h2>
        <div class="feldgruppe">
          <div class="feld"><label for="e-pers">Personen im Haushalt</label><input id="e-pers" name="personen" type="number" min="1" max="12" value="${esc(e.personen)}"></div>
          <div class="feld"><label for="e-budget">Wochenbudget (Fr.)</label><input id="e-budget" name="budget" type="number" min="0" step="5" value="${esc(e.budget)}"></div>
        </div>
      </section>

      <section class="karte">
        <h2>👩‍🍳 Kochen</h2>
        <div class="feld"><label>Mein Niveau</label>${chipGruppe("niveau", NIVEAUS, e.niveau, "radio")}</div>
        <div class="feld"><label for="e-zeit">Maximale Kochzeit (Minuten)</label><input id="e-zeit" name="max_zeit" type="number" min="5" max="240" step="5" value="${esc(e.max_zeit)}"></div>
        <div class="feld"><label>Lieblingsküchen</label>${chipGruppe("kuechen", KUECHEN, e.kuechen)}</div>
      </section>

      <section class="karte">
        <h2>🖥️ Anzeige</h2>
        <div class="spalte">
          <label class="check"><input type="checkbox" name="nur_gesund" ${e.nur_gesund ? "checked" : ""}> Bei Aktionen standardmässig nur gesunde zeigen</label>
          <label class="check"><input type="checkbox" name="bilder" ${e.bilder ? "checked" : ""}> Produktbilder anzeigen</label>
        </div>
        <div class="feldgruppe" style="margin-top:12px">
          <div class="feld"><label for="e-design">Design</label><select id="e-design" name="design">${[["auto", "Automatisch"], ["hell", "Hell"], ["dunkel", "Dunkel"]].map(([v, t]) => `<option value="${v}" ${e.design === v ? "selected" : ""}>${t}</option>`).join("")}</select></div>
          <div class="feld"><label for="e-grupp">Einkaufsliste gruppieren nach</label><select id="e-grupp" name="gruppierung">${[["laden", "Laden"], ["kategorie", "Kategorie"]].map(([v, t]) => `<option value="${v}" ${e.gruppierung === v ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        </div>
      </section>

      <section class="karte">
        <h2>✨ Wünsche an Claude</h2>
        <p class="klein">Schreib hier, was Claude an der Seite für dich ändern oder ergänzen soll – z.B. «mehr asiatische Rezepte», «Meal-Prep-Plan für 5 Tage», «Rezepte mit Lachs», «günstige Snacks fürs Büro». Claude prüft täglich um ca. ${CLAUDE_SYNC_ZEIT} Uhr, ob sich etwas geändert hat, und baut die Inhalte danach neu auf.</p>
        <div class="feld"><textarea name="wuensche" placeholder="Meine Wünsche …" aria-label="Wünsche an Claude">${esc(m.wuensche || "")}</textarea></div>
        ${S.user ? `
          <div class="hinweis ${m.sync_angefordert || offenSeit ? "gelb" : "gruen"}">
            ${m.sync_angefordert || offenSeit ? `⏳ Änderungen warten auf Claude (nächste Prüfung ca. ${CLAUDE_SYNC_ZEIT} Uhr).` : "✅ Claude ist auf dem neusten Stand."}
            ${m.claude_sync_am ? `<br><small>Letzte Synchronisation: ${esc(zeitpunkt(m.claude_sync_am))}</small>` : ""}
            ${m.claude_nachricht ? `<p style="margin-top:8px"><strong>Claude:</strong> ${esc(m.claude_nachricht)}</p>` : ""}
          </div>` : `<div class="hinweis gelb">Damit Claude deine Einstellungen und Wünsche lesen kann, musst du angemeldet sein.</div>`}
      </section>

      <div class="karte" style="position:sticky;bottom:calc(var(--nav-h) + env(safe-area-inset-bottom) + 8px);z-index:5">
        <div class="zeile">
          <button class="btn primaer" type="submit" style="flex:1">💾 Speichern</button>
          ${S.user ? `<button class="btn" type="button" data-aktion="speichern-sync" style="flex:1">✨ Speichern & an Claude senden</button>` : ""}
        </div>
      </div>
    </form>

    <section class="karte">
      <h2>🏷️ Aktionen</h2>
      <p>${esc(standText())}</p>
      ${S.aktionenStand?.laeden ? `<p class="klein">${Object.entries(S.aktionenStand.laeden).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${esc(l)}: ${n}`).join(" · ")}</p>` : ""}
      <p class="klein">Die Aktionen werden automatisch jeden Tag um ca. 04:30 und 16:30 Uhr aktualisiert.</p>
      ${S.user ? `<button class="btn" data-aktion="aktionen-jetzt">🔄 Jetzt aktualisieren</button>` : ""}
    </section>

    <section class="karte">
      <h2>💾 Daten</h2>
      <p class="klein">Sicherung deiner Rezepte, Liste und Einstellungen als Datei.</p>
      <div class="zeile">
        <button class="btn" data-aktion="export">⬇️ Exportieren</button>
        <label class="btn" style="margin:0">⬆️ Importieren<input type="file" accept="application/json" data-aktion="import" class="sr-only"></label>
      </div>
    </section>`;
}

function leseEinstellungen(form) {
  const fd = new FormData(form);
  const alle = (n) => fd.getAll(n).map(String);
  S.einst = {
    ...S.einst,
    laeden: alle("laeden"),
    ernaehrung: fd.get("ernaehrung") || "alles",
    allergien: alle("allergien"),
    mag_nicht: String(fd.get("mag_nicht") || ""),
    ziele: alle("ziele"),
    personen: Math.max(1, Number(fd.get("personen")) || 1),
    budget: Math.max(0, Number(fd.get("budget")) || 0),
    niveau: fd.get("niveau") || "anfaenger",
    max_zeit: Number(fd.get("max_zeit")) || 45,
    kuechen: alle("kuechen"),
    nur_gesund: fd.get("nur_gesund") === "on",
    bilder: fd.get("bilder") === "on",
    design: fd.get("design") || "auto",
    gruppierung: fd.get("gruppierung") || "laden",
    plz: String(fd.get("plz") || "").trim().slice(0, 4),
    umkreis: Math.max(1, Number(fd.get("umkreis")) || 15),
  };
  S.meta.wuensche = String(fd.get("wuensche") || "");
  S.ui.akt.gesund = null;
  _grundKeys = null;
}

/* ------------------------------------------------------------------ */
/* Seite: Küchen-Basics                                                */
/* ------------------------------------------------------------------ */

function viewBasics() {
  const k = (titel, inhalt, offen = false) => `<details class="klappe" ${offen ? "open" : ""}><summary>${titel}</summary><div class="klappe-inhalt">${inhalt}</div></details>`;
  return `
    <p><a href="#/rezepte">← Rezepte</a></p>
    <h1>Küchen-Basics für Anfänger</h1>
    <p class="gedaempft">Das Wichtigste, um gesund, günstig und ohne Stress zu kochen.</p>
    <div class="basics">
    ${k("🍳 Grundausstattung – mehr brauchst du nicht", `<ul>
      <li>1 beschichtete Bratpfanne (ca. 28 cm) und 1 grosser Topf mit Deckel</li>
      <li>1 scharfes Kochmesser und 1 grosses Schneidebrett</li>
      <li>Sparschäler, Bircher-Raffel, Sieb, Holzkochlöffel, Bratenwender</li>
      <li>Backblech mit Backpapier, ein paar Vorratsdosen fürs Meal Prep</li>
      <li>Optional, aber super: Stabmixer für Suppen</li></ul>`, true)}
    ${k("🍚 Reis kochen (Quellmethode)", `<ul>
      <li>1 Teil Reis + 2 Teile Wasser + 1 Prise Salz in einen Topf (z.B. 100 g Reis + 200 ml Wasser pro Person).</li>
      <li>Aufkochen, Deckel drauf, auf kleinste Stufe stellen.</li>
      <li>15 Minuten quellen lassen (Vollkornreis: ca. 30 Minuten) – nicht umrühren, Deckel zu lassen.</li>
      <li>Mit einer Gabel auflockern. Fertig.</li></ul>`)}
    ${k("🍝 Pasta kochen", `<ul>
      <li>Viel Wasser (ca. 1 Liter pro 100 g) aufkochen, dann 1 TL Salz pro Liter dazugeben.</li>
      <li>Pasta hinein, einmal umrühren, ohne Deckel kochen. Zeit steht auf der Packung.</li>
      <li>1 Minute vor Ende probieren: weich, aber noch leicht bissfest = «al dente».</li>
      <li>Abgiessen. Tipp: eine Tasse Kochwasser aufheben – macht Saucen cremig.</li></ul>`)}
    ${k("🔪 Zwiebel schneiden", `<ul>
      <li>Zwiebel halbieren (durch die Wurzel), Schale abziehen.</li>
      <li>Flache Seite aufs Brett, mehrmals längs einschneiden (Wurzel ganz lassen, sie hält alles zusammen).</li>
      <li>Dann quer in feine Würfel schneiden. Finger dabei krümmen («Krallengriff») – so schneidest du dich nicht.</li></ul>`)}
    ${k("🔥 Herd-Stufen verstehen", `<ul>
      <li><strong>Hoch (7–9):</strong> Wasser aufkochen, Fleisch scharf anbraten.</li>
      <li><strong>Mittel (5–6):</strong> Zwiebeln dünsten, Gemüse braten, Rührei, Omelette.</li>
      <li><strong>Niedrig (2–3):</strong> Köcheln lassen, Reis quellen lassen, Saucen warm halten.</li>
      <li>Öl ist heiss genug, wenn ein Holzlöffel darin kleine Bläschen bildet.</li></ul>`)}
    ${k("🧼 Hygiene – besonders bei Poulet", `<ul>
      <li>Rohes Poulet und Hackfleisch nie auf demselben Brett wie Salat oder Gemüse schneiden, ohne es heiss zu waschen.</li>
      <li>Hände nach dem Anfassen von rohem Fleisch mit Seife waschen.</li>
      <li>Poulet und Hackfleisch immer ganz durchgaren (innen nicht mehr rosa).</li>
      <li>Reste innerhalb von 2 Stunden in den Kühlschrank und innerhalb von 2–3 Tagen essen.</li>
      <li>Tiefgekühltes im Kühlschrank auftauen, nicht bei Zimmertemperatur.</li></ul>`)}
    ${k("📦 Meal Prep in 90 Minuten (Sonntag)", `<ul>
      <li>Ofen an: Blech mit Ofengemüse und Poulet (45 Min.).</li>
      <li>Parallel: grosser Topf Linsen-Bolognese oder Chili (35–45 Min.).</li>
      <li>Parallel: Reis oder Pasta für 3 Tage kochen.</li>
      <li>3 Gläser Overnight Oats fürs Frühstück vorbereiten (5 Min.).</li>
      <li>Alles in Dosen abfüllen – 3 Tage Kühlschrank, der Rest in den Tiefkühler.</li></ul>`)}
    ${k("💰 Spartipps für die Schweiz", `<ul>
      <li>Eigenmarken wählen: M-Budget (Migros), Prix Garantie (Coop) und die Marken von Aldi, Lidl und Denner sind oft 30–60 % günstiger.</li>
      <li>Aktionen planen: Erst die Aktionen anschauen, dann die Rezepte wählen – nicht umgekehrt.</li>
      <li>Tiefkühl-Gemüse und -Fisch sind günstig, gesund und es gibt keinen Abfall.</li>
      <li>Saisonal einkaufen: im Winter Kohl, Lauch, Karotten, Kürbis, Äpfel – im Sommer Tomaten, Zucchetti, Beeren.</li>
      <li>Fleisch in der Aktion kaufen und portionsweise einfrieren.</li>
      <li>Abends gibt es in vielen Filialen Produkte kurz vor Ablauf mit 25–50 % Rabatt – oder über Apps wie «Too Good To Go».</li>
      <li>Nie hungrig einkaufen und immer mit Liste.</li></ul>`)}
    ${k("🥦 Gesunder Teller – so einfach geht's", `<ul>
      <li><strong>½ Teller Gemüse</strong> (frisch oder tiefgekühlt)</li>
      <li><strong>¼ Teller Eiweiss</strong>: Poulet, Fisch, Eier, Quark, Linsen, Bohnen, Tofu</li>
      <li><strong>¼ Teller Stärke</strong>: Vollkornreis, Vollkornpasta, Kartoffeln, Vollkornbrot</li>
      <li>Dazu etwas gesundes Fett (Rapsöl, Olivenöl, Nüsse) und Wasser oder ungesüssten Tee.</li></ul>`)}
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Seite: Rezept → Einkauf (Foto, Text oder Link)                      */
/* ------------------------------------------------------------------ */

const FLEISCH_KEYS = ["poulet", "hackfleisch", "rind", "schwein", "lamm", "kalb", "wurst"];

// Passende Produkte für eine Zutat: Aktionen (live), Grundsortiment (Richtpreis), lokale Läden (Fleisch)
function produkteFuer(z) {
  const woerter = z.name.toLowerCase().replace(/\(.*?\)/g, "").split(/[^a-zäöüéèà]+/).filter((w) => w.length >= 4);
  const passend = S.aktionen.filter((a) => aktionPasst(a, { gesundMin: 1 }) && !KEINE_ZUTAT.test(a.titel) &&
    ((z.key && a.tags?.includes(z.key)) || (!z.key && woerter.some((w) => a.titel.toLowerCase().includes(w)))));
  passend.sort((a, b) => Number(istGueltigJetzt(b)) - Number(istGueltigJetzt(a)) || b.gesund - a.gesund || (b.rabatt_prozent ?? 0) - (a.rabatt_prozent ?? 0));
  const grund = S.grund.find((g) => z.key && g.tags?.includes(z.key));
  const lokal = FLEISCH_KEYS.includes(z.key) ? S.lokaleLaeden.slice(0, 3) : [];
  return { aktionen: passend.slice(0, 3), grund, lokal };
}

function viewPlan() {
  const p = S.ui.plan ?? (S.ui.plan = { tab: "foto", text: "", url: "", status: "", rezept: null, wahl: {} });
  const eingabe = p.tab === "foto" ? `
      <p>Fotografiere ein Rezept (Kochbuch, Zeitschrift, Bildschirm) oder wähle ein Bild aus. Der Text wird <strong>kostenlos direkt auf deinem Gerät</strong> erkannt – nichts wird hochgeladen.</p>
      <label class="btn primaer voll">📷 Foto aufnehmen oder auswählen<input type="file" accept="image/*" data-aktion="plan-foto" class="sr-only"></label>
      <small>Funktioniert am besten mit gedrucktem Text, gerade fotografiert und gut beleuchtet. Handschrift wird oft nicht erkannt.</small>`
    : p.tab === "text" ? `
      <div class="feld"><label for="plan-text">Rezepttext</label><textarea id="plan-text" style="min-height:200px" placeholder="Rezept hier einfügen …">${esc(p.text)}</textarea></div>
      <button class="btn primaer voll" data-aktion="plan-text">✨ Zusammenstellen</button>`
    : `
      ${S.user ? "" : `<div class="hinweis gelb">Der Import per Link braucht ein Login. <a href="#/einstellungen">Anmelden</a></div>`}
      <div class="feld"><label for="plan-url">Link zum Rezept</label><input id="plan-url" type="url" value="${esc(p.url)}" placeholder="https://…"></div>
      <button class="btn primaer voll" data-aktion="plan-link" ${S.user ? "" : "disabled"}>🔗 Zusammenstellen</button>`;
  return `
    <p><a href="#/rezepte">← Rezepte</a></p>
    <h1>Rezept → Einkauf</h1>
    <p class="gedaempft">Schick ein Rezept als Foto, Text oder Link. Ich erkenne die Zutaten und suche dir die passenden Produkte – mit aktuellen Aktionen, Richtpreisen und lokalen Metzgereien.</p>
    <div class="tabs" role="tablist">${[["foto", "📸 Foto"], ["text", "📋 Text"], ["link", "🔗 Link"]].map(([t, l]) => `<button role="tab" aria-selected="${p.tab === t}" class="${p.tab === t ? "aktiv" : ""}" data-aktion="plan-tab" data-tab="${t}">${l}</button>`).join("")}</div>
    <div class="karte">${eingabe}${p.status ? `<p class="hinweis" style="margin-top:12px">${esc(p.status)}</p>` : ""}</div>
    ${p.rezept ? planErgebnis(p) : ""}`;
}

function planErgebnis(p) {
  const r = p.rezept;
  const zeilen = r.zutaten.map((z, i) => {
    if (z.basis) return `<div class="zutat basis"><span class="menge">${esc([z.menge != null ? formatMenge(z.menge) : "", z.einheit].filter(Boolean).join(" "))}</span><span class="name">${esc(z.name)}</span></div>`;
    const pr = produkteFuer(z);
    const wahl = p.wahl[i] ?? (pr.aktionen[0] ? "a:" + pr.aktionen[0].id : "g");
    const opt = [
      ...pr.aktionen.map((a) => `<label class="check" style="font-weight:400"><input type="radio" name="w${i}" value="a:${a.id}" ${wahl === "a:" + a.id ? "checked" : ""} data-aktion="plan-wahl" data-i="${i}">
        <span>${ladenBadge(a.laden)} ${esc(a.titel)} – <strong>${chf(a.preis)}</strong> ${a.rabatt_prozent ? `<span class="badge rabatt">−${a.rabatt_prozent}%</span>` : ""} <span class="klein">${esc(gueltigText(a))}</span></span></label>`),
      `<label class="check" style="font-weight:400"><input type="radio" name="w${i}" value="g" ${wahl === "g" ? "checked" : ""} data-aktion="plan-wahl" data-i="${i}">
        <span>${pr.grund ? `Günstige Eigenmarke: ${esc(pr.grund.name)} · ca. ${chf(pr.grund.preis_min)}–${Number(pr.grund.preis_max).toFixed(2)} (${esc(pr.grund.laeden || "")})` : "Ohne bestimmtes Produkt"}</span></label>`,
      ...pr.lokal.map((l) => `<label class="check" style="font-weight:400"><input type="radio" name="w${i}" value="l:${l.id}" ${wahl === "l:" + l.id ? "checked" : ""} data-aktion="plan-wahl" data-i="${i}">
        <span>🥩 <strong>${esc(l.name)}</strong> (${esc(l.typ)}${l.distanz_km != null ? `, ${l.distanz_km} km` : ""}) ${l.preisniveau ? `· ${esc(l.preisniveau)}` : ""}</span></label>`),
      `<label class="check" style="font-weight:400"><input type="radio" name="w${i}" value="habe" ${wahl === "habe" ? "checked" : ""} data-aktion="plan-wahl" data-i="${i}"><span>Habe ich schon</span></label>`,
    ].join("");
    const fleischHinweis = FLEISCH_KEYS.includes(z.key) && !pr.lokal.length
      ? `<small>🥩 Tipp: ${/^\d{4}$/.test(S.einst.plz || "") ? "Lokale Metzgereien werden für deine Region gerade gesucht (beim nächsten täglichen Lauf)." : `<a href="#/einstellungen">PLZ eintragen</a>, damit ich dir lokale Metzgereien suche.`}</small>` : "";
    return `<div class="zutat" style="flex-direction:column;gap:6px">
      <div><strong>${esc([z.menge != null ? formatMenge(z.menge) : "", z.einheit].filter(Boolean).join(" "))}</strong> ${esc(z.name)}</div>
      <div class="spalte" style="gap:4px;padding-left:4px">${opt}</div>${fleischHinweis}</div>`;
  }).join("");
  return `<section class="karte">
    <h2>${esc(r.titel)}</h2>
    <p class="klein">${r.zutaten.length} Zutaten erkannt${r.portionen ? ` · ${r.portionen} Portionen` : ""}. Wähle pro Zutat das Produkt – die beste Aktion ist vorausgewählt.</p>
    ${zeilen}
    <div class="zeile" style="margin-top:12px">
      <button class="btn primaer" style="flex:1" data-aktion="plan-liste">🛒 Auf die Einkaufsliste</button>
      <button class="btn" style="flex:1" data-aktion="plan-speichern">📖 Als Rezept speichern</button>
    </div>
  </section>`;
}

function planSetzen(r) {
  const zutaten = (r.zutaten || []).map((z) => (typeof z === "string" ? parseZutatSicher(z) : z)).filter(Boolean);
  S.ui.plan.rezept = { ...r, zutaten, schritte: r.schritte || [] };
  S.ui.plan.wahl = {};
  S.ui.plan.status = zutaten.length ? "" : "Ich habe keine Zutaten erkannt. Versuche ein schärferes Foto oder füge den Text ein.";
}
function parseZutatSicher(s) { return zutatenAusText(s)[0] || null; }

let tesseractLaden;
async function texterkennung(datei) {
  if (!window.Tesseract) {
    tesseractLaden ??= new Promise((ok, fehler) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
      s.onload = ok; s.onerror = () => fehler(new Error("Texterkennung konnte nicht geladen werden"));
      document.head.appendChild(s);
    });
    await tesseractLaden;
  }
  const { data } = await window.Tesseract.recognize(datei, "deu", {
    logger: (m) => { if (m.status === "recognizing text") { S.ui.plan.status = `Text wird erkannt … ${Math.round(m.progress * 100)}%`; const h = $(".karte .hinweis"); if (h) h.textContent = S.ui.plan.status; } },
  });
  return data.text;
}

async function planAufListe() {
  const p = S.ui.plan, r = p.rezept, zeilen = [];
  r.zutaten.forEach((z, i) => {
    if (z.basis) return;
    const pr = produkteFuer(z);
    const wahl = p.wahl[i] ?? (pr.aktionen[0] ? "a:" + pr.aktionen[0].id : "g");
    if (wahl === "habe" || aufListe(z.name)) return;
    const menge = [z.menge != null ? formatMenge(z.menge) : "", z.einheit].filter(Boolean).join(" ") || null;
    const quelle = `Rezept: ${r.titel}`;
    if (wahl.startsWith("a:")) {
      const a = S.aktionen.find((x) => "a:" + x.id === wahl);
      if (a) return zeilen.push({ ...artikelAusAktion(a), name: `${z.name} – ${a.titel}`, menge, quelle: "Aktion" });
    }
    if (wahl.startsWith("l:")) {
      const l = S.lokaleLaeden.find((x) => "l:" + x.id === wahl);
      if (l) return zeilen.push({ name: z.name, menge, laden: l.name, kategorie: "Fleisch", preis: null, aktion_id: null, quelle });
    }
    zeilen.push({ name: z.name, menge, laden: "", kategorie: pr.grund?.kategorie || null, preis: null, aktion_id: null, quelle });
  });
  if (!zeilen.length) return toast("Nichts hinzuzufügen");
  await artikelHinzufuegen(zeilen, `${zeilen.length} Produkte für «${r.titel}» hinzugefügt`);
}

/* ------------------------------------------------------------------ */
/* Seite: Fleisch lokal                                                */
/* ------------------------------------------------------------------ */

function viewFleisch() {
  const fleischAktionen = S.aktionen.filter((a) => a.kategorie === "Fleisch" && aktionPasst(a, { gesundMin: 2 }))
    .sort((a, b) => (b.rabatt_prozent ?? 0) - (a.rabatt_prozent ?? 0)).slice(0, 12);
  const plzOk = /^\d{4}$/.test(S.einst.plz || "");
  const lokal = !S.user ? `<div class="hinweis gelb"><a href="#/einstellungen">Melde dich an</a> und trage deine PLZ ein, damit ich dir lokale Metzgereien und Hofläden suche.</div>`
    : !plzOk ? `<div class="hinweis gelb"><a href="#/einstellungen">Trage in den Einstellungen deine PLZ ein</a> – dann suche ich beim nächsten täglichen Lauf Metzgereien und Hofläden in deiner Nähe.</div>`
    : !S.lokaleLaeden.length ? `<div class="hinweis">🔎 Für ${esc(S.einst.plz)} (Umkreis ${esc(S.einst.umkreis)} km) suche ich beim nächsten täglichen Lauf (ca. ${CLAUDE_SYNC_ZEIT} Uhr) nach Metzgereien und Hofläden.</div>`
    : S.lokaleLaeden.map((l) => `<article class="karte" style="margin-bottom:10px">
        <div class="kopfzeile" style="margin-bottom:4px"><h3 style="margin:0">${esc(l.name)}</h3><span class="badge">${esc(l.typ)}${l.distanz_km != null ? ` · ${l.distanz_km} km` : ""}</span></div>
        <p class="klein">${esc([l.adresse, [l.plz, l.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "))}</p>
        ${l.angebot ? `<p>${esc(l.angebot)}</p>` : ""}
        <div class="zeile">${l.preisniveau ? `<span class="badge gruen">💰 ${esc(l.preisniveau)}</span>` : ""}${l.oeffnungszeiten ? `<span class="badge">🕒 ${esc(l.oeffnungszeiten)}</span>` : ""}</div>
        ${l.hinweise ? `<p class="klein" style="margin-top:6px">💡 ${esc(l.hinweise)}</p>` : ""}
        <div class="zeile" style="margin-top:8px">${sichereUrl(l.website) ? `<a class="btn klein" href="${esc(sichereUrl(l.website))}" target="_blank" rel="noopener">Website ↗</a>` : ""}${l.telefon ? `<a class="btn klein" href="tel:${esc(l.telefon.replace(/\s/g, ""))}">📞 ${esc(l.telefon)}</a>` : ""}</div>
        <p class="klein" style="margin-top:6px">Geprüft am ${esc(datumKurz(l.geprueft_am))}</p>
      </article>`).join("");
  return `
    <p><a href="#/aktionen">← Aktionen</a></p>
    <h1>🥩 Gutes Fleisch – günstig & lokal</h1>
    <p class="gedaempft">Lokale Metzgereien und Hofläden in deiner Nähe, dazu die besten Fleisch-Aktionen der Grossverteiler.</p>
    <h2>In deiner Nähe</h2>
    ${lokal}
    <div class="hinweis gruen"><strong>Spartipps für gutes Fleisch:</strong> Bei Metzgereien nach günstigeren Stücken fragen (Schulter, Hals, Siedfleisch, Hackfleisch, ganze Poulets) · Grössere Mengen kaufen und portionsweise einfrieren · Viele Hofläden verkaufen «Mischpakete» (5–10 kg) deutlich günstiger · Auf Labels achten: IP-SUISSE, Bio Suisse, Natura-Beef.</div>
    <h2>Fleisch-Aktionen diese Woche</h2>
    <div class="raster aktionen-raster">${fleischAktionen.map(aktionKarte).join("") || "<p>Keine passenden Aktionen.</p>"}</div>`;
}

/* ------------------------------------------------------------------ */
/* Router & Rendering                                                  */
/* ------------------------------------------------------------------ */

function route() {
  const h = location.hash.replace(/^#\/?/, "");
  if (!h || h.startsWith("access_token") || h.startsWith("error")) return ["liste"];
  const [seite, ...rest] = h.split("/");
  return [seite, rest.map(decodeURIComponent).join("/")];
}

function render() {
  const [seite, param] = route();
  const navSeite = { rezept: "rezepte", basics: "rezepte", neu: "meine", bearbeiten: "meine", einkauf: "rezepte", fleisch: "aktionen" }[seite] || seite;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    a.classList.toggle("aktiv", a.dataset.nav === navSeite);
    if (a.dataset.nav === navSeite) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  if (!S.geladen) { app.innerHTML = '<div class="laden-hinweis">Lädt …</div>'; return; }
  const views = {
    liste: () => viewListe(),
    aktionen: () => viewAktionen(),
    rezepte: () => viewRezepte(),
    rezept: () => viewRezeptDetail(param, false),
    meine: () => (param ? viewRezeptDetail(param, true) : viewMeine()),
    neu: () => viewEditor(null),
    bearbeiten: () => viewEditor(param),
    einstellungen: () => viewEinstellungen(),
    basics: () => viewBasics(),
    einkauf: () => viewPlan(),
    fleisch: () => viewFleisch(),
  };
  const offline = navigator.onLine ? "" : `<div class="hinweis gelb">📴 Offline – du siehst den letzten Stand. Änderungen an der Liste werden gespeichert und synchronisiert, sobald du wieder Internet hast.</div>`;
  app.innerHTML = offline + (views[seite] || views.liste)();
  const titel = { liste: "Einkaufsliste", aktionen: "Aktionen", rezepte: "Rezepte", rezept: "Rezept", meine: "Meine Rezepte", neu: "Neues Rezept", bearbeiten: "Rezept bearbeiten", einstellungen: "Einstellungen", basics: "Küchen-Basics", einkauf: "Rezept → Einkauf", fleisch: "Fleisch lokal" }[seite] || "Einkaufsliste";
  document.title = `${titel} · Einkaufsliste`;
}

let letzteSeite = "";
window.addEventListener("hashchange", () => {
  const [seite, param] = route();
  const key = seite + "/" + (param || "");
  if (key !== letzteSeite) { letzteSeite = key; render(); window.scrollTo(0, 0); }
});

/* ------------------------------------------------------------------ */
/* Ereignisse                                                          */
/* ------------------------------------------------------------------ */

const sucheAktualisieren = entprellt((feld, wert) => {
  if (feld === "akt-q") { S.ui.akt.q = wert; S.ui.akt.limit = 60; $("#ergebnisse").innerHTML = aktionenErgebnisse(); }
  if (feld === "rez-q") { S.ui.rez.q = wert; $("#ergebnisse").innerHTML = rezeptErgebnisse(); }
  if (feld === "meine-q") { S.ui.meine.q = wert; $("#ergebnisse").innerHTML = meineErgebnisse(); }
}, 150);

document.addEventListener("input", (ev) => {
  const feld = ev.target.dataset?.eingabe;
  if (feld) sucheAktualisieren(feld, ev.target.value);
});

document.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-aktion]");
  if (!el || el.matches("input, select")) return;
  const { aktion, id } = el.dataset;
  switch (aktion) {
    case "vorschlag-tab": S.ui.vorschlagTab = el.dataset.tab; render(); break;
    case "nachricht-weg": S.ui.nachrichtGesehen = S.meta.claude_nachricht; lokal.set("nachricht_gesehen", S.meta.claude_nachricht); render(); break;
    case "artikel-weg": {
      try { await db.loeschen("einkaufsliste", id); S.liste = S.liste.filter((i) => i.id !== id); render(); } catch (e) { fehlerZeigen(e); }
      break;
    }
    case "erledigte-weg": {
      const ids = S.liste.filter((i) => i.erledigt).map((i) => i.id);
      try { await db.loeschen("einkaufsliste", ids); S.liste = S.liste.filter((i) => !i.erledigt); toast(`${ids.length} erledigte Artikel gelöscht`); render(); } catch (e) { fehlerZeigen(e); }
      break;
    }
    case "liste-teilen": {
      const text = listeAlsText();
      if (navigator.share) { try { await navigator.share({ title: "Einkaufsliste", text }); } catch { /* abgebrochen */ } }
      else { try { await navigator.clipboard.writeText(text); toast("Liste in die Zwischenablage kopiert"); } catch { toast("Kopieren nicht möglich"); } }
      break;
    }
    case "aktion-dazu": {
      const a = S.aktionen.find((x) => String(x.id) === id);
      if (a) await artikelHinzufuegen([artikelAusAktion(a)]);
      break;
    }
    case "basic-dazu": {
      const g = S.grund.find((x) => x.id === id);
      if (g) await artikelHinzufuegen([artikelAusGrund(g)]);
      break;
    }
    case "basics-alle": {
      const items = S.grund.filter(grundPasst).filter((g) => g.wichtig && !aufListe(g.name));
      await artikelHinzufuegen(items.map(artikelAusGrund));
      break;
    }
    case "rezept-zutaten": {
      const eigene = !!el.dataset.eigene;
      const r = findeRezept(id, eigene);
      if (!r) break;
      const faktor = (S.ui.portionen[r.id] ?? r.portionen ?? 2) / (r.portionen || 2);
      await rezeptZutatenAufListe(r, faktor, S.ui.habe[r.id] ?? new Set());
      break;
    }
    case "akt-laden": S.ui.akt.laden = el.dataset.wert; S.ui.akt.limit = 60; render(); break;
    case "akt-mehr": S.ui.akt.limit += 60; $("#ergebnisse").innerHTML = aktionenErgebnisse(); break;
    case "rez-kat": S.ui.rez.kat = el.dataset.wert; render(); break;
    case "portionen": {
      const r = findeRezept(id, route()[0] === "meine");
      const jetzt = S.ui.portionen[id] ?? r?.portionen ?? 2;
      S.ui.portionen[id] = Math.max(1, Math.min(24, jetzt + Number(el.dataset.delta)));
      render();
      break;
    }
    case "schritt": {
      const set = S.ui.schritte[id] ?? new Set();
      const i = Number(el.dataset.i);
      set.has(i) ? set.delete(i) : set.add(i);
      S.ui.schritte[id] = set;
      render();
      break;
    }
    case "kochmodus": {
      try { await navigator.wakeLock?.request("screen"); toast("Kochmodus an – der Bildschirm bleibt hell"); }
      catch { toast("Kochmodus wird von diesem Browser nicht unterstützt"); }
      break;
    }
    case "rezept-kopieren": {
      const r = findeRezept(id, false);
      if (!r) break;
      try {
        const [neu] = await db.neu("meine_rezepte", {
          titel: r.titel, beschreibung: r.beschreibung, kategorie: r.kategorie, portionen: r.portionen,
          zeit_min: r.zeit_min, zutaten: r.zutaten, schritte: r.schritte, notizen: r.tipps || null,
          tags: r.tags || [], favorit: false,
        });
        S.meine.push(neu);
        toast("In «Meine Rezepte» kopiert – du kannst es jetzt anpassen");
        location.hash = `#/meine/${encodeURIComponent(neu.id)}`;
      } catch (e) { fehlerZeigen(e); }
      break;
    }
    case "favorit": {
      const r = S.meine.find((x) => x.id === id);
      if (!r) break;
      try { const neu = await db.aendern("meine_rezepte", id, { favorit: !r.favorit }); S.meine = S.meine.map((x) => (x.id === id ? neu : x)); render(); } catch (e) { fehlerZeigen(e); }
      break;
    }
    case "rezept-loeschen": {
      const r = S.meine.find((x) => x.id === id);
      if (!r || !confirm(`«${r.titel}» wirklich löschen?`)) break;
      try { await db.loeschen("meine_rezepte", id); S.meine = S.meine.filter((x) => x.id !== id); toast("Rezept gelöscht"); location.hash = "#/meine"; } catch (e) { fehlerZeigen(e); }
      break;
    }
    case "editor-tab": leseEditorFormular(); S.ui.editor.text = $("#ed-text")?.value ?? S.ui.editor.text; S.ui.editor.url = $("#ed-url")?.value ?? S.ui.editor.url; S.ui.editor.tab = el.dataset.tab; render(); break;
    case "text-erkennen": {
      const text = $("#ed-text").value;
      if (!text.trim()) return toast("Bitte zuerst einen Rezepttext einfügen");
      S.ui.editor.text = text;
      const r = parseRezeptText(text);
      S.ui.editor.entwurf = entwurfAusErkannt(r);
      S.ui.editor.tab = "formular";
      render();
      toast(`Erkannt: ${r.zutaten.length} Zutaten, ${r.schritte.length} Schritte – bitte kurz prüfen`);
      break;
    }
    case "link-import": {
      const url = sichereUrl($("#ed-url").value.trim());
      if (!url) return toast("Bitte einen gültigen Link eingeben");
      S.ui.editor.url = url; S.ui.editor.laeuft = true; render();
      try {
        const { data, error } = await sb.functions.invoke("rezept-import", { body: { url } });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.fehler || "Kein Rezept gefunden");
        const r = data.rezept;
        S.ui.editor.entwurf = entwurfAusErkannt({ ...r, quelle_url: url });
        S.ui.editor.tab = "formular";
        toast("Rezept importiert – bitte kurz prüfen und speichern");
      } catch (e) {
        fehlerZeigen(e, "Import fehlgeschlagen");
      } finally {
        S.ui.editor.laeuft = false; render();
      }
      break;
    }
    case "speichern-sync": {
      const form = $('form[data-form="einstellungen"]');
      leseEinstellungen(form);
      try { await speichereEinstellungen(true); toast("Gespeichert – Claude baut die Seite bei der nächsten Prüfung neu auf"); render(); }
      catch (e) { fehlerZeigen(e, "Speichern fehlgeschlagen"); }
      break;
    }
    case "plan-tab": S.ui.plan.text = $("#plan-text")?.value ?? S.ui.plan.text; S.ui.plan.url = $("#plan-url")?.value ?? S.ui.plan.url; S.ui.plan.tab = el.dataset.tab; render(); break;
    case "plan-text": {
      const t = $("#plan-text").value;
      if (!t.trim()) return toast("Bitte zuerst ein Rezept einfügen");
      S.ui.plan.text = t; planSetzen(parseRezeptText(t)); render();
      break;
    }
    case "plan-link": {
      const url = sichereUrl($("#plan-url").value.trim());
      if (!url) return toast("Bitte einen gültigen Link eingeben");
      S.ui.plan.url = url; S.ui.plan.status = "⏳ Rezept wird geladen …"; render();
      try {
        const { data, error } = await sb.functions.invoke("rezept-import", { body: { url } });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.fehler || "Kein Rezept gefunden");
        planSetzen({ ...data.rezept, quelle_url: url });
      } catch (e) { S.ui.plan.status = `Import fehlgeschlagen: ${e.message}`; }
      render();
      break;
    }
    case "plan-liste": await planAufListe(); break;
    case "plan-speichern": {
      const r = S.ui.plan.rezept;
      S.ui.editor = { schluessel: "neu", tab: "formular", entwurf: entwurfAusErkannt(r), text: "", url: "", laeuft: false };
      location.hash = "#/neu";
      break;
    }
    case "abmelden": await sb.auth.signOut(); toast("Abgemeldet"); break;
    case "aktionen-jetzt": {
      el.disabled = true; el.textContent = "⏳ Wird aktualisiert …";
      try {
        const { data, error } = await sb.functions.invoke("aktionen-update", { body: {} });
        if (error) throw error;
        if (data?.uebersprungen) toast("Wurde gerade erst aktualisiert – bitte in ein paar Minuten nochmals versuchen");
        else toast(`${data?.anzahl ?? "?"} Aktionen geladen`);
        await ladeAktionen(); baueIndex(); render();
      } catch (e) { fehlerZeigen(e, "Aktualisieren fehlgeschlagen"); render(); }
      break;
    }
    case "export": {
      const daten = { exportiert: new Date().toISOString(), einstellungen: S.einst, wuensche: S.meta.wuensche, meine_rezepte: S.meine, einkaufsliste: S.liste };
      const blob = new Blob([JSON.stringify(daten, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `einkaufsliste-${heuteISO()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      break;
    }
  }
});

document.addEventListener("change", async (ev) => {
  const el = ev.target;
  const aktion = el.dataset?.aktion;
  if (!aktion) return;
  const id = el.dataset.id;
  switch (aktion) {
    case "abhaken": {
      const erledigt = el.checked;
      S.liste = S.liste.map((i) => (i.id === id ? { ...i, erledigt } : i));
      render();
      try { await db.aendern("einkaufsliste", id, { erledigt }); } catch (e) { fehlerZeigen(e); }
      break;
    }
    case "habe": {
      const set = S.ui.habe[id] ?? new Set();
      const i = Number(el.dataset.i);
      el.checked ? set.add(i) : set.delete(i);
      S.ui.habe[id] = set;
      render();
      break;
    }
    case "akt-kat": S.ui.akt.kat = el.value; S.ui.akt.limit = 60; $("#ergebnisse").innerHTML = aktionenErgebnisse(); break;
    case "akt-sort": S.ui.akt.sort = el.value; $("#ergebnisse").innerHTML = aktionenErgebnisse(); break;
    case "akt-gesund": S.ui.akt.gesund = el.checked; $("#ergebnisse").innerHTML = aktionenErgebnisse(); break;
    case "rez-zeiten": S.ui.rez.alleZeiten = el.checked; $("#ergebnisse").innerHTML = rezeptErgebnisse(); break;
    case "meine-fav": S.ui.meine.nurFav = el.checked; $("#ergebnisse").innerHTML = meineErgebnisse(); break;
    case "plan-wahl": S.ui.plan.wahl[el.dataset.i] = el.value; break;
    case "plan-foto": {
      const datei = el.files?.[0];
      if (!datei) break;
      S.ui.plan.status = "⏳ Texterkennung wird geladen (beim ersten Mal ca. 10–20 Sekunden) …"; S.ui.plan.rezept = null; render();
      try {
        const text = await texterkennung(datei);
        S.ui.plan.text = text;
        planSetzen(parseRezeptText(text));
        if (S.ui.plan.rezept.zutaten.length) S.ui.plan.status = "✅ Erkannt – prüfe die Zutaten. Den erkannten Text kannst du im Tab «Text» korrigieren.";
      } catch (e) { S.ui.plan.status = `Texterkennung fehlgeschlagen: ${e.message}`; }
      render();
      break;
    }
    case "import": {
      const datei = el.files?.[0];
      if (!datei) break;
      try {
        const d = JSON.parse(await datei.text());
        if (d.einstellungen) S.einst = { ...STANDARD, ...d.einstellungen };
        if (typeof d.wuensche === "string") S.meta.wuensche = d.wuensche;
        await speichereEinstellungen(false);
        const strip = ({ id, user_id, erstellt_am, aktualisiert_am, ...rest }) => rest;
        if (Array.isArray(d.meine_rezepte) && d.meine_rezepte.length) S.meine.push(...(await db.neu("meine_rezepte", d.meine_rezepte.map(strip))));
        if (Array.isArray(d.einkaufsliste) && d.einkaufsliste.length) S.liste.push(...(await db.neu("einkaufsliste", d.einkaufsliste.map(strip))));
        toast("Import abgeschlossen");
        render();
      } catch (e) { fehlerZeigen(e, "Import fehlgeschlagen"); }
      break;
    }
  }
});

document.addEventListener("keydown", (ev) => {
  if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches?.('.schritt-text[role="button"]')) { ev.preventDefault(); ev.target.click(); }
});

document.addEventListener("submit", async (ev) => {
  const form = ev.target.closest("form[data-form]");
  if (!form) return;
  ev.preventDefault();
  const fd = new FormData(form);
  switch (form.dataset.form) {
    case "artikel-neu": {
      const name = String(fd.get("name") || "").trim();
      if (!name) return;
      const preis = fd.get("preis") ? Number(fd.get("preis")) : null;
      const laden = String(fd.get("laden") || "");
      const key = keyFuer(name);
      const d = !preis && !laden ? dealFuer(key) : null;
      await artikelHinzufuegen([{
        name, menge: String(fd.get("menge") || "").trim() || null, laden: laden || (d ? d.laden : ""),
        preis, kategorie: d?.kategorie || null, aktion_id: d?.id ?? null, quelle: d ? "eigene · Aktion gefunden" : "eigene",
      }], d ? `«${name}» hinzugefügt – Tipp: ${d.laden} hat ${d.titel} in Aktion` : undefined);
      $("#neu-name")?.focus();
      break;
    }
    case "rezept-speichern": await rezeptSpeichern(); break;
    case "einstellungen": {
      leseEinstellungen(form);
      try { await speichereEinstellungen(false); await ladeLokaleLaeden(); toast("Einstellungen gespeichert"); render(); }
      catch (e) { fehlerZeigen(e, "Speichern fehlgeschlagen"); }
      break;
    }
    case "login": {
      const email = String(fd.get("email") || "").trim();
      const knopf = form.querySelector("button");
      knopf.disabled = true;
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
      knopf.disabled = false;
      if (error) fehlerZeigen(error, "Login-Link konnte nicht gesendet werden");
      else { toast("Login-Link gesendet – schau in dein E-Mail-Postfach"); form.innerHTML = `<p>📧 Wir haben dir einen Login-Link an <strong>${esc(email)}</strong> geschickt. Öffne ihn auf diesem Gerät.</p>`; }
      break;
    }
  }
});

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

sb.auth.onAuthStateChange(async (event, session) => {
  const user = session?.user ?? null;
  const vorher = S.user?.id;
  S.user = user;
  if (location.hash.includes("access_token")) history.replaceState(null, "", location.pathname + "#/einstellungen");
  if (!S.geladen) return; // Erstladung übernimmt
  if ((user?.id ?? null) !== (vorher ?? null)) {
    if (event === "SIGNED_IN" && user) { await lokaleDatenHochladen(); toast("Angemeldet – deine Daten werden synchronisiert"); }
    if (!user) { S.liste = lokal.get("einkaufsliste", []); S.meine = lokal.get("meine_rezepte", []); S.meta = { ...S.meta, claude_nachricht: null, claude_sync_am: null }; }
    await ladePrivat();
    render();
  }
});

window.addEventListener("offline", () => render());
window.addEventListener("online", async () => {
  await warteschlangeAbarbeiten();
  if (S.user) { try { [S.liste, S.meine] = await Promise.all([db.liste("einkaufsliste"), db.liste("meine_rezepte")]); } catch { /* egal */ } }
  if (!S.aktionen.length || S.aktionenStand) { try { await ladeAktionen(); baueIndex(); } catch { /* egal */ } }
  render();
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { /* ohne Offline-Modus weiter */ });

(async function start() {
  wendeDesignAn();
  render();
  const { data } = await sb.auth.getSession();
  S.user = data.session?.user ?? null;
  if (location.hash.includes("access_token")) history.replaceState(null, "", location.pathname + "#/einstellungen");
  if (S.user && (lokal.get("einkaufsliste", []).length || lokal.get("meine_rezepte", []).length)) await lokaleDatenHochladen();
  await warteschlangeAbarbeiten().catch(console.error);
  await Promise.all([ladeOeffentlich(), ladePrivat()]);
  baueIndex();
  S.geladen = true;
  letzteSeite = route()[0] + "/" + (route()[1] || "");
  render();
})();
