// Recoit un lien YouTube, Twitch ou Kick : cree le travail, que l'agent du PC viendra chercher
import { randomBytes } from "node:crypto";
import { json, tooBusy, gh, cleanOpts, canonUrl } from "./_gh.mjs";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  if (await tooBusy()) return json({ error: "Trop de demandes en ce moment, réessaie dans une heure." }, 429);
  const url = canonUrl(body.url);
  if (!url) return json({ error: "Colle un lien de vidéo YouTube, de VOD Twitch ou de VOD Kick." }, 400);
  const clips = Number(body.clips);
  if (!Number.isInteger(clips) || clips < 1 || clips > 6)
    return json({ error: "Entre 1 et 6 shorts." }, 400);
  const { opts, error } = cleanOpts(body.opts);
  if (error) return json({ error }, 400);

  const job = randomBytes(8).toString("hex");
  const r = await gh("/releases", {
    method: "POST",
    body: JSON.stringify({
      tag_name: `job-${job}`, target_commitish: "master", name: `job ${job}`, prerelease: true,
      body: "attente\n" + JSON.stringify({ url, clips, opts }),
    }),
  });
  if (!r.ok) return json({ error: "Le moteur ne répond pas, réessaie dans une minute." }, 502);
  return json({ job });
}
