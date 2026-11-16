// Parser für aktionis.ch-Seiten (getrennt, damit er lokal mit Node getestet werden kann)
export const BASIS = "https://www.aktionis.ch";

// Reihenfolge wichtig: die erste passende Kategorie gewinnt, "Bio" zuletzt.
export const KATEGORIEN: [string, string][] = [
  ["Früchte-Gemüse", "Früchte & Gemüse"],
  ["Fleisch-Wurstwaren", "Fleisch"],
  ["Fisch-Meeresfrüchte", "Fisch"],
  ["Milchprodukte-Eier", "Milchprodukte & Eier"],
  ["Vegetarisch-Vegan", "Vegetarisch & Vegan"],
  ["Backwaren-Patisserie", "Brot & Backwaren"],
  ["Cerealien", "Frühstück & Cerealien"],
  ["Vorräte", "Vorräte"],
  ["Tiefkühlprodukte", "Tiefkühl"],
  ["Fertiggerichte", "Fertiggerichte"],
  ["Kaffee-Tee", "Kaffee & Tee"],
  ["Frucht-Gemüsesäfte", "Säfte"],
  ["Süsses-Snacks", "Süsses & Snacks"],
  ["Bio", "Bio"],
];

// Zutaten-Schlüssel (müssen zu den Rezepten/Grundsortiment passen)
const TAGS: [string, RegExp, RegExp?][] = [
  ["wurst", /wurst|cervelas|salami|schinken|schinkli|schüfeli|rippli|kassler|speck|aufschnitt|wienerli|chorizo|mortadella|bündnerfleisch|landjäger|rohess/i],
  ["poulet", /poulet|huhn|hähnchen|chicken|geflügel|truthahn|trute/i, /cervelas|wurst|nuggets|wings.*sauce|bouillon|würzmischung|flavour|noodles|balls/i],
  ["hackfleisch", /hackfleisch|gehacktes|hacktätschli/i],
  ["rind", /rind|beef|entrecôte|entrecote|hohrücken|bison|black angus/i, /wurst|salami|bouillon/i],
  ["schwein", /schwein|kotelett|nierstück|filet mignon/i, /wurst|schinken/i],
  ["lamm", /lamm/i],
  ["kalb", /kalb/i, /wurst|bratwurst/i],
  ["lachs", /lachs|salmon/i],
  ["thunfisch", /thunfisch|thon/i],
  ["crevetten", /crevette|garnele|scampi/i],
  ["fisch", /fisch|dorsch|kabeljau|pangasius|seelachs|forelle|egli|zander|filet.*msc|msc|hering|sardine|makrele|tilapia|lachsforelle/i, /fischstäbli|backfisch/i],
  ["eier", /\beier\b|freilandeier|bodenhaltungseier|\beier\s|\d+\s*eier/i, /hörnli|spaghetti|nudeln|pasta|ravioli|magronen|spiralen|müscheli|penne|teigwaren|nüdeli|likör/i],
  ["milch", /\bmilch\b|vollmilch|milchdrink|uht.?milch/i, /schoko|choco|reis|kokos/i],
  ["joghurt", /joghurt|jogurt|yogurt|skyr/i],
  ["quark", /quark/i],
  ["huettenkaese", /hüttenkäse|cottage/i],
  ["mozzarella", /mozzarella|burrata/i],
  ["kaese", /käse|gruyère|gruyere|emmentaler|appenzeller|feta|parmesan|grana padano|raclette|tilsiter|cheddar|brie|camembert|leerdammer|gouda|sbrinz|vacherin|tête de moine|le tradition|fondue/i],
  ["butter", /butter/i, /erdnuss|butterkeks|buttergipfel|butterzopf|butternuss|butternut/i],
  ["rahm", /rahm|crème fraîche|creme fraiche|sauerrahm/i, /glace/i],
  ["haferflocken", /hafer|porridge|oats/i, /drink|riegel/i],
  ["muesli", /müesli|muesli|granola|crunchy/i],
  ["brot", /brot|toast|zopf|baguette|bürli|brötchen|vollkornbrot|ruchbrot|pain\b/i, /paniermehl|schmelzkäse/i],
  ["reis", /\breis\b|risotto|basmati|jasmin|parboiled|vollkornreis/i, /reiswaffel|milchreis/i],
  ["pasta", /pasta|spaghetti|penne|fusilli|nudeln|hörnli|tagliatelle|lasagne|makkaroni|farfalle|tortellini|ravioli|gnocchi|knöpfli|spätzli/i],
  ["kartoffeln", /kartoffel|härdöpfel|gschwellti/i, /chips|stock|püree|süsskartoffel|würzmischung|pomix/i],
  ["linsen", /linsen/i],
  ["kichererbsen", /kichererbsen|hummus/i],
  ["bohnen", /bohnen|kidney|borlotti/i, /kaffee/i],
  ["erbsen", /erbsen|erbsli/i, /kichererbsen/i],
  ["tofu", /tofu|tempeh/i],
  ["tomaten", /tomate|pelati|passata/i, /ketchup|chips/i],
  ["peperoni", /peperoni|paprika/i, /chips|pulver/i],
  ["zwiebeln", /zwiebel|schalotte/i],
  ["knoblauch", /knoblauch/i],
  ["karotten", /karotte|rüebli|ruebli/i, /saft|biotta/i],
  ["broccoli", /broccoli|brokkoli/i],
  ["blumenkohl", /blumenkohl/i],
  ["rosenkohl", /rosenkohl/i],
  ["kohl", /kohl|kabis|wirz|pak choi|chinakohl|federkohl|grünkohl/i, /blumenkohl|rosenkohl|kohlrabi/i],
  ["zucchetti", /zucchetti|zucchini/i],
  ["aubergine", /aubergine/i],
  ["spinat", /spinat/i],
  ["salat", /salat|nüsslisalat|eisberg|lattich|rucola|cicorino|endivie/i, /dressing|sauce|wurstsalat|fleischsalat/i],
  ["gurke", /gurke/i],
  ["kuerbis", /kürbis|butternuss|butternut/i],
  ["lauch", /lauch/i],
  ["sellerie", /sellerie/i],
  ["pilze", /champignon|pilz|steinpilz/i],
  ["mais", /mais\b|süssmais|maiskörner/i, /chips|stärke/i],
  ["fenchel", /fenchel/i],
  ["randen", /rande|randen/i],
  ["suesskartoffel", /süsskartoffel/i],
  ["aepfel", /apfel|äpfel/i, /saft|most|mus|chips|kuchen|strudel|granatapfel|granatäpfel|schorle/i],
  ["birnen", /birne/i, /saft|dicksaft/i],
  ["bananen", /banane/i, /chips/i],
  ["orangen", /orange|mandarine|clementine|clementinen/i, /saft|juice/i],
  ["zitronen", /zitrone|limette/i, /tee|eistee|limonade/i],
  ["beeren", /beere|heidelbeer|himbeer|erdbeer|brombeer|cranberr/i, /joghurt|konfi|glace/i],
  ["trauben", /trauben/i, /saft/i],
  ["kiwi", /kiwi/i],
  ["avocado", /avocado/i],
  ["granatapfel", /granatapfel|granatäpfel/i],
  ["nuesse", /nüsse|nuss|mandel|baumnuss|haselnuss|cashew|pistazie|erdnüss|erdnüsse/i, /nougat|schoko|choco|butternuss|kokos|schinkli|schinken|nussbrot|nussrolle|biberli|gipfel|stängel/i],
  ["erdnussbutter", /erdnussbutter|peanut butter/i],
  ["oel", /olivenöl|rapsöl|sonnenblumenöl|\böl\b/i],
  ["kastanien", /kastanie|marroni/i],
];

