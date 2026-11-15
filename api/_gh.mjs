// Outils partages des fonctions API (fichier prefixe "_" : pas une route)
const REPO = "jacqueszeusganso-pixel/clippeur-moteur";
export const JOB_RE = /^[a-f0-9]{16}$/;
export const PART_BYTES = 4 * 1024 * 1024; // sous la limite de 4,5 Mo des fonctions Vercel
export const MAX_BYTES = 500 * 1024 * 1024;

export function json(data, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

// Garde-fou sans code : au-dela de 12 travaux par heure (tous visiteurs
// confondus), on refuse, pour que des inconnus ne vident pas le quota Groq.
// ponytail: limite globale, une limite par visiteur demanderait une base de donnees.
export async function tooBusy() {
  const r = await gh("/releases?per_page=30");
  if (!r.ok) return false;
  const hourAgo = Date.now() - 3600_000;
  return (await r.json()).filter((x) => Date.parse(x.created_at) > hourAgo).length >= 12;
}

export function gh(path, opts = {}, base = "https://api.github.com/repos/") {
  return fetch(base + REPO + path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "clippeur-maison",
      ...opts.headers,
    },
  });
}

export async function findRelease(job) {
  if (!JOB_RE.test(job || "")) return null;
  const r = await gh(`/releases/tags/job-${job}`);
  return r.ok ? r.json() : null;
}

// Reglages envoyes par le site. Le moteur et l'agent revalident de leur cote.
const FORMATS = ["9:16", "4:5", "1:1", "16:9"];
const CATS = ["auto", "chat", "irl", "gaming", "podcast"];
const LAYOUTS = ["auto", "full", "split"];
export function cleanOpts(o) {
  o = o && typeof o === "object" ? o : {};
  const opts = {
    format: FORMATS.includes(o.format) ? o.format : "9:16",
    cat: CATS.includes(o.cat) ? o.cat : "auto",
    layout: LAYOUTS.includes(o.layout) ? o.layout : "auto",
    cut: o.cut !== false,
    title: o.title !== false,
    find: String(o.find || "").replace(/\s+/g, " ").trim().slice(0, 200),
  };
  if (o.start != null || o.end != null) {
    const a = Number(o.start), b = Number(o.end);
    if (!(a >= 0 && b > a && b <= 86400 && b - a <= 3600))
      return { error: "Partie à scanner invalide : la fin doit suivre le début, 1 heure maximum." };
    opts.start = a; opts.end = b;
  }
  return { opts };
}

// Liens acceptes. On renvoie une URL reconstruite, jamais celle collee telle quelle.
const SOURCES = [
  [/^https:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/,
    (m) => `https://www.youtube.com/watch?v=${m[4]}`],
  [/^https:\/\/(www\.|m\.)?twitch\.tv\/videos\/(\d{5,12})/, (m) => `https://www.twitch.tv/videos/${m[2]}`],
  [/^https:\/\/(www\.)?kick\.com\/([\w-]{1,40})\/videos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/,
    (m) => `https://kick.com/${m[2]}/videos/${m[3]}`],
];
export function canonUrl(url) {
  for (const [re, f] of SOURCES) {
    const m = re.exec(String(url || ""));
    if (m) return f(m);
  }
  return null;
}

// Reglages d'un short envoyes par l'editeur. Le moteur les revalide (parse_spec).
const rect = (r) => {
  if (!r || typeof r !== "object") return null;
  const o = {};
  for (const k of ["x", "y", "w", "h"]) {
    const v = Number(r[k]);
    if (!Number.isFinite(v) || v < (k === "w" || k === "h" ? 0.02 : 0) || v > 1) return null;
    o[k] = Math.round(v * 1e4) / 1e4;
  }
  return o;
};
export function cleanSpec(s) {
  s = s && typeof s === "object" ? s : {};
  const a = Number(s.trim?.[0]), b = Number(s.trim?.[1]);
  if (!(a >= 0 && b > a && b <= 600)) return { error: "Début et fin du short invalides." };
  return {
    spec: {
      format: FORMATS.includes(s.format) ? s.format : "9:16",
      layout: s.layout === "split" ? "split" : "full",
      crop: rect(s.crop), cam: rect(s.cam), game: rect(s.game),
      track: s.track === true,
      trim: [Math.round(a * 100) / 100, Math.round(b * 100) / 100],
      cut: s.cut !== false, subs: s.subs !== false,
      title: String(s.title || "").replace(/\s+/g, " ").trim().slice(0, 100),
      ask: String(s.ask || "").replace(/\s+/g, " ").trim().slice(0, 300),
    },
  };
}
