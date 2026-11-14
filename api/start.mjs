// Ouvre un travail : cree la "release" GitHub qui recevra les morceaux de la video
import { randomBytes } from "node:crypto";
import { json, codeOk, gh, MAX_BYTES } from "./_gh.mjs";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  if (!codeOk(body.code)) return json({ error: "Code d'accès incorrect." }, 401);
  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES)
    return json({ error: "Vidéo trop lourde : 500 Mo maximum." }, 400);

  const job = randomBytes(8).toString("hex");
  const r = await gh("/releases", {
    method: "POST",
    body: JSON.stringify({
      tag_name: `job-${job}`, target_commitish: "master",
      name: `job ${job}`, body: "Travail du clippeur maison", prerelease: true,
    }),
  });
  if (!r.ok) return json({ error: "Le moteur ne répond pas, réessaie dans une minute." }, 502);
  return json({ job });
}
