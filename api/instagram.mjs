// Instagram (compte professionnel) : connexion Instagram et publication en Reel.
// Publication en deux temps : Instagram telecharge et traite la video (conteneur),
// le site demande ou il en est, puis on publie.
import { json } from "./_gh.mjs";
import { SITE, ready, accounts, saveAccounts, sameOrigin, startAuth, checkState, goBack,
  form, getJson, shortAsset, directUrl, cleanPost } from "./_auth.mjs";

export const maxDuration = 60;
const ID = process.env.IG_APP_ID, SEC = process.env.IG_APP_SECRET;
const REDIR = SITE + "/api/instagram", G = "https://graph.instagram.com";
const DAY = 86400_000;

export async function GET(req) {
  const q = new URL(req.url).searchParams;
  if (q.has("connect")) {
    if (!ready("IG_APP_ID", "IG_APP_SECRET")) return json({ error: "Instagram n'est pas encore branché." }, 503);
    return startAuth("ig", (s) => "https://www.instagram.com/oauth/authorize?" + new URLSearchParams({
      client_id: ID, redirect_uri: REDIR, response_type: "code", force_reauth: "true", state: s,
      scope: "instagram_business_basic,instagram_business_content_publish",
    }), q.get("job"));
  }
  if (q.has("check")) return check(req, q);

  const st = checkState(req, "ig", q.get("state"));
  if (!st) return goBack(null, "ig", "erreur");
  if (!q.get("code")) return goBack(st, "ig", "annule");
  try {
    const short = await form("https://api.instagram.com/oauth/access_token", {
      client_id: ID, client_secret: SEC, grant_type: "authorization_code", redirect_uri: REDIR,
      code: q.get("code").replace(/#_$/, ""),
    });
    const long = await getJson(G + "/access_token?" + new URLSearchParams({
      grant_type: "ig_exchange_token", client_secret: SEC, access_token: short.access_token,
    }));
    const me = await getJson(G + "/me?fields=user_id,username,profile_picture_url&access_token=" + long.access_token);
    const id = String(me.user_id);
    const list = accounts(req, "ig").filter((a) => a.id !== id);
    list.push({ id, name: "@" + me.username, pic: me.profile_picture_url || "", t: long.access_token,
      exp: Date.now() + (long.expires_in || 60 * 86400) * 1000 });
    return goBack(st, "ig", "ok", [saveAccounts("ig", list)]);
  } catch {
    return goBack(st, "ig", "erreur");
  }
}

export async function POST(req) {
  if (!sameOrigin(req)) return json({ error: "Requête refusée." }, 403);
  const b = await req.json().catch(() => ({}));
  const list = accounts(req, "ig"), acc = list.find((a) => a.id === b.account);
  if (!acc) return json({ error: "Compte Instagram non connecté." }, 401);
  const { post, error } = cleanPost(b);
  if (error) return json({ error }, 400);
  const asset = await shortAsset(b.job, b.file);
  if (!asset) return json({ error: "Short introuvable." }, 404);

  // jeton de 60 jours : on le prolonge quand il lui reste moins d'une semaine
  const headers = new Headers();
  if (acc.exp - Date.now() < 7 * DAY) {
    const r = await getJson(G + "/refresh_access_token?grant_type=ig_refresh_token&access_token=" + acc.t).catch(() => null);
    if (!r?.access_token) return json({ error: "Connexion Instagram expirée : reconnecte le compte." }, 401);
    acc.t = r.access_token; acc.exp = Date.now() + r.expires_in * 1000;
    headers.append("set-cookie", saveAccounts("ig", list));
  }
  try {
    const c = await form(`${G}/${acc.id}/media`, {
      media_type: "REELS", video_url: await directUrl(asset), share_to_feed: "true", access_token: acc.t,
      caption: [post.title, post.caption, post.tags.join(" ")].filter(Boolean).join("\n\n"),
    });
    headers.set("cache-control", "no-store");
    return Response.json({ state: "running", check: c.id }, { status: 202, headers });
  } catch {
    return json({ error: "Instagram a refusé la vidéo (compte professionnel requis)." }, 502);
  }
}

async function check(req, q) {
  const acc = accounts(req, "ig").find((a) => a.id === q.get("account"));
  const cid = q.get("check") || "";
  if (!acc || !/^\d{5,25}$/.test(cid)) return json({ error: "Publication inconnue." }, 400);
  try {
    const s = await getJson(`${G}/${cid}?fields=status_code&access_token=${acc.t}`);
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED")
      return json({ error: "Instagram n'a pas pu traiter la vidéo." }, 502);
    if (s.status_code !== "FINISHED") return json({ state: "running" });
    const m = await form(`${G}/${acc.id}/media_publish`, { creation_id: cid, access_token: acc.t });
    const p = await getJson(`${G}/${m.id}?fields=permalink&access_token=${acc.t}`).catch(() => ({}));
    return json({ state: "done", url: p.permalink || "https://www.instagram.com/" + acc.name.slice(1) });
  } catch {
    return json({ error: "Publication Instagram impossible." }, 502);
  }
}
