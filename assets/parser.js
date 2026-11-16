// Rezept-Parser: wandelt eingefügten Text oder Zutatenzeilen in strukturierte Daten um.
// Die Zutaten-Schlüssel (key) passen zu den Tags der Aktionen (siehe supabase/functions/aktionen-update/parse.ts).

const ZUTAT_KEYS = [
  ["poulet", /poulet|huhn|hähnchen|hühner|chicken|truthahn|trute/i],
  ["hackfleisch", /hackfleisch|gehacktes|hack\b/i],
  ["rind", /rind|beef|entrecôte|steak/i],
  ["schwein", /schwein|kotelett/i],
  ["wurst", /wurst|speck|schinken|salami|cervelas|chorizo/i],
  ["lachs", /lachs/i],
  ["thunfisch", /thunfisch|thon/i],
  ["crevetten", /crevette|garnele|scampi/i],
  ["fisch", /fisch|dorsch|kabeljau|pangasius|seelachs|forelle|egli/i],
  ["eier", /\beier?\b|\beigelb|eiweiss/i],
  ["huettenkaese", /hüttenkäse|cottage/i],
  ["mozzarella", /mozzarella/i],
  ["kaese", /käse|parmesan|gruyère|emmentaler|feta|sbrinz|reibkäse/i],
  ["quark", /quark/i],
  ["joghurt", /joghurt|jogurt|skyr/i],
  ["rahm", /rahm|crème fraîche|creme fraiche/i],
  ["butter", /butter(?!milch)/i],
  ["milch", /milch/i],
  ["haferflocken", /hafer/i],
  ["muesli", /müesli|muesli|granola/i],
  ["brot", /brot|toast|baguette|fladenbrot|tortilla|wrap/i],
  ["reis", /reis\b|risotto|basmati|jasmin/i],
  ["pasta", /pasta|spaghetti|penne|fusilli|nudeln|hörnli|tagliatelle|lasagne|makkaroni|farfalle|gnocchi/i],
  ["suesskartoffel", /süsskartoffel/i],
  ["kartoffeln", /kartoffel|härdöpfel/i],
  ["kichererbsen", /kichererbsen/i],
  ["linsen", /linsen/i],
  ["bohnen", /bohnen|kidney/i],
  ["erbsen", /erbsen|erbsli/i],
  ["tofu", /tofu|tempeh/i],
  ["tomaten", /tomate|pelati|passata/i],
  ["peperoni", /peperoni|paprikaschote/i],
  ["zwiebeln", /zwiebel|schalotte/i],
  ["knoblauch", /knoblauch/i],
  ["karotten", /karotte|rüebli/i],
  ["broccoli", /broccoli|brokkoli/i],
  ["blumenkohl", /blumenkohl/i],
  ["kohl", /kohl|kabis|wirz|pak choi/i],
  ["zucchetti", /zucchetti|zucchini/i],
  ["aubergine", /aubergine/i],
  ["spinat", /spinat/i],
  ["salat", /salat|rucola|nüsslisalat/i],
  ["gurke", /gurke/i],
  ["kuerbis", /kürbis|butternuss|hokkaido/i],
  ["lauch", /lauch/i],
  ["pilze", /champignon|pilz/i],
  ["mais", /\bmais\b/i],
  ["sellerie", /sellerie/i],
  ["randen", /rande/i],
  ["aepfel", /apfel|äpfel/i],
  ["birnen", /birne/i],
  ["bananen", /banane/i],
  ["orangen", /orange|mandarine|clementine/i],
  ["zitronen", /zitrone|limette/i],
  ["beeren", /beere/i],
  ["avocado", /avocado/i],
  ["nuesse", /nüsse|nuss|mandel|cashew|pistazie/i],
  ["erdnussbutter", /erdnussbutter/i],
];

