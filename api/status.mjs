// Etat d'un travail : en cours, termine (avec les shorts) ou en echec
import { json, findRelease } from "./_gh.mjs";

const EDIT_RE = /^edit_0([1-6])_([a-f0-9]{8})\.mp4$/;

export async function GET(req) {
  const rel = await findRelease(new URL(req.url).searchParams.get("job"));
  if (!rel) return json({ state: "unknown", error: "Travail introuvable." }, 404);
  const assets = Object.fromEntries(rel.assets.map((a) => [a.name, a.browser_download_url]));
  // anciens travaux : GitHub a retire les accents des noms ("jachète" -> "jachete")
  const ascii = (n) => String(n || "").normalize("NFKD").replace(/[^\x00-\x7f]/g, "");
  const fileUrl = (n) => assets[n] || assets[ascii(n)] || null;
  if (assets["error.txt"]) return json({ state: "error" });
  if (!assets["shorts.json"]) {
    const step = (rel.body || "").split("\n")[0];
    return json({ state: step === "attente" ? "waiting" : step === "pc" ? "fetching" : "running" });
  }

  const meta = await fetch(assets["shorts.json"]).then((r) => r.json()).catch(() => null);
  if (!Array.isArray(meta)) return json({ state: "error" });

  // derniere version editee de chaque short, pour la retrouver en revenant sur la page
  const last = {};
  for (const a of rel.assets) {
    const m = EDIT_RE.exec(a.name);
    if (m && assets[a.name.replace(/\.mp4$/, ".json")] && (!last[m[1]] || a.created_at > last[m[1]].created_at))
      last[m[1]] = a;
  }
  const shorts = await Promise.all(meta.map(async (m) => {
    const n = Number(/^raw_0([1-6])\.mp4$/.exec(m.raw || "")?.[1]) || null;
    const ed = n && last[n];
    const edSpec = ed ? await fetch(assets[ed.name.replace(/\.mp4$/, ".json")]).then((r) => r.json()).catch(() => null) : null;
    return {
      title: String(m.title || ""), score: Number(m.score) || 0,
      caption: String(m.caption || ""), hashtags: String(m.hashtags || ""),
      start: Number(m.start) || 0, end: Number(m.end) || 0,
      url: (ed && edSpec ? ed.browser_download_url : fileUrl(m.file)) || null,
      n, raw: n ? assets[m.raw] || null : null, dur: Number(m.dur) || 0,
      spec: (ed && edSpec) || m.spec || null,
    };
  }));
  return json({ state: "done", shorts });
}
