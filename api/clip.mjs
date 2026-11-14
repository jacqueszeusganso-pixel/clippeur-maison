// Lance le moteur (GitHub Actions) sur la video deja envoyee
import { json, gh, findRelease, cleanOpts } from "./_gh.mjs";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const clips = Number(body.clips);
  if (!Number.isInteger(clips) || clips < 1 || clips > 6)
    return json({ error: "Entre 1 et 6 shorts." }, 400);
  const { opts, error } = cleanOpts(body.opts);
  if (error) return json({ error }, 400);
  const rel = await findRelease(body.job);
  if (!rel) return json({ error: "Travail introuvable." }, 404);
  if (!rel.assets.some((a) => a.name.startsWith("part_")))
    return json({ error: "La vidéo n'est pas arrivée." }, 400);

  const r = await gh("/actions/workflows/clip.yml/dispatches", {
    method: "POST",
    body: JSON.stringify({ ref: "master", inputs: { job_id: body.job, clips: String(clips), opts: JSON.stringify(opts) } }),
  });
  if (!r.ok) return json({ error: "Le moteur n'a pas démarré, réessaie." }, 502);
  return json({ ok: true }, 202);
}
