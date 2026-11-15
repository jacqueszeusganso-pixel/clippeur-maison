// Connexions aux reseaux (YouTube, Instagram, TikTok) sans base de donnees :
// les jetons de chaque compte vivent dans un cookie httpOnly chiffre (AES-256-GCM,
// cle SESSION_KEY cote serveur). Le navigateur ne voit jamais un jeton en clair.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { findRelease, JOB_RE } from "./_gh.mjs";

export const SITE = process.env.SITE_URL || "https://clippeur-maison.vercel.app";
const YEAR = 31536000;

const key = () => createHash("sha256").update(process.env.SESSION_KEY || "").digest();
export function seal(obj) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj)), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64url");
}
export function unseal(s) {
  try {
    const b = Buffer.from(s, "base64url"), d = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString());
  } catch {
    return null;
  }
}

function cookies(req) {
  const o = {};
  for (const p of (req.headers.get("cookie") || "").split(/;\s*/)) {
    const i = p.indexOf("=");
    if (i > 0) o[p.slice(0, i)] = p.slice(i + 1);
  }
  return o;
}
const cookie = (name, val, maxAge) => `${name}=${val}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

// Un reseau est "branche" quand ses cles d'appli et la cle de session existent.
export const ready = (...vars) => !!process.env.SESSION_KEY && vars.every((v) => process.env[v]);

export function accounts(req, p) {
  const v = unseal(cookies(req)["cm_" + p] || "");
  return Array.isArray(v) ? v : [];
}
// 5 comptes max par reseau : le cookie reste sous la limite de 4 Ko
export const saveAccounts = (p, list) => cookie("cm_" + p, seal(list.slice(-5)), YEAR);
export const publicList = (list) => list.map(({ id, name, pic }) => ({ id, name, pic }));

// Les POST ne viennent que du site lui-meme (en plus de SameSite=Lax)
export const sameOrigin = (req) => req.headers.get("origin") === SITE;

// ---- OAuth : depart et retour ----
export function startAuth(p, url, job) {
  const s = randomBytes(16).toString("hex");
  const back = JOB_RE.test(job || "") ? job : "";
  return new Response(null, {
    status: 302,
    headers: { location: url(s), "set-cookie": cookie("cm_state", seal({ s, p, back, t: Date.now() }), 600) },
  });
}
export function checkState(req, p, state) {
  const st = unseal(cookies(req).cm_state || "");
  return st && st.p === p && st.s === state && Date.now() - st.t < 600_000 ? st : null;
}
export function goBack(st, p, msg, setCookies = []) {
  const h = new Headers({ location: `${SITE}/?${st?.back ? `job=${st.back}&` : ""}connect=${p}-${msg}` });
  h.append("set-cookie", cookie("cm_state", "", 0));
  for (const c of setCookies) h.append("set-cookie", c);
  return new Response(null, { status: 302, headers: h });
}

// ---- appels HTTP ----
export async function form(url, data, headers = {}) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(data) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(JSON.stringify(d).slice(0, 300));
  return d;
}
export async function getJson(url, headers = {}) {
  const r = await fetch(url, { headers });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(JSON.stringify(d).slice(0, 300));
  return d;
}

// ---- le short a publier : uniquement un fichier de la release de ce travail ----
const FILE_RE = /^(short_0[1-6]_[\w-]*|edit_0[1-6]_[a-f0-9]{8})\.mp4$/;
export async function shortAsset(job, file) {
  if (!FILE_RE.test(file || "")) return null;
  const rel = await findRelease(job);
  return rel?.assets.find((a) => a.name === file) || null;
}
export async function download(asset) {
  const r = await fetch(asset.browser_download_url);
  if (!r.ok) throw new Error("telechargement du short impossible");
  return Buffer.from(await r.arrayBuffer());
}
// Instagram va chercher la video lui-meme : on lui donne l'adresse finale (signee, 5 min)
export async function directUrl(asset) {
  const r = await fetch(asset.browser_download_url, { redirect: "manual" });
  return r.headers.get("location") || asset.browser_download_url;
}

// Texte de publication envoye par le site, nettoye
export function cleanPost(b) {
  const t = (s) => String(s || "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim();
  const title = t(b.title).slice(0, 100), caption = t(b.caption).slice(0, 1500);
  const tags = [...new Set(t(b.hashtags).match(/#[\p{L}\p{N}_]+/gu) || [])].slice(0, 15);
  if (!title) return { error: "Le titre est vide." };
  return { post: { title, caption, tags } };
}
