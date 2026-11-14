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
