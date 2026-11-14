// Recoit un lien YouTube : cree le travail, que l'agent du PC viendra chercher
import { randomBytes } from "node:crypto";
import { json, tooBusy, gh } from "./_gh.mjs";

const YT = /^https:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/;

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  if (await tooBusy()) return json({ error: "Trop de demandes en ce moment, réessaie dans une heure." }, 429);
  const m = YT.exec(String(body.url || ""));
  if (!m) return json({ error: "Ce lien n'est pas un lien YouTube valide." }, 400);
  const clips = Number(body.clips);
  if (!Number.isInteger(clips) || clips < 1 || clips > 6)
    return json({ error: "Entre 1 et 6 shorts." }, 400);

  const job = randomBytes(8).toString("hex");
  // on ne garde que l'identifiant de la video : l'agent reconstruit lui-meme l'URL
  const r = await gh("/releases", {
    method: "POST",
    body: JSON.stringify({
      tag_name: `job-${job}`, target_commitish: "master", name: `job ${job}`, prerelease: true,
      body: "attente\n" + JSON.stringify({ video: m[4], clips }),
    }),
  });
  if (!r.ok) return json({ error: "Le moteur ne répond pas, réessaie dans une minute." }, 502);
  return json({ job });
}