const UNGESUND = /chips|schoko|schokolade|choco|praline|guetzli|biscuit|cookie|kekse|waffel|glace|eiscreme|gummi|bonbon|zucker|sirup|nutella|cola|energy|eistee|limonade|nuggets|cordon bleu|frites|pommes|pizza|lasagne|chicken wings|paniert|backfisch|fischstäbli|kuchen|torte|gipfel|croissant|donut|berliner|crème brûlée|tiramisu|mousse|apéro|cracker|salzstangen|popcorn|ketchup|mayonnaise|toblerone|lindt|ragusa|kägi|branchli|minipic|zweifel|pringles/i;
const SEHR_GESUND = /vollkorn|hafer|linsen|kichererbsen|bohnen|broccoli|spinat|nature|natur\b|ohne zucker|lachs|quark|hüttenkäse|skyr|tofu|nüsse|baumnuss|mandel/i;

const BASIS_GESUND: Record<string, number> = {
  "Früchte & Gemüse": 3, "Fisch": 3, "Milchprodukte & Eier": 2, "Fleisch": 2,
  "Vegetarisch & Vegan": 2, "Brot & Backwaren": 1, "Frühstück & Cerealien": 2,
  "Vorräte": 2, "Tiefkühl": 2, "Fertiggerichte": 1, "Kaffee & Tee": 1,
  "Säfte": 1, "Süsses & Snacks": 0, "Bio": 2,
};

export type Aktion = {
  id: number; laden: string; titel: string; beschreibung: string | null;
  kategorie: string; preis: number | null; preis_normal: number | null;
  rabatt_prozent: number | null; einheitspreis: string | null;
  gueltig_von: string | null; gueltig_bis: string | null;
  bild_url: string | null; quelle_url: string; tags: string[];
  gesund: number; bio: boolean; zuletzt_gesehen: string;
};

function entities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ").trim();
}

