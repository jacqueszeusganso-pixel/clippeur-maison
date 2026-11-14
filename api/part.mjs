// Recoit un morceau (4 Mo max) de la video et le range dans la release du travail
import { json, codeOk, gh, findRelease, PART_BYTES, MAX_BYTES } from "./_gh.mjs";

export async function POST(req) {
  const url = new URL(req.url);
  if (!codeOk(req.headers.get("x-code"))) return json({ error: "Code d'accès incorrect." }, 401);
  const i = Number(url.searchParams.get("i"));
  if (!Number.isInteger(i) || i < 0 || i >= Math.ceil(MAX_BYTES / PART_BYTES))
    return json({ error: "Morceau invalide." }, 400);
  const rel = await findRelease(url.searchParams.get("job"));
  if (!rel) return json({ error: "Travail introuvable." }, 404);

  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length || buf.length > PART_BYTES) return json({ error: "Morceau invalide." }, 400);

  const name = `part_${String(i).padStart(3, "0")}`;
  const r = await gh(`/releases/${rel.id}/assets?name=${name}`, {
    method: "POST", body: buf, headers: { "Content-Type": "application/octet-stream" },
  }, "https://uploads.github.com/repos/");
  if (!r.ok) return json({ error: "Envoi interrompu, réessaie." }, 502);
  return json({ ok: true });
}
