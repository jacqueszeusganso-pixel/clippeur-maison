// Etat d'un travail : en cours, termine (avec les shorts) ou en echec
import { json, findRelease } from "./_gh.mjs";

export async function GET(req) {
  const rel = await findRelease(new URL(req.url).searchParams.get("job"));
  if (!rel) return json({ state: "unknown", error: "Travail introuvable." }, 404);
  const assets = Object.fromEntries(rel.assets.map((a) => [a.name, a.browser_download_url]));
  if (assets["error.txt"]) return json({ state: "error" });
  if (!assets["shorts.json"]) {
    const step = (rel.body || "").split("\n")[0];
    return json({ state: step === "attente" ? "waiting" : step === "pc" ? "fetching" : "running" });
  }

  const meta = await fetch(assets["shorts.json"]).then((r) => r.json()).catch(() => null);
  if (!Array.isArray(meta)) return json({ state: "error" });
  const shorts = meta.map((m) => ({
    title: String(m.title || ""), score: Number(m.score) || 0,
    caption: String(m.caption || ""), hashtags: String(m.hashtags || ""),
    start: Number(m.start) || 0, end: Number(m.end) || 0,
    url: assets[m.file] || null,
  }));
  return json({ state: "done", shorts });
}