// Typische Vorratsartikel: kommen nicht automatisch auf die Einkaufsliste
const BASIS = /^(salz|pfeffer|öl|olivenöl|rapsöl|sonnenblumenöl|wasser|zucker|mehl|essig|senf|bouillon|gemüsebouillon|honig|zimt|muskat|paprika(pulver)?|curry(pulver)?|kreuzkümmel|oregano|basilikum|thymian|rosmarin|chili(pulver|flocken)?|kräuter|sojasauce|tomatenpüree|backpulver|vanillezucker|lorbeer)/i;

const EINHEITEN = [
  "kg", "g", "mg", "l", "dl", "cl", "ml", "el", "tl", "msp", "prise", "prisen",
  "stk", "stück", "dose", "dosen", "pck", "päckchen", "packung", "bund", "zehe", "zehen",
  "scheibe", "scheiben", "becher", "tasse", "tassen", "handvoll", "glas", "gläser",
  "kugel", "kugeln", "stange", "stangen", "zweig", "zweige", "blatt", "blätter", "würfel", "beutel", "schuss", "spritzer",
];
const BRUECHE = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };

export function keyFuer(name) {
  for (const [key, re] of ZUTAT_KEYS) if (re.test(name)) return key;
  return null;
}

export function istBasis(name) {
  return BASIS.test(name.trim());
}

function zahl(s) {
  if (!s) return null;
  s = s.trim();
  if (BRUECHE[s] != null) return BRUECHE[s];
  const gemischt = s.match(/^(\d+)\s*([½¼¾⅓⅔⅛])$/);
  if (gemischt) return Number(gemischt[1]) + BRUECHE[gemischt[2]];
  const bruch = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (bruch) return Number(bruch[1]) / Number(bruch[2]);
  const bereich = s.match(/^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)$/);
  if (bereich) return Number(bereich[2].replace(",", "."));
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** "200 g Vollkornpasta" -> { menge: 200, einheit: "g", name: "Vollkornpasta", key: "pasta" } */
export function parseZutat(zeile) {
  let t = zeile.replace(/^[\s\-–•*·▢☐□✓✔]+/, "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  t = t.replace(/^ca\.?\s+/i, "");
  const m = t.match(/^((?:\d+\s*[½¼¾⅓⅔⅛])|(?:\d+(?:[.,]\d+)?\s*[-–]\s*\d+(?:[.,]\d+)?)|(?:\d+\s*\/\s*\d+)|(?:\d+(?:[.,]\d+)?)|[½¼¾⅓⅔⅛])\s*(.*)$/);
  let menge = null, einheit = "", rest = t;
  if (m) {
    menge = zahl(m[1]);
    rest = m[2];
    const e = rest.match(/^([A-Za-zÄÖÜäöü]+)\.?(\s+|$)/);
    if (e && EINHEITEN.includes(e[1].toLowerCase())) {
      const klein = e[1].toLowerCase();
      einheit = klein === "el" || klein === "tl" ? klein.toUpperCase() : klein.length <= 3 ? klein : e[1];
      rest = rest.slice(e[0].length);
    }
  }
  const name = rest.replace(/^(von|vom)\s+/i, "").trim() || t;
  return { menge, einheit, name, key: keyFuer(name), basis: istBasis(name) || undefined };
}

export function zutatenAusText(text) {
  return text.split(/\n+/).map(parseZutat).filter(Boolean);
}

export function schritteAusText(text) {
  const zeilen = text.split(/\n+/).map((z) => z.trim()).filter(Boolean);
  return zeilen
    .map((z) => z.replace(/^(\d+[.)]|schritt\s*\d+:?|[-–•*])\s*/i, "").trim())
    .filter(Boolean);
}

export function zutatAlsText(z, faktor = 1) {
  const menge = z.menge != null ? formatMenge(z.menge * faktor) : "";
  return [menge, z.einheit, z.name].filter(Boolean).join(" ");
}

