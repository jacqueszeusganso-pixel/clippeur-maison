// Outils partages des fonctions API (fichier prefixe "_" : pas une route)
import { createHash, timingSafeEqual } from "node:crypto";

const REPO = "jacqueszeusganso-pixel/clippeur-moteur";
export const JOB_RE = /^[a-f0-9]{16}$/;
export const PART_BYTES = 4 * 1024 * 1024; // sous la limite de 4,5 Mo des fonctions Vercel
export const MAX_BYTES = 500 * 1024 * 1024;

export function json(data, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

const sha = (s) => createHash("sha256").update(String(s)).digest();
export function codeOk(code) {
  const ref = process.env.ACCESS_CODE;
  return Boolean(ref) && typeof code === "string" && timingSafeEqual(sha(code), sha(ref));
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