function preis(s?: string | null): number | null {
  if (!s) return null;
  const t = s.replace(/[–—-]+$/, "00").replace(/[^\d.]/g, "");
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function datum(d: string): string {
  const [tt, mm, jjjj] = d.split(".");
  return `${jjjj}-${mm.padStart(2, "0")}-${tt.padStart(2, "0")}`;
}

function laden(alt: string): string {
  const a = entities(alt);
  if (/lidl/i.test(a)) return "Lidl";
  if (/^aldi/i.test(a)) return "Aldi";
  if (/^spar$/i.test(a)) return "Spar";
  if (/^otto/i.test(a)) return "Otto's";
  if (/^volg$/i.test(a)) return "Volg";
  return a;
}

export function bewerte(kategorie: string, text: string, tags: string[]): number {
  let g = BASIS_GESUND[kategorie] ?? 1;
  if (SEHR_GESUND.test(text)) g += 1;
  if (UNGESUND.test(text)) g = Math.min(g, 0);
  if (tags.includes("wurst")) g = Math.min(g, 1);
  if (tags.includes("kaese") && !tags.includes("huettenkaese")) g = Math.min(g, 2);
  if (/schmelzkäse|scheiblette|streichkäse|fondue|raclette/i.test(text)) g = Math.min(g, 1);
  if (kategorie === "Fertiggerichte" && !UNGESUND.test(text)) g = Math.max(g, 1);
  return Math.max(0, Math.min(3, g));
}

export function zutatenTags(text: string): string[] {
  const t: string[] = [];
  for (const [key, re, ausser] of TAGS) {
    if (re.test(text) && !(ausser && ausser.test(text))) t.push(key);
  }
  // Verarbeitete Wurst zählt nicht als Frischfleisch
  if (t.includes("wurst")) return t.filter((k) => !["poulet", "rind", "schwein", "kalb"].includes(k));
  return t;
}

export function parseKarten(html: string, kategorie: string, jetzt: string): Aktion[] {
  const h = html.replace(/\s+/g, " ");
  const teile = h.split('<div data-upox-id="').slice(1);
  const out: Aktion[] = [];
  for (const teil of teile) {
    const id = parseInt(teil, 10);
    if (!Number.isFinite(id) || !teil.includes("dealtype-deal")) continue;
    const g = (re: RegExp) => { const m = teil.match(re); return m ? m[1] : null; };
    const titelRoh = g(/<h3 class="card-title[^"]*">\s*(.*?)\s*<\/h3>/);
    const ladenRoh = g(/<div class="card-merchant">\s*<img[^>]*alt="([^"]*)"/);
    if (!titelRoh || !ladenRoh) continue;
    const titel = entities(titelRoh);
    const beschreibung = entities(g(/<p class="card-description[^"]*">(.*?)<\/p>/) ?? "") || null;
    const datumText = g(/<span class="card-date">(.*?)<\/span>/) ?? "";
    const daten = datumText.match(/\d{1,2}\.\d{1,2}\.\d{4}/g) ?? [];
    let von: string | null = null, bis: string | null = null;
    if (daten.length >= 2) { von = datum(daten[0]); bis = datum(daten[1]); }
    else if (daten.length === 1) { if (/ab/i.test(datumText)) von = datum(daten[0]); else bis = datum(daten[0]); }
    if (beschreibung && (!bis || !von)) {
      // z.B. Migros: "Angebot gilt nur vom 12.11. bis 18.11.2026"
      const m = beschreibung.match(/(?:vom (\d{1,2})\.(\d{1,2})\.(?:(\d{4}))? )?bis (\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (m) {
        if (!bis) bis = `${m[6]}-${m[5].padStart(2, "0")}-${m[4].padStart(2, "0")}`;
        if (!von && m[1]) von = `${m[3] ?? m[6]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      }
    }
    const einheit = beschreibung?.match(/(\d+\s?(?:g|kg|ml|cl|l|Stk\.?|Stück))\s?=\s?(\d+(?:\.\d+)?)/i);
    const rabatt = g(/price-discount"[^>]*>\s*(\d+)\s*%/);
    const text = `${titel} ${beschreibung ?? ""}`;
    const tags = zutatenTags(titel);
    const bio = /\bbio\b|naturaplan|demeter|knospe/i.test(text) || kategorie === "Bio";
    if (bio) tags.push("bio");
    const href = g(/<a href="(\/deals\/[^"]+)"/);
    out.push({
      id, laden: laden(ladenRoh), titel, beschreibung, kategorie,
      preis: preis(g(/price-new">([^<]*)</)),
      preis_normal: preis(g(/price-old">([^<]*)</)),
      rabatt_prozent: rabatt ? parseInt(rabatt, 10) : null,
      einheitspreis: einheit ? `${einheit[1].replace(/\s/g, " ")} = ${einheit[2]}` : null,
      gueltig_von: von, gueltig_bis: bis,
      bild_url: g(/<div class="card-image">\s*<img src="([^"]+)"/),
      quelle_url: href ? BASIS + href : BASIS,
      tags: [...new Set(tags)],
      gesund: bewerte(kategorie, text, tags),
      bio, zuletzt_gesehen: jetzt,
    });
  }
  return out;
}