export function formatMenge(n) {
  if (n == null || !Number.isFinite(n)) return "";
  if (n >= 10) return String(Math.round(n));
  const gerundet = Math.round(n * 4) / 4;
  const ganz = Math.floor(gerundet);
  const rest = gerundet - ganz;
  const bruch = { 0.25: "¼", 0.5: "½", 0.75: "¾" }[rest] || "";
  if (!bruch) return String(Math.round(n * 10) / 10).replace(".", ",");
  return ganz ? `${ganz}${bruch}` : bruch;
}

const KOPF_ZUTATEN = /^(zutaten|einkaufsliste|du brauchst|ingredients|für \d+ (personen|portionen))\b/i;
const KOPF_SCHRITTE = /^(zubereitung|anleitung|so geht'?s|schritte|vorgehen|vorbereitung|instructions|method|zubereiten)\b/i;
const KOPF_NOTIZEN = /^(tipps?|hinweis|notiz(en)?|variante)\b/i;

/** Ganzes Rezept aus beliebigem Text erkennen */
export function parseRezeptText(text) {
  const zeilen = text.replace(/\r/g, "").split("\n").map((z) => z.trim());
  const r = { titel: "", beschreibung: "", portionen: null, zeit_min: null, zutaten: [], schritte: [], notizen: "" };

  const ganz = text.replace(/\s+/g, " ");
  const p = ganz.match(/(?:für\s*)?(\d+)\s*(?:portionen|personen|pers\.|stück)/i);
  if (p) r.portionen = Number(p[1]);
  const zeit = ganz.match(/(\d+)\s*(?:min\b|minuten)/i);
  const std = ganz.match(/(\d+(?:[.,]\d+)?)\s*(?:std\.?|stunden?)/i);
  if (zeit) r.zeit_min = Number(zeit[1]) + (std ? Math.round(Number(std[1].replace(",", ".")) * 60) : 0);
  else if (std) r.zeit_min = Math.round(Number(std[1].replace(",", ".")) * 60);

  let modus = "start";
  const unklar = [];
  for (const z of zeilen) {
    if (!z) continue;
    const ohneDoppelpunkt = z.replace(/[:：]\s*$/, "");
    if (KOPF_ZUTATEN.test(ohneDoppelpunkt) && ohneDoppelpunkt.length < 40) { modus = "zutaten"; continue; }
    if (KOPF_SCHRITTE.test(ohneDoppelpunkt) && ohneDoppelpunkt.length < 40) { modus = "schritte"; continue; }
    if (KOPF_NOTIZEN.test(ohneDoppelpunkt) && ohneDoppelpunkt.length < 40) { modus = "notizen"; continue; }
    if (modus === "start" && !r.titel) { r.titel = z.replace(/^#+\s*/, ""); continue; }
    if (modus === "zutaten") { const zt = parseZutat(z); if (zt) r.zutaten.push(zt); }
    else if (modus === "schritte") r.schritte.push(...schritteAusText(z));
    else if (modus === "notizen") r.notizen += (r.notizen ? "\n" : "") + z;
    else unklar.push(z);
  }

  // Ohne Überschriften: Zeilen anhand ihrer Form zuordnen
  if (unklar.length) {
    for (const z of unklar) {
      const sauber = z.replace(/^[-–•*]\s*/, "");
      const siehtAusWieZutat = /^([\d½¼¾⅓⅔]|ca\.|etwas|eine?\s|1\s|wenig|prise|salz|pfeffer)/i.test(sauber) && sauber.length < 70 && !/[.!]$/.test(sauber);
      const nummeriert = /^\d+[.)]\s+\S/.test(z) && z.length > 25;
      if (nummeriert || sauber.length > 70) r.schritte.push(...schritteAusText(z));
      else if (siehtAusWieZutat || (r.schritte.length === 0 && sauber.length < 45 && /^[-–•*]/.test(z))) {
        const zt = parseZutat(z); if (zt) r.zutaten.push(zt);
      } else if (!r.beschreibung && r.zutaten.length === 0) r.beschreibung = z;
      else r.schritte.push(...schritteAusText(z));
    }
  }
  if (!r.titel) r.titel = "Neues Rezept";
  return r;
}
