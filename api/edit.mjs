// Editeur : POST lance une nouvelle version d'un short, GET dit ou elle en est
import { randomBytes } from "node:crypto";
import { json, gh, findRelease, cleanSpec } from "./_gh.mjs";

const MAX_EDITS = 40; // par travail, pour ne pas vider le quota GitHub/Groq
const OUT_RE = /^[a-f0-9]{8}$/;

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const clip = Number(body.clip);
  if (!Number.isInteger(clip) || clip < 1 || clip > 6) return json({ error: "Short invalide." }, 400);
  const { spec, error } = cleanSpec(body.spec);
  if (error) return json({ error }, 400);
  const rel = await findRelease(body.job);
  if (!rel) return json({ error: "Travail introuvable." }, 404);
  if (!rel.assets.some((a) => a.name === `raw_0${clip}.mp4`))
    return json({ error: "Ce short ne peut pas être modifié (créé avant l'éditeur)." }, 400);
  if (rel.assets.filter((a) => a.name.startsWith("edit_") && a.name.endsWith(".mp4")).length >= MAX_EDITS)
    return json({ error: "Limite de versions atteinte pour ce travail." }, 429);

  const out = randomBytes(4).toString("hex");
  const r = await gh("/actions/workflows/edit.yml/dispatches", {
    method: "POST",
    body: JSON.stringify({
      ref: "master",
      inputs: { job_id: body.job, clip: String(clip), out, spec: JSON.stringify(spec) },
    }),
  });
  if (!r.ok) return json({ error: "Le moteur n'a pas démarré, réessaie." }, 502);
  return json({ out }, 202);
}

export async function GET(req) {
  const q = new URL(req.url).searchParams;
  const clip = Number(q.get("clip")), out = q.get("out") || "";
  if (!Number.isInteger(clip) || clip < 1 || clip > 6 || !OUT_RE.test(out))
    return json({ error: "Version invalide." }, 400);
  const rel = await findRelease(q.get("job"));
  if (!rel) return json({ error: "Travail introuvable." }, 404);
  const base = `edit_0${clip}_${out}`;
  const assets = Object.fromEntries(rel.assets.map((a) => [a.name, a.browser_download_url]));
  if (assets[base + ".err"]) return json({ state: "error" });
  if (!assets[base + ".mp4"] || !assets[base + ".json"]) return json({ state: "running" });
  const spec = await fetch(assets[base + ".json"]).then((r) => r.json()).catch(() => null);
  return json({ state: "done", url: assets[base + ".mp4"], spec });
}
